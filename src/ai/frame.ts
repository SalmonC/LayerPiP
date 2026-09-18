let worker: Worker | undefined
let port: MessagePort | undefined
let activeId = 0
const token = location.hash.slice(1)
const dispose = () => { worker?.terminate(); worker = undefined; port?.close() }
window.addEventListener('pagehide', dispose, { once: true })
window.addEventListener('message', (event) => {
  if (port || event.source !== parent || !token || event.data?.type !== 'layerpip-ai-connect' || event.data.token !== token || !event.ports[0]) return
  port = event.ports[0]
  port.onmessage = ({ data }) => {
    if (!data || typeof data.type !== 'string') return
    if (data.type === 'dispose') { dispose(); return }
    if (!Number.isSafeInteger(data.id)) return
    if (data.type !== 'load' && data.type !== 'transcribe') return
    activeId = data.id
    if (data.type === 'transcribe' && (!(data.pcm instanceof Float32Array) || data.pcm.length > 16000 * 12 || data.pcm.length < 16000)) {
      port?.postMessage({ id: data.id, error: '无效音频片段' }); return
    }
    if (!worker) {
      worker = new Worker(new URL('./ai-worker.js', location.href), { type: 'module' })
      worker.onmessage = (message) => port?.postMessage(message.data)
      worker.onerror = () => { port?.postMessage({ id: activeId, error: '本地识别引擎运行失败，请重试' }); worker?.terminate(); worker = undefined }
    }
    worker.postMessage(data, data.type === 'transcribe' ? [data.pcm.buffer] : [])
  }
  port.postMessage({ id: event.data.id, result: true })
})
