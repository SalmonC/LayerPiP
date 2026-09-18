import {
  AudioPrefetchError,
  BilibiliAudioSource,
  buildSegmentTimeline,
  parseByteRange,
  parseDashAudioTrack,
} from '../src/core/AiSubtitle/BilibiliAudioSource'
import { AudioCapture } from '../src/core/AiSubtitle/AudioCapture'
import { aiSubtitles } from '../src/core/AiSubtitle/controller'
import { LocalEngine } from '../src/core/AiSubtitle/LocalEngine'
import type { AudioChunk } from '../src/core/AiSubtitle/types'

type CheckResult = { name: string; ok: boolean }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message)
}

async function rejectsAs(
  operation: Promise<unknown>,
  kind: AudioPrefetchError['kind'],
): Promise<void> {
  try {
    await operation
  } catch (error) {
    assert(error instanceof AudioPrefetchError, '错误类型不符合预期')
    assert(error.kind === kind, `错误 kind 应为 ${kind}，实际为 ${error.kind}`)
    return
  }
  throw Error(`应拒绝并返回 ${kind}`)
}

function fixtureVideo(now: () => number): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: now,
  })
  Object.defineProperty(video, 'duration', {
    configurable: true,
    value: 1569.237,
  })
  return video
}

async function fixtureBytes(
  options: RequestInit | undefined,
  ranges: Record<string, string>,
): Promise<Response> {
  const range = new Headers(options?.headers).get('Range')
  assert(range && ranges[range], `unexpected range ${range}`)
  const body = await (
    await fetch(`/${ranges[range]}`, { signal: options?.signal })
  ).arrayBuffer()
  return new Response(body, { status: 206 })
}

;(
  window as Window & { runAiPrefetchRegression?: () => Promise<unknown> }
).runAiPrefetchRegression = async () => {
  const checks: CheckResult[] = []
  const track = parseDashAudioTrack({
    code: 0,
    data: {
      dash: {
        audio: [
          { codecs: 'avc1.64001f' },
          {
            codecs: 'mp4a.40.2',
            base_url: `${location.origin}/track`,
            backup_url: [`${location.origin}/backup`],
            segment_base: {
              initialization: '0-817',
              index_range: '818-10269',
            },
          },
        ],
      },
    },
  })
  assert(track.initialization.end === 817, '初始化范围解析错误')
  assert(
    track.index.start === 818 && track.backupUrls.length === 1,
    '音轨 URL 解析错误',
  )
  checks.push({ name: 'dash-track', ok: true })

  const timeline = buildSegmentTimeline(
    {
      start: 100,
      size: 20,
      timescale: 1000,
      earliest_presentation_time: 96_000,
      first_offset: 7,
      references: [
        { referenced_size: 5, subsegment_duration: 2005 },
        { referenced_size: 8, subsegment_duration: 1995 },
      ],
    },
    818,
  )
  assert(timeline[0].byteStart === 945, 'SIDX 绝对偏移计算错误')
  assert(timeline[1].byteStart === 950, 'SIDX 连续分段偏移错误')
  assert(
    timeline[0].start === 96 && timeline[1].start === 98.005,
    'SIDX 时间轴错误',
  )
  checks.push({ name: 'sidx-offset-and-time', ok: true })

  try {
    parseByteRange('0-99999999', 'fixture', 1024)
    throw Error('过大 Range 未被拒绝')
  } catch (error) {
    assert(error instanceof AudioPrefetchError, '过大 Range 错误类型不符合预期')
    assert(error.kind === 'unsupported', '过大 Range 应为 unsupported')
  }
  checks.push({ name: 'range-limit', ok: true })

  let now = 96.1
  const ranges: Record<string, string> = {
    'bytes=0-817': 'init.mp4',
    'bytes=818-10269': 'index.bin',
    'bytes=1224926-1248964': 'segment-48.m4s',
  }
  const stoppedErrors: string[] = []
  const source = new BilibiliAudioSource({
    video: fixtureVideo(() => now),
    pageUrl: 'https://www.bilibili.com/video/BV1TZ421j7Ke',
    identity: {
      aid: '1',
      bvid: 'BV1TZ421j7Ke',
      cid: '1530196453',
      page: 1,
    },
    fetchJson: async () => ({
      code: 0,
      data: {
        dash: {
          audio: [
            {
              codecs: 'mp4a.40.2',
              base_url: `${location.origin}/track`,
              segment_base: {
                initialization: '0-817',
                index_range: '818-10269',
              },
            },
          ],
        },
      },
    }),
    fetchBytes: (_, options) => fixtureBytes(options, ranges),
    onChunk: () => {},
    onError: (message) => stoppedErrors.push(message),
  })
  await source.prepare()
  source.accepting = true
  now = 60
  let timerFired = false
  const timer = setTimeout(() => {
    timerFired = true
    source.stop()
  }, 20)
  await Promise.race([
    source.run(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Error('等待 30 秒提前量未被 stop 唤醒')), 1000),
    ),
  ])
  clearTimeout(timer)
  assert(timerFired, '等待提前量时事件循环没有让出')
  assert(stoppedErrors.length === 0, '正常取消不应报告预取失败')
  checks.push({ name: 'ahead-wait-cancel', ok: true })

  const fullTrack = new BilibiliAudioSource({
    video: fixtureVideo(() => 96.1),
    identity: {
      aid: '1',
      bvid: 'BV1TZ421j7Ke',
      cid: '1530196453',
      page: 1,
    },
    fetchJson: async () => ({
      code: 0,
      data: {
        dash: {
          audio: [
            {
              codecs: 'mp4a.40.2',
              base_url: `${location.origin}/track`,
              segment_base: {
                initialization: '0-817',
                index_range: '818-10269',
              },
            },
          ],
        },
      },
    }),
    fetchBytes: async () => new Response(new Uint8Array([1]), { status: 200 }),
    onChunk: () => {},
  })
  await rejectsAs(fullTrack.prepare(), 'unsupported')
  checks.push({ name: 'reject-full-track-response', ok: true })

  const hanging = new BilibiliAudioSource({
    video: fixtureVideo(() => 96.1),
    identity: {
      aid: '1',
      bvid: 'BV1TZ421j7Ke',
      cid: '1530196453',
      page: 1,
    },
    fetchJson: () => new Promise<never>(() => {}),
    fetchBytes: async () => new Response(new Uint8Array(), { status: 206 }),
    onChunk: () => {},
  })
  const pending = hanging.prepare()
  setTimeout(() => hanging.stop(), 20)
  await rejectsAs(pending, 'cancelled')
  checks.push({ name: 'json-cancel', ok: true })

  const originalCaptureStart = AudioCapture.prototype.start
  const originalEngineLoad = LocalEngine.prototype.load
  const originalEngineTranscribe = LocalEngine.prototype.transcribe
  const originalEngineDispose = LocalEngine.prototype.dispose
  const originalSourcePrepare = BilibiliAudioSource.prototype.prepare
  const originalSourceRun = BilibiliAudioSource.prototype.run
  let captured: AudioCapture | undefined
  let preparedPageUrl = ''
  let resolveFirst: (() => void) | undefined
  let transcribeCalls = 0
  let appended = 0
  const unhandled: string[] = []
  let releaseSpa: (() => void) | undefined
  let unbind: (() => void) | undefined
  const onUnhandled = (event: PromiseRejectionEvent) => {
    unhandled.push(String(event.reason))
    event.preventDefault()
  }
  AudioCapture.prototype.start = async function () {
    captured = this
  }
  LocalEngine.prototype.load = async function () {}
  LocalEngine.prototype.transcribe = async function () {
    transcribeCalls++
    if (transcribeCalls === 1)
      return new Promise((resolve) => {
        resolveFirst = () => resolve([{ start: 0, end: 1, text: 'stale' }])
      })
    return []
  }
  LocalEngine.prototype.dispose = function () {}
  BilibiliAudioSource.prototype.prepare = async function () {
    preparedPageUrl = (this as unknown as { pageUrl: string }).pageUrl
    this.prepared = true
  }
  BilibiliAudioSource.prototype.run = async function () {}
  const manager = {
    nowSubtitleItemsLabel: 'fixture',
    on2: () => () => {},
    beginGeneratedSubtitle: () => ({
      append: () => {
        appended++
        return true
      },
      close: () => {},
    }),
  }
  const video = document.createElement('video')
  window.addEventListener('unhandledrejection', onUnhandled)
  try {
    aiSubtitles.setEnabled(true)

    const spaLocation = {
      href: 'https://www.bilibili.com/video/BVold?p=1',
    }
    const spaDocument = { location: spaLocation } as unknown as Document
    const spaVideo = document.createElement('video')
    releaseSpa = aiSubtitles.bind(
      spaVideo,
      manager as unknown as Parameters<typeof aiSubtitles.bind>[1],
      location.origin,
      spaDocument,
    )
    spaLocation.href = 'https://www.bilibili.com/video/BVnew?p=2'
    await aiSubtitles.start()
    assert(
      preparedPageUrl === spaLocation.href,
      '复用 video 重新开始时没有读取当前页面 URL',
    )
    assert(aiSubtitles.mode === 'prefetch', '当前 B 站页面未选择预取音频源')
    aiSubtitles.stop()
    releaseSpa()
    releaseSpa = undefined
    checks.push({ name: 'spa-url-refresh', ok: true })

    unbind = aiSubtitles.bind(
      video,
      manager as unknown as Parameters<typeof aiSubtitles.bind>[1],
      location.origin,
      document,
    )
    await aiSubtitles.startRealtime()
    assert(captured, 'controller 未创建实时采集源')
    const callbacks = captured as unknown as {
      onChunk: (chunk: AudioChunk) => void
    }
    const chunk = (start: number): AudioChunk => ({
      pcm: new Float32Array(16_000),
      start,
      end: start + 1,
    })
    callbacks.onChunk(chunk(0))
    callbacks.onChunk(chunk(1))
    callbacks.onChunk(chunk(2))
    await new Promise((resolve) => setTimeout(resolve, 20))
    resolveFirst?.()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert(unhandled.length === 0, 'controller 产生了未处理的积压 Promise 拒绝')
    assert(appended === 0, '停止后仍追加了旧转写结果')
    assert(
      !aiSubtitles.running && aiSubtitles.phase === 'error',
      '积压后 controller 未停止',
    )
  } finally {
    window.removeEventListener('unhandledrejection', onUnhandled)
    aiSubtitles.setEnabled(false)
    unbind?.()
    releaseSpa?.()
    AudioCapture.prototype.start = originalCaptureStart
    LocalEngine.prototype.load = originalEngineLoad
    LocalEngine.prototype.transcribe = originalEngineTranscribe
    LocalEngine.prototype.dispose = originalEngineDispose
    BilibiliAudioSource.prototype.prepare = originalSourcePrepare
    BilibiliAudioSource.prototype.run = originalSourceRun
  }
  checks.push({ name: 'controller-queue-cancel', ok: true })

  return { checks }
}
