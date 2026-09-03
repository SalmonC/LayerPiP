export type BilibiliVideoIdentity = {
  aid: string
  bvid?: string
  cid: string
  page: number
  title?: string
  partTitle?: string
}

export type SubtitleSourceDescriptor =
  | { type: 'auto' }
  | {
      type: 'current-bilibili'
      language?: string
      offset: number
    }
  | {
      type: 'linked-bilibili'
      bvid?: string
      aid?: string
      sourceCid: string
      sourcePageAtBind: number
      language?: string
      offset: number
    }
  | { type: 'direct-url'; url: string; offset: number }
  | {
      type: 'local-file'
      assetId: string
      fileName: string
      format: 'srt' | 'ass'
      contentHash: string
      offset: number
    }
  | { type: 'none' }

export type SubtitleSourceBinding = {
  target: BilibiliVideoIdentity
  source: SubtitleSourceDescriptor
  updatedAt: number
}

export type SubtitleSourceBindings = Record<string, SubtitleSourceBinding>

export type SubtitleAsset = {
  id: string
  fileName: string
  format: 'srt' | 'ass'
  contentHash: string
  content: string
  createdAt: number
}
