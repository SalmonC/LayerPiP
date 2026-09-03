import type {
  NetworkSubtitlePart,
  NetworkSubtitleProbe,
  NetworkSubtitleTrack,
} from '@root/core/SubtitleManager/types'

type FetchJson = (url: string, options?: RequestInit) => Promise<any>

type BilibiliVideoRef = {
  aid?: string
  bvid?: string
  explicitPart?: number
}

export type BilibiliVideoCatalog = {
  sourceLabel: string
  aid: string
  bvid?: string
  explicitPart?: number
  parts: NetworkSubtitlePart[]
}

export function parseBilibiliVideoUrl(input: string): BilibiliVideoRef | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  if (host !== 'bilibili.com' && !host.endsWith('.bilibili.com')) return null

  const match = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+|av(\d+))(?:\/|$)/i)
  if (!match) return null

  const pValues = url.searchParams.getAll('p')
  if (pValues.length > 1) throw new Error('链接包含重复的 p 参数，无法确定分P')
  let explicitPart: number | undefined
  if (pValues.length === 1) {
    if (!/^[1-9]\d*$/.test(pValues[0])) {
      throw new Error('链接中的 p 必须是正整数')
    }
    explicitPart = Number(pValues[0])
  }

  if (/^BV/i.test(match[1])) {
    return { bvid: match[1], explicitPart }
  }
  return { aid: match[2], explicitPart }
}

function assertApiData(response: any, context: string) {
  if (response?.code !== 0 || !response?.data) {
    const message = response?.message || response?.msg || '未知错误'
    throw new Error(`${context}失败：${message}`)
  }
  return response.data
}

export function parseBilibiliPages(rawPages: any): NetworkSubtitlePart[] {
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    throw new Error('视频没有可用的分P信息')
  }

  const pageNumbers = new Set<number>()
  const cids = new Set<string>()
  return rawPages.map((rawPage: any) => {
    const page = Number(rawPage?.page)
    const cid = String(rawPage?.cid ?? '')
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !/^\d+$/.test(cid) ||
      cid === '0'
    ) {
      throw new Error('视频返回了无效的分P信息，已停止加载以避免抓错')
    }
    if (pageNumbers.has(page) || cids.has(cid)) {
      throw new Error('视频返回了重复的分P信息，已停止加载以避免抓错')
    }
    pageNumbers.add(page)
    cids.add(cid)
    const partName = String(rawPage?.part || `P${page}`)
    return { page, cid, label: `P${page} ${partName}` }
  })
}

export async function readBilibiliVideoCatalog(
  input: string,
  fetchJson: FetchJson,
): Promise<BilibiliVideoCatalog | null> {
  const videoRef = parseBilibiliVideoUrl(input)
  if (!videoRef) return null

  const viewUrl = new URL('https://api.bilibili.com/x/web-interface/view')
  if (videoRef.bvid) viewUrl.searchParams.set('bvid', videoRef.bvid)
  if (videoRef.aid) viewUrl.searchParams.set('aid', videoRef.aid)
  const videoData = assertApiData(
    await fetchJson(viewUrl.href, { credentials: 'include' }),
    '读取视频信息',
  )
  return {
    sourceLabel: String(videoData.title || videoRef.bvid || videoRef.aid),
    aid: String(videoData.aid),
    bvid: typeof videoData.bvid === 'string' ? videoData.bvid : videoRef.bvid,
    explicitPart: videoRef.explicitPart,
    parts: parseBilibiliPages(videoData.pages),
  }
}

function normalizeSubtitleUrl(rawUrl: unknown) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('字幕轨道缺少下载地址')
  }
  const url = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl
  const parsed = new URL(url, 'https://www.bilibili.com')
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('字幕轨道地址无效')
  }
  return parsed.href
}

export async function probeBilibiliNetworkSubtitle(
  input: string,
  selectedPart: number | undefined,
  fetchJson: FetchJson,
): Promise<NetworkSubtitleProbe | null> {
  const catalog = await readBilibiliVideoCatalog(input, fetchJson)
  if (!catalog) return null
  const parts = catalog.parts

  const partNumber = catalog.explicitPart ?? selectedPart
  if (partNumber === undefined) {
    return {
      sourceLabel: catalog.sourceLabel,
      aid: catalog.aid,
      bvid: catalog.bvid,
      parts,
      needsPartSelection: true,
      tracks: [],
    }
  }
  if (!Number.isInteger(partNumber) || partNumber < 1) {
    throw new Error('请选择有效的分P')
  }
  const part = parts.find((item) => item.page === partNumber)
  if (!part) throw new Error(`视频不存在 P${partNumber}，已停止加载以避免抓错`)

  const playerUrl = new URL('https://api.bilibili.com/x/player/wbi/v2')
  playerUrl.searchParams.set('aid', catalog.aid)
  playerUrl.searchParams.set('cid', part.cid)
  const playerData = assertApiData(
    await fetchJson(playerUrl.href, { credentials: 'include' }),
    '读取字幕信息',
  )
  const rawTracks = playerData.subtitle?.subtitles
  if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
    if (playerData.need_login_subtitle) {
      throw new Error('该字幕需要登录 B 站后读取，请确认当前浏览器已登录')
    }
    throw new Error(`P${part.page} 没有可用字幕轨道`)
  }

  const sourceLabel = catalog.sourceLabel
  const tracks: NetworkSubtitleTrack[] = rawTracks.map(
    (track: any, index: number) => {
      const language = String(
        track?.lan_doc || track?.lan || `字幕${index + 1}`,
      )
      return {
        label: `[网络] ${sourceLabel} · P${part.page} · ${language}`,
        value: normalizeSubtitleUrl(track?.subtitle_url),
        language: String(track?.lan || track?.lan_doc || ''),
      }
    },
  )

  return {
    sourceLabel,
    aid: catalog.aid,
    bvid: catalog.bvid,
    parts,
    selectedPart: part.page,
    selectedCid: part.cid,
    needsPartSelection: false,
    tracks,
  }
}
