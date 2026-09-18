import type { AudioChunk } from './types'

/** Short PCM copies on the audio callback; all expensive work stays in the worker. */
export class AudioCapture {
  private context?: AudioContext
  private stream?: MediaStream
  private source?: MediaStreamAudioSourceNode
  private processor?: ScriptProcessorNode
  private sink?: GainNode
  private parts: Float32Array[] = []
  private samples = 0
  private startTime = 0
  private endTime = 0
  private stopped = false
  private removers: (() => void)[] = []
  accepting = false

  constructor(
    private video: HTMLVideoElement,
    private onChunk: (chunk: AudioChunk) => void,
    private onError: (message: string) => void,
    private onEnded: () => void,
  ) {}

  /** Called synchronously by the user's click, before model initialization. */
  async start() {
    const video = this.video as HTMLVideoElement & { captureStream?: () => MediaStream }
    if (!video.captureStream) throw Error('此浏览器不能采集当前视频音频')
    if (video.paused || video.ended || video.readyState < 2) throw Error('请先以 1 倍速播放视频，再开始识别')
    if (video.playbackRate !== 1) throw Error('首版 AI 字幕只支持 1 倍速')
    try {
      this.context = new AudioContext({ sampleRate: 16000 })
      const resumed = this.context.resume()
      this.stream = video.captureStream()
      const tracks = this.stream.getAudioTracks()
      if (!tracks.length) throw Error('未能采集视频音轨；请在视频开始播放后重试')
      for (const track of tracks) {
        const ended = () => { if (!this.stopped) this.onError('视频音轨已变更，请重新开始识别') }
        track.addEventListener('ended', ended)
        this.removers.push(() => track.removeEventListener('ended', ended))
      }
      this.source = this.context.createMediaStreamSource(new MediaStream(tracks))
      this.processor = this.context.createScriptProcessor(4096, 1, 1)
      this.sink = this.context.createGain()
      this.sink.gain.value = 0 // Never duplicate or reroute the audible source video.
      this.source.connect(this.processor)
      this.processor.connect(this.sink)
      this.sink.connect(this.context.destination)
      this.processor.onaudioprocess = (event) => {
        if (this.stopped || !this.accepting || video.paused || video.ended || video.seeking || video.readyState < 3) return
        const input = event.inputBuffer.getChannelData(0)
        const rate = event.inputBuffer.sampleRate
        const length = Math.round(input.length * 16000 / rate)
        const pcm = new Float32Array(length)
        for (let i = 0; i < length; i++) {
          const position = i * rate / 16000, low = Math.floor(position), fraction = position - low
          pcm[i] = (input[low] ?? 0) * (1 - fraction) + (input[Math.min(low + 1, input.length - 1)] ?? 0) * fraction
        }
        if (!this.samples) this.startTime = Math.max(0, video.currentTime - input.length / rate)
        this.endTime = video.currentTime
        this.parts.push(pcm)
        this.samples += pcm.length
        if (this.samples >= 16000 * 8) this.flush()
      }
      const pause = () => this.flush()
      const ended = () => { this.flush(); this.onEnded() }
      video.addEventListener('pause', pause)
      video.addEventListener('waiting', pause)
      video.addEventListener('ended', ended)
      this.removers.push(() => {
        video.removeEventListener('pause', pause)
        video.removeEventListener('waiting', pause)
        video.removeEventListener('ended', ended)
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([resumed, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error('音频采集启动超时，请点击重试')), 8000)
        })])
      } finally { clearTimeout(timer) }
      if (!this.stopped && this.context.state !== 'running') throw Error('音频采集未启动，请点击重试')
    } catch (error) {
      this.stop()
      throw error
    }
  }

  private flush() {
    if (this.samples >= 16000 && this.accepting && !this.stopped) {
      const pcm = new Float32Array(this.samples)
      let offset = 0, energy = 0
      for (const part of this.parts) { pcm.set(part, offset); offset += part.length }
      for (const value of pcm) energy += value * value
      // Skip silence to reduce work and Whisper's silence hallucinations.
      if (Math.sqrt(energy / pcm.length) >= 0.003)
        this.onChunk({ pcm, start: this.startTime, end: Math.min(
          Number.isFinite(this.video.duration) ? this.video.duration : Infinity,
          Math.max(this.endTime, this.startTime + pcm.length / 16000),
        ) })
    }
    this.parts = []
    this.samples = 0
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    this.accepting = false
    this.removers.forEach((remove) => remove())
    this.removers = []
    if (this.processor) this.processor.onaudioprocess = null
    for (const node of [this.source, this.processor, this.sink]) {
      try { node?.disconnect() } catch { /* already disconnected */ }
    }
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.context?.close().catch(() => {})
    this.parts = []
    this.samples = 0
  }
}
