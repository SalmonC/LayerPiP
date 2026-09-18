import bgFetch from '@root/utils/bgFetch'
import { resolveCurrentBilibiliIdentity } from '@root/core/SubtitleSource/bilibili'
import type { BilibiliVideoIdentity } from '@root/core/SubtitleSource/types'
import type { AudioChunk } from './types'

/** The prefetcher deliberately keeps the work in the user initiated session. */
export const MAX_PREFETCH_AHEAD_SECONDS = 30
export const PREFETCH_CHUNK_TARGET_SECONDS = 7
export const PREFETCH_CHUNK_MAX_SECONDS = 8

const MAX_INIT_BYTES = 4 * 1024 * 1024
const MAX_INDEX_BYTES = 8 * 1024 * 1024
const MAX_SEGMENT_BYTES = 4 * 1024 * 1024
const MAX_SEGMENTS = 20_000
const MAX_AUDIO_CHANNELS = 8
const MIN_AUDIO_SAMPLE_RATE = 8_000
const MAX_AUDIO_SAMPLE_RATE = 96_000
const MAX_URL_LENGTH = 16_384
const MIN_PCM_SAMPLES = 16_000
const RANGE_TIMEOUT_MS = 15_000
const JSON_TIMEOUT_MS = 15_000

export type ByteRange = { start: number; end: number }

export type DashAudioTrack = {
  url: string
  backupUrls: string[]
  codec: 'mp4a.40.2'
  initialization: ByteRange
  index: ByteRange
}

export type AudioSegmentIndex = {
  index: number
  start: number
  end: number
  byteStart: number
  byteEnd: number
}

type FetchJson = (url: string, options?: RequestInit) => Promise<unknown>
type FetchBytes = (url: string, options: RequestInit) => Promise<Response>

type Mp4BoxBuffer = ArrayBuffer & { fileStart: number }
type Mp4Sample = {
  cts: number
  dts: number
  duration: number
  data?: Uint8Array
  description?: unknown
  is_sync?: boolean
  timescale: number
  size: number
}
type Mp4TrackInfo = {
  id: number
  codec?: string
  type?: string
  timescale?: number
  audio?: { sample_rate?: number; channel_count?: number }
}
type Mp4MovieInfo = { tracks?: Mp4TrackInfo[] }
type PreparedTrackInfo = Mp4TrackInfo & {
  id: number
  timescale: number
  audio: { sample_rate: number; channel_count: number }
}
type Mp4Sidx = {
  start?: number
  size?: number
  timescale?: number
  earliest_presentation_time?: number
  first_offset?: number
  references?: Array<{
    reference_type?: number
    referenced_size?: number
    subsegment_duration?: number
  }>
}
type Mp4File = {
  onReady?: (info: Mp4MovieInfo) => void
  onSidx?: (sidx: Mp4Sidx) => void
  onSamples?: (id: number, user: unknown, samples: Mp4Sample[]) => void
  onError?: (module: string, message: string) => void
  appendBuffer(buffer: Mp4BoxBuffer): number | undefined
  flush(): void
  setExtractionOptions(
    id: number,
    user?: unknown,
    options?: { nbSamples?: number },
  ): void
  start(): void
}
type Mp4Factory = (keepMdatData?: boolean) => Mp4File

type AudioDecoderConfig = {
  codec: string
  sampleRate: number
  numberOfChannels: number
  description: ArrayBuffer
}
type EncodedAudioChunkInit = {
  type: 'key' | 'delta'
  timestamp: number
  duration?: number
  data: BufferSource
}
type EncodedAudioChunkLike = { timestamp: number }
type EncodedAudioChunkConstructor = new (
  init: EncodedAudioChunkInit,
) => EncodedAudioChunkLike
type AudioDataLike = {
  format: AudioSampleFormat | null
  sampleRate: number
  numberOfFrames: number
  numberOfChannels: number
  timestamp: number
  copyTo(
    destination: AllowSharedBufferSource,
    options: { planeIndex: number; format?: AudioSampleFormat },
  ): void
  close(): void
}
type AudioDecoderLike = {
  decodeQueueSize: number
  configure(config: AudioDecoderConfig): void
  decode(chunk: EncodedAudioChunkLike): void
  flush(): Promise<void>
  close(): void
}
type AudioDecoderConstructor = {
  new (init: {
    output: (data: AudioDataLike) => void
    error: (error: unknown) => void
  }): AudioDecoderLike
  isConfigSupported(
    config: AudioDecoderConfig,
  ): Promise<{ supported?: boolean }>
}

type CodecGlobals = typeof globalThis & {
  AudioDecoder?: AudioDecoderConstructor
  EncodedAudioChunk?: EncodedAudioChunkConstructor
}

type PreparedSegment = { metadata: AudioSegmentIndex; samples: Mp4Sample[] }
type DecodedPcm = { pcm: Float32Array; start: number; end: number }

export type BilibiliAudioSourceOptions = {
  video: HTMLVideoElement
  pageUrl?: string
  identity?: BilibiliVideoIdentity
  fetchJson?: FetchJson
  fetchBytes?: FetchBytes
  onChunk: (chunk: AudioChunk) => void | Promise<void>
  onError?: (message: string) => void
  onEnded?: () => void
}

/** Errors are intentionally user-facing and never include signed CDN URLs. */
export class AudioPrefetchError extends Error {
  readonly kind: 'unsupported' | 'request' | 'decode' | 'cancelled'

  constructor(kind: AudioPrefetchError['kind'], message: string) {
    super(message)
    this.name = 'AudioPrefetchError'
    this.kind = kind
  }
}

export function parseByteRange(
  value: unknown,
  label: string,
  maximum: number,
): ByteRange {
  if (typeof value !== 'string')
    throw new AudioPrefetchError('unsupported', `${label}缺少有效的字节范围`)
  const match = value.trim().match(/^(\d+)-(\d+)$/)
  if (!match) throw new AudioPrefetchError('unsupported', `${label}格式无效`)
  const start = Number(match[1])
  const end = Number(match[2])
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start
  )
    throw new AudioPrefetchError('unsupported', `${label}超出可处理范围`)
  const size = end - start + 1
  if (!Number.isSafeInteger(size) || size > maximum)
    throw new AudioPrefetchError('unsupported', `${label}过大，已停止提前识别`)
  return { start, end }
}

function normalizeHttpUrl(value: unknown, label: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  if (value.length > MAX_URL_LENGTH)
    throw new AudioPrefetchError('unsupported', `${label}地址过长`)
  let url: URL
  try {
    url = new URL(value.trim(), 'https://www.bilibili.com')
  } catch {
    throw new AudioPrefetchError('unsupported', `${label}地址无效`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new AudioPrefetchError('unsupported', `${label}地址协议不受支持`)
  return url.href
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readSegmentBase(value: any) {
  return value?.segment_base ?? value?.segmentBase ?? value?.SegmentBase
}

function readBaseUrls(value: any): string[] {
  const result: string[] = []
  for (const raw of [value?.base_url, value?.baseUrl, value?.BaseURL]) {
    const normalized = normalizeHttpUrl(raw, '音轨')
    if (normalized) result.push(normalized)
  }
  for (const raw of [value?.backup_url, value?.backupUrl, value?.BackupURL]) {
    for (const item of Array.isArray(raw) ? raw : [raw]) {
      const normalized = normalizeHttpUrl(item, '音轨备用')
      if (normalized) result.push(normalized)
    }
  }
  return [...new Set(result)]
}

/** Selects only the AAC-LC DASH track; arbitrary codecs are never sent to WebCodecs. */
export function parseDashAudioTrack(response: unknown): DashAudioTrack {
  const root = response as any
  if (root?.code !== undefined && Number(root.code) !== 0)
    throw new AudioPrefetchError(
      'request',
      'B 站音轨接口返回失败；可稍后重试或改用实时识别',
    )
  const data = root?.data ?? root
  const tracks = readArray(data?.dash?.audio ?? data?.audio)
  if (!tracks.length)
    throw new AudioPrefetchError(
      'unsupported',
      '当前 B 站视频没有可提前读取的 DASH 音轨',
    )

  for (const track of tracks) {
    const candidate =
      track && typeof track === 'object'
        ? (track as { codecs?: unknown; codec?: unknown })
        : undefined
    const codec = String(
      candidate?.codecs ?? candidate?.codec ?? '',
    ).toLowerCase()
    if (codec !== 'mp4a.40.2') continue
    const urls = readBaseUrls(track)
    if (!urls.length) continue
    const segmentBase = readSegmentBase(track)
    if (!segmentBase) continue
    return {
      url: urls[0],
      backupUrls: urls.slice(1, 3),
      codec: 'mp4a.40.2',
      initialization: parseByteRange(
        segmentBase.initialization,
        '音轨初始化段',
        MAX_INIT_BYTES,
      ),
      index: parseByteRange(
        segmentBase.index_range ?? segmentBase.indexRange,
        '音轨索引段',
        MAX_INDEX_BYTES,
      ),
    }
  }
  throw new AudioPrefetchError(
    'unsupported',
    '当前 B 站音轨不是支持的 AAC-LC DASH 分段',
  )
}

function safeInteger(value: unknown, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0)
    throw new AudioPrefetchError('unsupported', `${label}超出可处理范围`)
  return number
}

/** Converts an MP4Box SIDX object into absolute byte ranges and media-time ranges. */
export function buildSegmentTimeline(
  sidx: Mp4Sidx,
  indexRangeStart: number,
): AudioSegmentIndex[] {
  const rangeStart = safeInteger(indexRangeStart, '索引范围起点')
  const timescale = safeInteger(sidx.timescale, 'SIDX 时间刻度')
  if (timescale < 1 || timescale > 10_000_000)
    throw new AudioPrefetchError('unsupported', '音轨时间刻度无效')
  const references = sidx.references
  if (
    !Array.isArray(references) ||
    references.length === 0 ||
    references.length > MAX_SEGMENTS
  )
    throw new AudioPrefetchError('unsupported', '音轨没有可用的分段索引')
  const sidxStart = safeInteger(sidx.start, 'SIDX 起点')
  const sidxSize = safeInteger(sidx.size, 'SIDX 大小')
  const firstOffset = safeInteger(sidx.first_offset, 'SIDX 偏移')
  const earliest = Number(sidx.earliest_presentation_time ?? 0)
  if (!Number.isSafeInteger(earliest))
    throw new AudioPrefetchError('unsupported', '音轨起始时间无效')
  let byteStart = rangeStart + sidxStart + sidxSize + firstOffset
  let mediaTime = earliest / timescale
  if (!Number.isSafeInteger(byteStart) || byteStart < 0)
    throw new AudioPrefetchError('unsupported', '音轨分段偏移无效')

  return references.map((reference, index) => {
    if (Number(reference.reference_type ?? 0) !== 0)
      throw new AudioPrefetchError(
        'unsupported',
        '音轨包含嵌套索引，暂不能提前读取',
      )
    const size = safeInteger(reference.referenced_size, '音频分段大小')
    const duration = Number(reference.subsegment_duration)
    if (size < 1 || !Number.isSafeInteger(duration) || duration < 1)
      throw new AudioPrefetchError('unsupported', '音频分段索引无效')
    const end = byteStart + size - 1
    const seconds = duration / timescale
    if (
      !Number.isSafeInteger(end) ||
      end < byteStart ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      throw new AudioPrefetchError('unsupported', '音频分段范围无效')
    const segmentEnd = mediaTime + seconds
    if (!Number.isFinite(segmentEnd) || segmentEnd <= mediaTime)
      throw new AudioPrefetchError('unsupported', '音频分段时间无效')
    const segment = {
      index,
      start: mediaTime,
      end: segmentEnd,
      byteStart,
      byteEnd: end,
    }
    byteStart = end + 1
    mediaTime = segment.end
    return segment
  })
}

export function buildBilibiliPlayUrl(identity: BilibiliVideoIdentity): string {
  const url = new URL('https://api.bilibili.com/x/player/playurl')
  if (identity.bvid) url.searchParams.set('bvid', identity.bvid)
  else url.searchParams.set('avid', identity.aid)
  url.searchParams.set('cid', identity.cid)
  url.searchParams.set('fnval', '16')
  url.searchParams.set('fnver', '0')
  url.searchParams.set('fourk', '0')
  return url.href
}

function abortError(signal: AbortSignal): AudioPrefetchError {
  return new AudioPrefetchError(
    'cancelled',
    signal.reason instanceof Error ? signal.reason.message : '提前识别已停止',
  )
}

/** Bounds bridge requests that cannot reliably carry an AbortSignal. */
function withDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      void operation.catch(() => {})
      reject(abortError(signal))
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new AudioPrefetchError('request', timeoutMessage))
    }, JSON_TIMEOUT_MS)
    const abort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(abortError(signal))
    }
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
    signal.addEventListener('abort', abort, { once: true })
    operation.then(
      (value) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      },
    )
  })
}

/** Makes a fetch body read wake when its request is aborted. */
function withAbortSignal<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      void operation.catch(() => {})
      reject(Error('请求已中止'))
      return
    }
    let settled = false
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(Error('请求已中止'))
    }
    signal.addEventListener('abort', abort, { once: true })
    operation.then(
      (value) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      },
    )
  })
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  try {
    void body?.cancel().catch(() => {})
  } catch {
    /* response already closed */
  }
}

function asMp4Buffer(bytes: ArrayBuffer, fileStart: number): Mp4BoxBuffer {
  const buffer = bytes.slice(0) as Mp4BoxBuffer
  buffer.fileStart = fileStart
  return buffer
}

function mp4Error(module: string, message: string): AudioPrefetchError {
  return new AudioPrefetchError(
    'decode',
    `音频分段解析失败${module ? `（${module}）` : ''}：${message || '未知错误'}`,
  )
}

function readIsoBox(
  view: DataView,
  offset: number,
  limit: number,
): { type: string; contentStart: number; end: number } {
  if (offset + 8 > limit)
    throw new AudioPrefetchError('decode', 'MP4 Box 头不完整')
  const size32 = view.getUint32(offset)
  const type = String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7),
  )
  let header = 8
  let size = size32
  if (size32 === 1) {
    if (offset + 16 > limit)
      throw new AudioPrefetchError('decode', 'MP4 扩展 Box 头不完整')
    size = Number(view.getBigUint64(offset + 8))
    header = 16
  } else if (size32 === 0) {
    size = limit - offset
  }
  if (!Number.isSafeInteger(size) || size < header || offset + size > limit)
    throw new AudioPrefetchError('decode', 'MP4 Box 范围无效')
  return { type, contentStart: offset + header, end: offset + size }
}

/**
 * Each independent media Range is parsed with a fresh MP4Box file whose
 * offsets are synthetic. Absolute tfhd base_data_offset values would point
 * outside that synthetic file and can silently decode the wrong bytes, so
 * reject them before handing the segment to MP4Box.
 */
function assertRelativeMediaOffsets(media: ArrayBuffer): void {
  const view = new DataView(media)
  let moofCount = 0
  let tfhdCount = 0
  const walk = (start: number, limit: number, parent?: string) => {
    let offset = start
    while (offset < limit) {
      const box = readIsoBox(view, offset, limit)
      if (box.type === 'moof') {
        moofCount++
        walk(box.contentStart, box.end, box.type)
      } else if (box.type === 'traf' && parent === 'moof') {
        walk(box.contentStart, box.end, box.type)
      } else if (box.type === 'tfhd' && parent === 'traf') {
        if (box.contentStart + 4 > box.end)
          throw new AudioPrefetchError('decode', 'MP4 tfhd 不完整')
        const flags =
          (view.getUint8(box.contentStart + 1) << 16) |
          (view.getUint8(box.contentStart + 2) << 8) |
          view.getUint8(box.contentStart + 3)
        tfhdCount++
        if (flags & 0x000001)
          throw new AudioPrefetchError(
            'unsupported',
            '音频分段使用绝对 base_data_offset，暂不能安全提前读取',
          )
        if (!(flags & 0x020000))
          throw new AudioPrefetchError(
            'unsupported',
            '音频分段未声明相对 moof 偏移，暂不能安全提前读取',
          )
      }
      offset = box.end
    }
  }
  walk(0, view.byteLength)
  if (!moofCount || !tfhdCount)
    throw new AudioPrefetchError('decode', '音频分段缺少可验证的 moof/tfhd')
}

async function loadMp4Factory(): Promise<Mp4Factory> {
  const module = await import('mp4box')
  return module.createFile as unknown as Mp4Factory
}

async function parseInitInfo(
  factory: Mp4Factory,
  init: ArrayBuffer,
): Promise<PreparedTrackInfo> {
  return new Promise((resolve, reject) => {
    const file = factory(true)
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(
        error instanceof AudioPrefetchError
          ? error
          : mp4Error(
              '',
              error instanceof Error ? error.message : '初始化段无效',
            ),
      )
    }
    file.onError = (module, message) => fail(mp4Error(module, message))
    file.onReady = (info) => {
      const track = info.tracks?.find(
        (candidate) => candidate.type === 'audio' || candidate.audio,
      )
      if (!track) {
        fail(new AudioPrefetchError('unsupported', '初始化段没有音频轨道'))
        return
      }
      if (String(track.codec ?? '').toLowerCase() !== 'mp4a.40.2') {
        fail(new AudioPrefetchError('unsupported', '音轨编码不是支持的 AAC-LC'))
        return
      }
      const trackId = Number(track.id)
      const timescale = Number(track.timescale)
      if (
        !Number.isSafeInteger(trackId) ||
        trackId < 1 ||
        !Number.isSafeInteger(timescale) ||
        timescale < 1
      ) {
        fail(new AudioPrefetchError('decode', '音轨时间信息无效'))
        return
      }
      const sampleRate = Number(track.audio?.sample_rate)
      const channels = Number(track.audio?.channel_count)
      if (
        !Number.isInteger(sampleRate) ||
        sampleRate < MIN_AUDIO_SAMPLE_RATE ||
        sampleRate > MAX_AUDIO_SAMPLE_RATE ||
        !Number.isInteger(channels) ||
        channels < 1 ||
        channels > MAX_AUDIO_CHANNELS
      ) {
        fail(
          new AudioPrefetchError('unsupported', '音轨采样率或声道数不受支持'),
        )
        return
      }
      settled = true
      resolve({
        ...track,
        id: trackId,
        timescale,
        audio: { sample_rate: sampleRate, channel_count: channels },
      })
    }
    try {
      file.appendBuffer(asMp4Buffer(init, 0))
      if (!settled) file.flush()
      if (!settled)
        fail(new AudioPrefetchError('decode', '初始化段没有完整的 MP4 元数据'))
    } catch (error) {
      fail(error)
    }
  })
}

async function parseSidx(
  factory: Mp4Factory,
  index: ArrayBuffer,
  indexRangeStart: number,
): Promise<AudioSegmentIndex[]> {
  return new Promise((resolve, reject) => {
    const file = factory(true)
    let result: AudioSegmentIndex[] | undefined
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(
        error instanceof AudioPrefetchError
          ? error
          : mp4Error(
              'SIDX',
              error instanceof Error ? error.message : '索引无效',
            ),
      )
    }
    file.onError = (module, message) => fail(mp4Error(module, message))
    file.onSidx = (sidx) => {
      if (result) return
      try {
        result = buildSegmentTimeline(sidx, indexRangeStart)
      } catch (error) {
        fail(error)
      }
    }
    try {
      file.appendBuffer(asMp4Buffer(index, 0))
      if (!result) file.flush()
      if (result) {
        settled = true
        resolve(result)
      } else fail(new AudioPrefetchError('decode', '索引段没有 SIDX'))
    } catch (error) {
      fail(error)
    }
  })
}

async function parseSegmentSamples(
  factory: Mp4Factory,
  init: ArrayBuffer,
  media: ArrayBuffer,
  trackId: number,
): Promise<Mp4Sample[]> {
  assertRelativeMediaOffsets(media)
  return new Promise((resolve, reject) => {
    const file = factory(true)
    let samples: Mp4Sample[] = []
    let ready = false
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(
        error instanceof AudioPrefetchError
          ? error
          : mp4Error(
              '',
              error instanceof Error ? error.message : '音频样本无效',
            ),
      )
    }
    file.onError = (module, message) => fail(mp4Error(module, message))
    file.onReady = (info) => {
      const track = info.tracks?.find((candidate) => candidate.id === trackId)
      if (!track) {
        fail(new AudioPrefetchError('decode', '分段轨道与初始化段不一致'))
        return
      }
      try {
        file.setExtractionOptions(track.id, undefined, { nbSamples: 4096 })
        file.start()
        ready = true
      } catch (error) {
        fail(error)
      }
    }
    file.onSamples = (id, _user, extracted) => {
      if (id === trackId) samples = samples.concat(extracted)
    }
    try {
      file.appendBuffer(asMp4Buffer(init, 0))
      file.appendBuffer(asMp4Buffer(media, init.byteLength))
      file.flush()
      if (!ready) {
        fail(new AudioPrefetchError('decode', '音频分段缺少初始化元数据'))
        return
      }
      if (!samples.length) {
        fail(new AudioPrefetchError('decode', '音频分段没有可解码样本'))
        return
      }
      if (samples.length > 8192) {
        fail(new AudioPrefetchError('unsupported', '单个音频分段过长'))
        return
      }
      settled = true
      resolve(samples)
    } catch (error) {
      fail(error)
    }
  })
}

function extractDecoderDescription(sample: Mp4Sample): ArrayBuffer {
  const entry = sample.description as any
  const esds =
    entry?.esds ??
    entry?.wave?.esds ??
    entry?.boxes?.find((box: any) => box?.type === 'esds')
  const descriptors = esds?.esd?.descs
  const decoderConfig = Array.isArray(descriptors)
    ? descriptors.find((descriptor: any) => descriptor?.tag === 4)
    : undefined
  const specific = decoderConfig?.descs?.find(
    (descriptor: any) => descriptor?.tag === 5,
  )
  const data = specific?.data
  if (
    !(data instanceof Uint8Array) ||
    data.byteLength < 2 ||
    data.byteLength > 256
  )
    throw new AudioPrefetchError(
      'unsupported',
      'AAC 音轨缺少有效的 DecoderSpecificInfo',
    )
  return data.slice().buffer
}

function audioDataToMono(data: AudioDataLike): Float32Array {
  const frames = Number(data.numberOfFrames)
  const channels = Number(data.numberOfChannels)
  const sampleRate = Number(data.sampleRate)
  if (
    !Number.isInteger(frames) ||
    frames < 1 ||
    frames > 16000 * 12 ||
    !Number.isInteger(channels) ||
    channels < 1 ||
    channels > MAX_AUDIO_CHANNELS ||
    !Number.isInteger(sampleRate) ||
    sampleRate < MIN_AUDIO_SAMPLE_RATE ||
    sampleRate > MAX_AUDIO_SAMPLE_RATE
  )
    throw new AudioPrefetchError('decode', 'WebCodecs 返回了无效音频帧')
  if (!data.format)
    throw new AudioPrefetchError('decode', 'WebCodecs 返回了无效音频格式')
  const planes: Float32Array[] = []
  for (let channel = 0; channel < channels; channel++) {
    const plane = new Float32Array(frames)
    data.copyTo(plane, { format: 'f32-planar', planeIndex: channel })
    planes.push(plane)
  }
  const mono = new Float32Array(frames)
  for (let frame = 0; frame < frames; frame++) {
    let total = 0
    for (let channel = 0; channel < channels; channel++) {
      const value = planes[channel][frame]
      if (!Number.isFinite(value))
        throw new AudioPrefetchError('decode', 'WebCodecs 返回了非有限音频样本')
      total += value
    }
    mono[frame] = Math.max(-1, Math.min(1, total / channels))
  }
  return resample(mono, sampleRate)
}

function resample(input: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16_000) return input
  const length = Math.max(1, Math.round((input.length * 16_000) / sampleRate))
  const output = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const position = (i * sampleRate) / 16_000
    const low = Math.floor(position)
    const fraction = position - low
    output[i] =
      (input[low] ?? 0) * (1 - fraction) +
      (input[Math.min(low + 1, input.length - 1)] ?? 0) * fraction
  }
  return output
}

function isAbort(error: unknown): boolean {
  return error instanceof AudioPrefetchError && error.kind === 'cancelled'
}

/**
 * A bounded, pull-driven Bilibili DASH audio source. It never touches the
 * actual video source or its volume; it only emits decoded PCM copies.
 */
export class BilibiliAudioSource {
  accepting = false
  prepared = false
  identity?: BilibiliVideoIdentity
  private readonly video: HTMLVideoElement
  private readonly pageUrl: string
  private readonly resolveIdentity: () => Promise<BilibiliVideoIdentity>
  private readonly fetchJson: FetchJson
  private readonly fetchBytes: FetchBytes
  private readonly onChunk: BilibiliAudioSourceOptions['onChunk']
  private readonly onError?: (message: string) => void
  private readonly onEnded?: () => void
  private readonly abortController = new AbortController()
  private readonly audioUrls: string[] = []
  private factory?: Mp4Factory
  private initBytes?: ArrayBuffer
  private index?: AudioSegmentIndex[]
  private track?: PreparedTrackInfo
  private first?: PreparedSegment
  private decoder?: AudioDecoderLike
  private decoderError?: Error
  private outputParts?: DecodedPcm[]
  private outputCursor = 0
  private batchParts: Float32Array[] = []
  private batchSamples = 0
  private batchStart = 0
  private nextIndex = 0
  private stopped = false
  private running = false

  constructor(options: BilibiliAudioSourceOptions) {
    this.video = options.video
    this.pageUrl = options.pageUrl ?? location.href
    this.identity = options.identity
    this.resolveIdentity = options.identity
      ? async () => options.identity!
      : () => resolveCurrentBilibiliIdentity(this.pageUrl)
    this.fetchJson =
      options.fetchJson ??
      ((url, request) => bgFetch(url, { ...request, type: 'json' }))
    this.fetchBytes =
      options.fetchBytes ?? ((url, request) => fetch(url, request))
    this.onChunk = options.onChunk
    this.onError = options.onError
    this.onEnded = options.onEnded
  }

  async prepare(): Promise<void> {
    if (this.prepared) return
    this.assertActive()
    try {
      this.factory = await loadMp4Factory()
      this.assertActive()
      const identity = await withDeadline(
        Promise.resolve().then(() => this.resolveIdentity()),
        this.abortController.signal,
        '读取当前 B 站视频信息超时，请重试',
      )
      this.assertActive()
      this.identity = identity
      const response = await withDeadline(
        Promise.resolve().then(() =>
          this.fetchJson(buildBilibiliPlayUrl(identity), {
            credentials: 'include',
          }),
        ),
        this.abortController.signal,
        '读取 B 站音轨信息超时，请重试',
      )
      this.assertActive()
      const track = parseDashAudioTrack(response)
      this.audioUrls.push(track.url, ...track.backupUrls)
      const init = await this.fetchRange(track.initialization, MAX_INIT_BYTES)
      this.assertActive()
      const metadata = await parseInitInfo(this.factory, init)
      this.track = metadata
      const indexBytes = await this.fetchRange(track.index, MAX_INDEX_BYTES)
      this.assertActive()
      const index = await parseSidx(this.factory, indexBytes, track.index.start)
      this.index = index
      const now = this.currentTime()
      const firstIndex = index.findIndex((segment) => segment.end > now)
      if (firstIndex < 0) {
        this.initBytes = init
        this.nextIndex = index.length
        this.prepared = true
        return
      }
      const first = index[firstIndex]
      const media = await this.fetchRange(
        { start: first.byteStart, end: first.byteEnd },
        MAX_SEGMENT_BYTES,
      )
      this.assertActive()
      const samples = await parseSegmentSamples(
        this.factory,
        init,
        media,
        metadata.id,
      )
      this.assertActive()
      await this.ensureDecoder(samples[0])
      this.initBytes = init
      this.first = { metadata: first, samples }
      this.nextIndex = firstIndex
      this.prepared = true
    } catch (error) {
      if (this.stopped || this.abortController.signal.aborted)
        throw abortError(this.abortController.signal)
      if (error instanceof AudioPrefetchError) throw error
      throw new AudioPrefetchError(
        'request',
        error instanceof Error ? error.message : 'B 站音频提前读取失败',
      )
    }
  }

  async start(): Promise<void> {
    await this.prepare()
    this.accepting = true
    await this.run()
  }

  async run(): Promise<void> {
    if (this.running || this.stopped) return
    if (!this.prepared) await this.prepare()
    this.running = true
    try {
      if (this.nextIndex >= (this.index?.length ?? 0)) {
        await this.flushBatch()
        this.onEnded?.()
        return
      }
      while (
        !this.stopped &&
        !this.abortController.signal.aborted &&
        this.nextIndex < (this.index?.length ?? 0)
      ) {
        const segment = this.index![this.nextIndex]
        if (segment.end <= this.currentTime() - 0.25) {
          this.nextIndex++
          continue
        }
        if (segment.end > this.currentTime() + MAX_PREFETCH_AHEAD_SECONDS) {
          await this.waitForPlayback(segment.end)
          continue
        }
        let samples: Mp4Sample[]
        if (this.first?.metadata.index === segment.index) {
          samples = this.first.samples
          this.first = undefined
        } else {
          const media = await this.fetchRange(
            { start: segment.byteStart, end: segment.byteEnd },
            MAX_SEGMENT_BYTES,
          )
          this.assertActive()
          samples = await parseSegmentSamples(
            this.factory!,
            this.initBytes!,
            media,
            this.track!.id,
          )
        }
        this.assertActive()
        const decoded = await this.decodeSamples(samples, segment)
        this.assertActive()
        for (const part of decoded) await this.addDecoded(part)
        this.nextIndex++
      }
      await this.flushBatch()
      if (!this.stopped && !this.abortController.signal.aborted)
        this.onEnded?.()
    } catch (error) {
      if (this.stopped || this.abortController.signal.aborted || isAbort(error))
        return
      const message =
        error instanceof AudioPrefetchError
          ? error.message
          : 'B 站音频提前识别失败，请重试'
      this.onError?.(message)
    } finally {
      this.running = false
    }
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.accepting = false
    this.abortController.abort()
    try {
      this.decoder?.close()
    } catch {
      /* already closed */
    }
    this.decoder = undefined
    this.outputParts = undefined
    this.first = undefined
    this.initBytes = undefined
    this.index = undefined
    this.batchParts = []
    this.batchSamples = 0
  }

  private assertActive() {
    if (this.stopped || this.abortController.signal.aborted)
      throw abortError(this.abortController.signal)
  }

  private currentTime() {
    const time = Number(this.video.currentTime)
    return Number.isFinite(time) && time >= 0 ? time : 0
  }

  private async waitForPlayback(requiredTime: number) {
    while (
      !this.stopped &&
      !this.abortController.signal.aborted &&
      this.currentTime() + MAX_PREFETCH_AHEAD_SECONDS < requiredTime
    ) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.abortController.signal.removeEventListener('abort', abort)
          resolve()
        }, 250)
        const abort = () => {
          clearTimeout(timer)
          this.abortController.signal.removeEventListener('abort', abort)
          reject(abortError(this.abortController.signal))
        }
        this.abortController.signal.addEventListener('abort', abort, {
          once: true,
        })
      })
    }
  }

  private async fetchRange(
    range: ByteRange,
    maximum: number,
  ): Promise<ArrayBuffer> {
    const expected = range.end - range.start + 1
    if (!Number.isSafeInteger(expected) || expected < 1 || expected > maximum)
      throw new AudioPrefetchError('unsupported', '音频 Range 超出安全上限')
    let last: unknown
    for (const url of this.audioUrls) {
      try {
        return await this.fetchRangeFromUrl(url, range, expected, maximum)
      } catch (error) {
        if (this.stopped || this.abortController.signal.aborted)
          throw abortError(this.abortController.signal)
        last = error
      }
    }
    if (last instanceof AudioPrefetchError && last.kind === 'unsupported')
      throw last
    throw new AudioPrefetchError(
      'request',
      'B 站音频分段请求失败；可稍后重试或改用实时识别',
    )
  }

  private async fetchRangeFromUrl(
    url: string,
    range: ByteRange,
    expected: number,
    maximum: number,
  ) {
    const requestController = new AbortController()
    let timedOut = false
    const sourceAbort = () => {
      requestController.abort(this.abortController.signal.reason)
    }
    this.abortController.signal.addEventListener('abort', sourceAbort, {
      once: true,
    })
    const timeout = setTimeout(() => {
      timedOut = true
      requestController.abort()
    }, RANGE_TIMEOUT_MS)
    const cleanup = () => {
      clearTimeout(timeout)
      this.abortController.signal.removeEventListener('abort', sourceAbort)
    }
    let response: Response
    try {
      response = await this.fetchBytes(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
        headers: {
          Range: `bytes=${range.start}-${range.end}`,
          Accept: 'video/mp4',
        },
        signal: requestController.signal,
      })
    } catch (error) {
      cleanup()
      if (this.stopped || this.abortController.signal.aborted)
        throw abortError(this.abortController.signal)
      if (timedOut)
        throw new AudioPrefetchError('request', 'B 站音频分段请求超时，请重试')
      throw new AudioPrefetchError(
        'request',
        error instanceof Error ? error.message : '网络请求失败',
      )
    }
    try {
      if (response.status !== 206) {
        cancelBody(response.body)
        throw new AudioPrefetchError(
          'unsupported',
          'B 站音频服务器未返回 206 Range 响应，已拒绝下载整轨',
        )
      }
      const exposed = response.headers.get('Content-Range')
      if (exposed) {
        const match = exposed.match(/^bytes (\d+)-(\d+)\/(?:\d+|\*)$/)
        if (
          !match ||
          Number(match[1]) !== range.start ||
          Number(match[2]) !== range.end
        ) {
          cancelBody(response.body)
          throw new AudioPrefetchError(
            'request',
            'B 站音频 Range 响应范围不一致',
          )
        }
      }
      const body = response.body
      if (!body) {
        const bytes = await withAbortSignal(
          response.arrayBuffer(),
          requestController.signal,
        )
        if (bytes.byteLength !== expected || bytes.byteLength > maximum)
          throw new AudioPrefetchError(
            'request',
            'B 站音频 Range 响应大小不一致',
          )
        return bytes
      }
      const reader = body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      try {
        while (true) {
          const next = await withAbortSignal(
            reader.read(),
            requestController.signal,
          )
          if (next.done) break
          const chunk = next.value
          total += chunk.byteLength
          if (total > maximum || total > expected) {
            try {
              void reader.cancel().catch(() => {})
            } catch {
              /* response already closed */
            }
            throw new AudioPrefetchError(
              'request',
              'B 站音频 Range 响应超过安全上限',
            )
          }
          chunks.push(chunk)
        }
      } catch (error) {
        if (this.stopped || this.abortController.signal.aborted)
          throw abortError(this.abortController.signal)
        if (timedOut)
          throw new AudioPrefetchError(
            'request',
            'B 站音频分段读取超时，请重试',
          )
        throw error
      } finally {
        try {
          reader.releaseLock()
        } catch {
          /* an aborted read may still be settling */
        }
      }
      if (total !== expected)
        throw new AudioPrefetchError('request', 'B 站音频 Range 响应不完整')
      const result = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.byteLength
      }
      return result.buffer
    } finally {
      cleanup()
    }
  }

  private async ensureDecoder(sample: Mp4Sample) {
    if (this.decoder) return
    const globals = globalThis as CodecGlobals
    const Decoder = globals.AudioDecoder
    const EncodedChunk = globals.EncodedAudioChunk
    if (!Decoder || !EncodedChunk)
      throw new AudioPrefetchError(
        'unsupported',
        '当前浏览器不支持 WebCodecs AAC 音频解码',
      )
    const track = this.track
    if (!track) throw new AudioPrefetchError('decode', '音轨元数据尚未准备好')
    const sampleRate = Number(track.audio?.sample_rate)
    const channels = Number(track.audio?.channel_count)
    const description = extractDecoderDescription(sample)
    const config: AudioDecoderConfig = {
      codec: 'mp4a.40.2',
      sampleRate,
      numberOfChannels: channels,
      description,
    }
    try {
      const support = await Decoder.isConfigSupported(config)
      this.assertActive()
      if (support.supported !== true)
        throw new AudioPrefetchError(
          'unsupported',
          '当前浏览器不支持这条 AAC 音轨',
        )
      this.decoder = new Decoder({
        output: (data) => {
          try {
            const pcm = audioDataToMono(data)
            const start = Number(data.timestamp) / 1_000_000
            const previousEnd =
              this.outputParts?.at(-1)?.end ?? this.outputCursor
            if (
              !Number.isFinite(start) ||
              !Number.isFinite(previousEnd) ||
              Math.abs(start - previousEnd) > 0.5
            )
              throw Error('WebCodecs 音频时间戳不连续')
            const end = start + pcm.length / 16_000
            if (!Number.isFinite(end) || end <= start)
              throw Error('WebCodecs 音频时间戳无效')
            this.outputParts?.push({
              pcm,
              start,
              end,
            })
            this.outputCursor = end
          } catch (error) {
            this.decoderError =
              error instanceof Error ? error : Error('音频帧转换失败')
            try {
              data.close()
            } catch {
              /* already closed */
            }
            return
          }
          try {
            data.close()
          } catch {
            /* already closed */
          }
        },
        error: (error) => {
          this.decoderError =
            error instanceof Error ? error : Error('WebCodecs 音频解码失败')
        },
      })
      this.decoder.configure(config)
    } catch (error) {
      try {
        this.decoder?.close()
      } catch {
        /* configure failed */
      }
      this.decoder = undefined
      if (error instanceof AudioPrefetchError) throw error
      throw new AudioPrefetchError(
        'decode',
        error instanceof Error ? error.message : 'WebCodecs AAC 初始化失败',
      )
    }
  }

  private async decodeSamples(
    samples: Mp4Sample[],
    metadata: AudioSegmentIndex,
  ): Promise<DecodedPcm[]> {
    this.assertActive()
    if (!this.decoder) await this.ensureDecoder(samples[0])
    const EncodedChunk = (globalThis as CodecGlobals).EncodedAudioChunk
    if (!EncodedChunk || !this.decoder)
      throw new AudioPrefetchError(
        'unsupported',
        '当前浏览器不支持 WebCodecs AAC 音频解码',
      )
    const outputs: DecodedPcm[] = []
    this.outputParts = outputs
    this.decoderError = undefined
    const expectedStart =
      Number(samples[0].cts ?? samples[0].dts) /
      Number(samples[0].timescale || this.track?.timescale || 1)
    if (!Number.isFinite(expectedStart))
      throw new AudioPrefetchError('decode', '音频样本时间戳无效')
    this.outputCursor = expectedStart
    try {
      for (const sample of samples) {
        this.assertActive()
        if (
          !(sample.data instanceof Uint8Array) ||
          sample.data.byteLength < 1 ||
          sample.data.byteLength > MAX_SEGMENT_BYTES
        )
          throw new AudioPrefetchError('decode', 'AAC 样本数据无效')
        const timescale = Number(sample.timescale || this.track?.timescale || 1)
        const timestamp =
          (Number(sample.cts ?? sample.dts) / timescale) * 1_000_000
        const duration = (Number(sample.duration) / timescale) * 1_000_000
        this.decoder.decode(
          new EncodedChunk({
            type: sample.is_sync === false ? 'delta' : 'key',
            timestamp: Math.round(timestamp),
            duration:
              Number.isFinite(duration) && duration > 0
                ? Math.round(duration)
                : undefined,
            data: sample.data,
          }),
        )
      }
      await this.decoder.flush()
      const decoderError = this.decoderError as Error | undefined
      if (decoderError !== undefined)
        throw new AudioPrefetchError('decode', decoderError.message)
    } catch (error) {
      if (error instanceof AudioPrefetchError) throw error
      throw new AudioPrefetchError(
        'decode',
        error instanceof Error ? error.message : 'WebCodecs AAC 解码失败',
      )
    } finally {
      this.outputParts = undefined
    }
    for (const output of outputs) {
      if (
        !Number.isFinite(output.start) ||
        !Number.isFinite(output.end) ||
        output.end <= output.start
      )
        throw new AudioPrefetchError('decode', '音频输出时间戳无效')
      if (
        output.start < metadata.start - 0.5 ||
        output.end > metadata.end + 0.5
      )
        throw new AudioPrefetchError(
          'decode',
          '音频输出时间戳超出当前分段，已停止提前识别',
        )
    }
    return outputs
  }

  private async addDecoded(part: DecodedPcm) {
    if (!this.accepting || this.stopped) return
    const duration = part.end - part.start
    if (!Number.isFinite(duration) || duration <= 0 || part.pcm.length < 1)
      return
    let offset = 0
    while (offset < part.pcm.length) {
      if (!this.batchSamples) {
        this.batchStart = part.start + offset / 16_000
      }
      const expectedStart = this.batchStart + this.batchSamples / 16_000
      const actualStart = part.start + offset / 16_000
      if (this.batchSamples && Math.abs(actualStart - expectedStart) > 0.15) {
        await this.flushBatch()
        continue
      }
      const room = 16_000 * PREFETCH_CHUNK_MAX_SECONDS - this.batchSamples
      const take = Math.min(room, part.pcm.length - offset)
      if (take < 1) {
        await this.flushBatch()
        continue
      }
      this.batchParts.push(part.pcm.slice(offset, offset + take))
      this.batchSamples += take
      offset += take
      if (this.batchSamples >= 16_000 * PREFETCH_CHUNK_TARGET_SECONDS)
        await this.flushBatch()
    }
  }

  private async flushBatch() {
    if (!this.batchSamples || !this.accepting || this.stopped) {
      this.batchParts = []
      this.batchSamples = 0
      return
    }
    const pcm = new Float32Array(this.batchSamples)
    let offset = 0
    for (const part of this.batchParts) {
      pcm.set(part, offset)
      offset += part.length
    }
    const start = Math.max(0, this.batchStart)
    const duration = pcm.length / 16_000
    const durationLimit = Number.isFinite(this.video.duration)
      ? this.video.duration
      : Infinity
    const end = Math.min(durationLimit, start + duration)
    this.batchParts = []
    this.batchSamples = 0
    if (end <= start || end - start < MIN_PCM_SAMPLES / 16_000) return
    const clipped =
      end - start < duration
        ? pcm.slice(0, Math.floor((end - start) * 16_000))
        : pcm
    let energy = 0
    for (const value of clipped) energy += value * value
    if (Math.sqrt(energy / Math.max(1, clipped.length)) < 0.003) return
    await this.onChunk({
      pcm: clipped,
      start,
      end: start + clipped.length / 16_000,
    })
  }
}
