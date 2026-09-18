import { makeObservable, observable, reaction, runInAction } from 'mobx'
import type SubtitleManager from '../SubtitleManager'
import { AudioCapture } from './AudioCapture'
import { AudioPrefetchError, BilibiliAudioSource } from './BilibiliAudioSource'
import { LocalEngine } from './LocalEngine'
import {
  bundledModelStore,
  type AudioChunk,
  type TranscriptionEngine,
} from './types'

type Phase = 'idle' | 'loading' | 'listening' | 'transcribing' | 'error'
type StartMode = 'auto' | 'realtime'
type PendingChunk = {
  chunk: AudioChunk
  resolve: () => void
  reject: (error: Error) => void
}
type AudioSource = { accepting: boolean; stop: () => void }
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  )

/** Runtime-only singleton for the active provider. It never writes settings or video state. */
class AiSubtitleController {
  enabled = false
  available = false
  phase: Phase = 'idle'
  message = '打开小窗后可开始本地识别'
  generated = 0
  realtimeFallback = false
  mode: 'none' | 'prefetch' | 'realtime' = 'none'
  readonly model = bundledModelStore.resolve()
  private binding?: {
    video: HTMLVideoElement
    manager: SubtitleManager
    frameUrl: string
    document: Document
    pageUrl: string
  }
  private engine?: TranscriptionEngine
  private capture?: AudioCapture
  private source?: AudioSource
  private writer?: ReturnType<SubtitleManager['beginGeneratedSubtitle']>
  private epoch = 0
  private bindingId = 0
  private busy = false
  private pending?: PendingChunk
  private selecting = false
  private finishing = false

  constructor() {
    makeObservable(this, {
      enabled: observable,
      available: observable,
      phase: observable,
      message: observable,
      generated: observable,
      realtimeFallback: observable,
      mode: observable,
    })
  }
  get running() {
    return (
      this.phase === 'loading' ||
      this.phase === 'listening' ||
      this.phase === 'transcribing'
    )
  }
  setEnabled(enabled: boolean) {
    runInAction(() => {
      this.enabled = enabled
    })
    if (!enabled) this.stop('本地 AI 字幕已关闭')
  }
  bind(
    video: HTMLVideoElement,
    manager: SubtitleManager,
    frameUrl: string,
    hostDocument: Document,
  ) {
    this.stop('点击开始，将从当前播放位置识别')
    const id = ++this.bindingId
    this.binding = {
      video,
      manager,
      frameUrl,
      document: hostDocument,
      pageUrl: hostDocument.location?.href ?? location.href,
    }
    runInAction(() => {
      this.available = true
    })
    const invalidate = () => this.stop('视频已跳转或变更，请重新开始识别')
    const rate = () => {
      if (video.playbackRate !== 1)
        this.stop('首版只支持 1 倍速，恢复后可重新开始')
    }
    const reset = manager.on2('reset', invalidate)
    const selection = reaction(
      () => manager.nowSubtitleItemsLabel,
      () => {
        if (this.running && !this.selecting)
          this.stop('已切换字幕来源，本地识别已停止')
      },
    )
    for (const name of ['seeking', 'emptied', 'loadstart'])
      video.addEventListener(name, invalidate)
    video.addEventListener('ratechange', rate)
    return () => {
      reset()
      selection()
      for (const name of ['seeking', 'emptied', 'loadstart'])
        video.removeEventListener(name, invalidate)
      video.removeEventListener('ratechange', rate)
      if (id !== this.bindingId) return
      this.stop('打开小窗后可开始本地识别')
      this.binding = undefined
      runInAction(() => {
        this.available = false
      })
    }
  }
  async start(mode: StartMode = 'auto') {
    if (!this.enabled || !this.binding || this.running) return
    const binding = this.binding
    const pageUrl = binding.document.location?.href || binding.pageUrl
    const isBilibiliPrefetch = mode === 'auto' && this.isBilibiliPage(pageUrl)
    if (binding.video.playbackRate !== 1) {
      this.stop('首版只支持 1 倍速，恢复后可重新开始')
      runInAction(() => {
        this.phase = 'error'
      })
      return
    }
    this.stop('正在准备本地模型…')
    const epoch = this.epoch
    runInAction(() => {
      this.phase = 'loading'
      this.generated = 0
      this.mode = 'none'
      this.realtimeFallback = false
    })
    try {
      if (isBilibiliPrefetch) {
        const source = new BilibiliAudioSource({
          video: binding.video,
          pageUrl,
          onChunk: (chunk) => {
            if (epoch !== this.epoch) return undefined
            return this.enqueue(chunk, epoch).catch((error) => {
              if (epoch === this.epoch)
                this.fail(
                  error instanceof Error
                    ? error.message
                    : '本地识别处理失败，请重试',
                  true,
                )
            })
          },
          onError: (message) => {
            if (epoch === this.epoch) this.fail(message, true)
          },
          onEnded: () => {
            if (epoch !== this.epoch) return
            this.finishing = true
            this.source?.stop()
            if (!this.busy && !this.pending)
              this.stop('本段识别完成，可回看已生成字幕')
          },
        })
        this.source = source
        await source.prepare()
        if (epoch !== this.epoch) return
        const engine = new LocalEngine(binding.frameUrl, binding.document)
        this.engine = engine
        await engine.load()
        if (epoch !== this.epoch) return
        this.selecting = true
        try {
          this.writer = binding.manager.beginGeneratedSubtitle()
        } finally {
          this.selecting = false
        }
        source.accepting = true
        runInAction(() => {
          this.mode = 'prefetch'
          this.phase = 'listening'
          this.message =
            '正在提前识别 · 最多保持 30 秒余量，结果按原视频时间归位'
        })
        void source.run()
        return
      }
      const capture = new AudioCapture(
        binding.video,
        (chunk) => {
          if (epoch !== this.epoch) return
          void this.enqueue(chunk, epoch).catch((error) => {
            if (epoch === this.epoch)
              this.fail(
                error instanceof Error
                  ? error.message
                  : '本地识别处理失败，请重试',
              )
          })
        },
        (message) => {
          if (epoch === this.epoch) this.fail(message)
        },
        () => {
          if (epoch !== this.epoch) return
          this.finishing = true
          this.capture?.stop()
          if (!this.busy && !this.pending)
            this.stop('本段识别完成，可回看已生成字幕')
        },
      )
      this.capture = capture
      this.source = capture
      // Start/resume audio inside the click's user activation, before any await.
      const audioReady = capture.start()
      const engine = new LocalEngine(binding.frameUrl, binding.document)
      this.engine = engine
      await Promise.all([audioReady, engine.load()])
      if (epoch !== this.epoch) return
      this.selecting = true
      try {
        this.writer = binding.manager.beginGeneratedSubtitle()
      } finally {
        this.selecting = false
      }
      capture.accepting = true
      runInAction(() => {
        this.mode = 'realtime'
        this.phase = 'listening'
        this.message = '正在监听 · 每约 8 秒识别一段，结果可在历史字幕中回看'
      })
    } catch (error) {
      if (epoch !== this.epoch) return
      const message =
        error instanceof Error ? error.message : '本地识别启动失败'
      this.fail(message, error instanceof AudioPrefetchError)
    }
  }
  async startRealtime() {
    return this.start('realtime')
  }
  private isBilibiliPage(pageUrl: string) {
    try {
      const host = new URL(pageUrl).hostname.toLowerCase()
      return host === 'bilibili.com' || host.endsWith('.bilibili.com')
    } catch {
      return false
    }
  }
  private enqueue(chunk: AudioChunk, epoch: number): Promise<void> {
    if (epoch !== this.epoch) return Promise.resolve()
    if (this.busy) {
      if (this.pending) {
        return Promise.reject(Error('本机识别持续落后，已停止 AI；可重新开始'))
      }
      return new Promise((resolve, reject) => {
        this.pending = { chunk, resolve, reject }
      })
    }
    return this.process(chunk, epoch)
  }
  private async process(chunk: AudioChunk, epoch: number) {
    if (epoch !== this.epoch || !this.engine) return
    this.busy = true
    runInAction(() => {
      this.phase = 'transcribing'
      this.message = '正在本地识别，视频继续播放…'
    })
    try {
      const segments = await this.engine.transcribe(chunk.pcm)
      if (epoch !== this.epoch) return
      const rows = segments
        .filter(
          (segment) =>
            Number.isFinite(segment.start) &&
            Number.isFinite(segment.end) &&
            typeof segment.text === 'string',
        )
        .map((segment, i) => {
          const text = segment.text.trim().slice(0, 2000)
          return {
            id: `ai-${epoch}-${chunk.start}-${i}`,
            startTime: Math.max(chunk.start, chunk.start + segment.start),
            endTime: Math.min(chunk.end, chunk.start + segment.end),
            text,
            htmlText: escape(text),
          }
        })
        .filter((row) => row.text && row.endTime > row.startTime)
      if (rows.length && !this.writer?.append(rows)) {
        this.stop('字幕来源已变更，请重新开始')
        return
      }
      runInAction(() => {
        this.generated += rows.length
      })
    } catch (error) {
      if (epoch === this.epoch)
        this.fail(
          error instanceof Error ? error.message : '本地识别失败，请重试',
        )
    } finally {
      if (epoch === this.epoch) {
        this.busy = false
        const next = this.pending
        this.pending = undefined
        if (next)
          void this.process(next.chunk, epoch).then(next.resolve, next.reject)
        else if (this.finishing) this.stop('本段识别完成，可回看已生成字幕')
        else
          runInAction(() => {
            this.phase = 'listening'
            this.message =
              this.mode === 'prefetch'
                ? `正在提前识别 · 本次已生成 ${this.generated} 段字幕`
                : `正在监听 · 本次已生成 ${this.generated} 段字幕`
          })
      }
    }
  }
  private fail(message: string, realtimeFallback = false) {
    const display =
      realtimeFallback && !message.includes('实时识别')
        ? `${message}；可点击“实时识别”继续`
        : message
    this.stop(display)
    runInAction(() => {
      this.phase = 'error'
      this.realtimeFallback = realtimeFallback
    })
  }
  stop(message = '识别已停止，已生成字幕仍可回看') {
    this.epoch++
    const safely = (release: () => void) => {
      try {
        release()
      } catch (error) {
        console.warn('AI 资源清理失败', error)
      }
    }
    safely(() => this.capture?.stop())
    this.capture = undefined
    safely(() => this.source?.stop())
    this.source = undefined
    safely(() => this.engine?.dispose())
    this.engine = undefined
    safely(() => this.writer?.close())
    this.writer = undefined
    const pending = this.pending
    this.pending = undefined
    pending?.reject(Error('识别已停止'))
    this.busy = false
    this.finishing = false
    runInAction(() => {
      this.phase = 'idle'
      this.message = message
      this.mode = 'none'
      this.realtimeFallback = false
    })
  }
}
export const aiSubtitles = new AiSubtitleController()
