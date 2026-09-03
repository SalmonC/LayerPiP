import WebextEvent from '@root/shared/webextEvent'
import { sendMessage } from 'webext-bridge/content-script'
import type { SubtitleAsset } from './types'

export async function putSubtitleAsset(asset: SubtitleAsset) {
  await sendMessage(WebextEvent.putSubtitleAsset, asset)
}

export async function getSubtitleAsset(id: string) {
  return sendMessage(WebextEvent.getSubtitleAsset, { id })
}

export async function deleteSubtitleAsset(id: string) {
  await sendMessage(WebextEvent.deleteSubtitleAsset, { id })
}

export async function createSubtitleAsset(file: File): Promise<SubtitleAsset> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'srt' && extension !== 'ass') {
    throw new Error('仅支持 SRT 或 ASS 字幕文件')
  }
  const content = await file.text()
  if (!content.trim()) throw new Error('字幕文件为空')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  )
  const contentHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const asset: SubtitleAsset = {
    id: crypto.randomUUID(),
    fileName: file.name,
    format: extension,
    contentHash,
    content,
    createdAt: Date.now(),
  }
  await putSubtitleAsset(asset)
  return asset
}
