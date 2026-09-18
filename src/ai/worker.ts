import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import type { SpeechSegment } from '../core/AiSubtitle/types'

env.allowLocalModels = true
env.allowRemoteModels = false
env.useBrowserCache = false
env.localModelPath = new URL('./assets/ai-models/', self.location.href).href
env.backends.onnx.wasm!.wasmPaths = new URL('./assets/ai-runtime/', self.location.href).href
env.backends.onnx.wasm!.numThreads = 1
env.backends.onnx.wasm!.proxy = false
const createAsr = pipeline as unknown as (task: 'automatic-speech-recognition', model: string, options: {
  dtype: 'q8'; device: 'wasm'; local_files_only: true
}) => Promise<AutomaticSpeechRecognitionPipeline>
let recognizer: AutomaticSpeechRecognitionPipeline | undefined
let busy = false
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void
  postMessage: (data: unknown) => void
}
scope.onmessage = async ({ data }) => {
  if (!data || !Number.isSafeInteger(data.id)) return
  if (busy) { scope.postMessage({ id: data.id, error: '识别引擎正忙' }); return }
  busy = true
  try {
    if (data.type === 'load') {
      recognizer ??= await createAsr('automatic-speech-recognition', 'whisper-base', {
        dtype: 'q8', device: 'wasm', local_files_only: true,
      })
      scope.postMessage({ id: data.id, result: true })
    } else if (data.type === 'transcribe') {
      const pcm = data.pcm
      if (!recognizer || !(pcm instanceof Float32Array) || pcm.length < 16000 || pcm.length > 16000 * 12 || !pcm.every(Number.isFinite)) throw Error('音频片段或识别状态无效')
      const duration = pcm.length / 16000
      const output = await recognizer(pcm, { return_timestamps: true, task: 'transcribe', max_new_tokens: 128 })
      const result = Array.isArray(output) ? output[0] : output
      const chunks = result.chunks ?? [{ timestamp: [0, duration], text: result.text }]
      const segments: SpeechSegment[] = chunks.map((chunk) => ({
        start: Math.max(0, Number(chunk.timestamp[0] ?? 0)),
        end: Math.min(duration, Number(chunk.timestamp[1] ?? duration)),
        text: chunk.text.trim().slice(0, 2000),
      })).filter((chunk) => Number.isFinite(chunk.start) && Number.isFinite(chunk.end) && chunk.end > chunk.start && !!chunk.text)
      scope.postMessage({ id: data.id, result: segments })
    }
  } catch (error) {
    scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : '本地识别失败' })
  } finally { busy = false }
}
