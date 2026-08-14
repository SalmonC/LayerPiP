import type { NetworkSubtitleProbe, SubtitleRow } from './types'
import assParser from './subtitleParser/ass'
import srtParser from './subtitleParser/srt'

export const MAX_NETWORK_SUBTITLE_SIZE = 10 * 1024 * 1024

export function parseHttpUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('请输入完整的网络字幕或 B 站视频链接')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('仅支持 http 或 https 链接')
  }
  return url
}

function getUrlFileName(url: URL) {
  const pathName = decodeURIComponent(url.pathname)
  return pathName.split('/').filter(Boolean).pop() || url.hostname
}

export function createDirectSubtitleProbe(input: string): NetworkSubtitleProbe {
  const url = parseHttpUrl(input)
  const fileName = getUrlFileName(url)
  return {
    sourceLabel: fileName,
    parts: [],
    needsPartSelection: false,
    tracks: [
      {
        label: `[网络] ${fileName}`,
        value: url.href,
      },
    ],
  }
}

function parseBilibiliJson(content: string): SubtitleRow[] | null {
  let json: any
  try {
    json = JSON.parse(content)
  } catch {
    return null
  }

  const body = Array.isArray(json?.body)
    ? json.body
    : Array.isArray(json?.data?.body)
      ? json.data.body
      : null
  if (!body) return null

  const rows: SubtitleRow[] = []
  for (const item of body) {
    const startTime = Number(item?.from)
    const endTime = Number(item?.to)
    const text = typeof item?.content === 'string' ? item.content : ''
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      endTime <= startTime ||
      !text
    ) {
      continue
    }
    rows.push({
      id: `${rows.length}`,
      startTime,
      endTime,
      text,
      htmlText: text,
    })
  }
  return rows
}

export function parseNetworkSubtitleContent(
  content: string,
  sourceUrl: string,
): SubtitleRow[] {
  if (content.length > MAX_NETWORK_SUBTITLE_SIZE) {
    throw new Error('网络字幕文件超过 10 MB，已拒绝加载')
  }

  const trimmed = content.trim()
  if (!trimmed) throw new Error('网络字幕内容为空')

  const url = parseHttpUrl(sourceUrl)
  const extension = url.pathname.split('.').pop()?.toLowerCase()
  let rows: SubtitleRow[] | null = null

  if (extension === 'srt') {
    rows = srtParser(trimmed)
  } else if (extension === 'ass') {
    rows = assParser(trimmed)
  } else {
    rows = parseBilibiliJson(trimmed)
    if (!rows && trimmed.includes('-->')) rows = srtParser(trimmed)
    if (!rows && /^\s*\[Script Info\]/i.test(trimmed)) {
      rows = assParser(trimmed)
    }
  }

  rows = rows?.filter(
    (row) =>
      Number.isFinite(row.startTime) &&
      Number.isFinite(row.endTime) &&
      row.endTime > row.startTime,
  )

  if (!rows?.length) {
    throw new Error('无法识别字幕格式，仅支持 SRT、ASS 或 B 站字幕 JSON')
  }
  return rows.sort((a, b) => a.startTime - b.startTime)
}

/**
 * B 的时间 = A 的时间 + offset，因此映射到 A 时要减去 offset。
 * 正数会让字幕更早显示，负数会让字幕更晚显示。
 */
export function applyNetworkSubtitleOffset(
  rows: SubtitleRow[],
  offset: number,
): SubtitleRow[] {
  if (!Number.isFinite(offset)) throw new Error('时间偏移必须是有效数字')

  return rows.flatMap((row, index) => {
    const startTime = Math.max(0, row.startTime - offset)
    const endTime = row.endTime - offset
    if (endTime <= startTime) return []
    return [
      {
        ...row,
        id: `network-${index}`,
        startTime,
        endTime,
      },
    ]
  })
}
