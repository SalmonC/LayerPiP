export type SpeechSegment = { start: number; end: number; text: string }
export type AudioChunk = { pcm: Float32Array; start: number; end: number }
export type ModelDescriptor = {
  id: string
  label: string
  source: 'bundled' | 'downloaded'
  canRemove: boolean
}
export interface ModelStore {
  resolve(): ModelDescriptor
}
export interface TranscriptionEngine {
  load(): Promise<void>
  transcribe(pcm: Float32Array): Promise<SpeechSegment[]>
  dispose(): void
}
export const bundledModelStore: ModelStore = {
  resolve: () => ({
    id: 'whisper-base-q8', label: 'Whisper Base · 多语言 · 本地',
    source: 'bundled', canRemove: false,
  }),
}
