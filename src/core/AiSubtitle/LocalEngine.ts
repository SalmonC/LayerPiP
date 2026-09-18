import type { SpeechSegment, TranscriptionEngine } from './types'

/** An extension-origin document owns the worker; no inference in the page/UI thread. */
export class LocalEngine implements TranscriptionEngine {
  private frame?: HTMLIFrameElement
  private port?: MessagePort
  private nextId = 0
  private disposed = false
  private pending = new Map<number, {
    resolve: (value: any) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  constructor(private readonly frameUrl: string, private readonly document: Document) {}

  async load() {
    if (this.disposed) throw Error('识别已停止')
    const frame = this.document.createElement('iframe')
    this.frame = frame
    frame.hidden = true
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('title', 'LayerPiP 本地语音识别')
    const token = crypto.randomUUID()
    frame.src = `${this.frameUrl}#${token}`
    const channel = new MessageChannel()
    this.port = channel.port1
    this.port.onmessage = ({ data }) => {
      if (!data || !Number.isSafeInteger(data.id)) return
      const request = this.pending.get(data.id)
      if (!request) return
      clearTimeout(request.timer)
      this.pending.delete(data.id)
      if (typeof data.error === 'string') request.reject(Error(data.error))
      else request.resolve(data.result)
    }
    const connected = this.request('connect', undefined, undefined, 15000, false)
    frame.onload = () => {
      if (this.disposed) { channel.port2.close(); return }
      // Address this exact frame. The one-use token binds the transferred port.
      frame.contentWindow?.postMessage({ type: 'layerpip-ai-connect', token, id: 1 }, '*', [channel.port2])
    }
    frame.onerror = () => this.dispose()
    this.document.documentElement.appendChild(frame)
    await connected
    await this.request('load', undefined, undefined, 45000)
  }

  async transcribe(pcm: Float32Array): Promise<SpeechSegment[]> {
    return this.request('transcribe', pcm, [pcm.buffer as ArrayBuffer], 45000)
  }

  private request(type: string, pcm?: Float32Array, transfer?: Transferable[], timeout = 45000, send = true): Promise<any> {
    if (this.disposed || !this.port) return Promise.reject(Error('识别已停止'))
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(Error(type === 'transcribe' ? '本机识别处理超时，请停止后重试' : '本地模型初始化超时，请重试'))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      if (send) this.port!.postMessage({ type, id, pcm }, transfer ?? [])
    })
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    try { this.port?.postMessage({ type: 'dispose' }) } catch { /* frame already closed */ }
    this.port?.close()
    this.frame?.remove()
    this.frame = undefined
    this.pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(Error('识别已停止')) })
    this.pending.clear()
  }
}
