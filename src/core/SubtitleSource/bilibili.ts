import type {
  NetworkSubtitleProbe,
  NetworkSubtitleTrack,
} from '@root/core/SubtitleManager/types'
import bgFetch from '@root/utils/bgFetch'
import {
  parseBilibiliVideoUrl,
  probeBilibiliNetworkSubtitle,
  readBilibiliVideoCatalog,
} from '@root/web-provider/bilibili/video/networkSubtitle'
import type { BilibiliVideoIdentity, SubtitleSourceDescriptor } from './types'

const fetchJson = (url: string, options?: RequestInit) =>
  bgFetch(url, { ...options, type: 'json' })

export async function resolveCurrentBilibiliIdentity(
  url = location.href,
): Promise<BilibiliVideoIdentity> {
  const videoRef = parseBilibiliVideoUrl(url)
  const catalog = await readBilibiliVideoCatalog(url, fetchJson)
  if (!videoRef || !catalog) {
    throw new Error('当前页面不是可识别的 B 站视频页')
  }
  const page = videoRef.explicitPart ?? 1
  const selected = catalog.parts.find((item) => item.page === page)
  if (!selected) throw new Error(`当前视频不存在 P${page}，已停止以避免抓错`)
  return {
    aid: catalog.aid,
    bvid: catalog.bvid,
    cid: selected.cid,
    page: selected.page,
    title: catalog.sourceLabel,
    partTitle: selected?.label,
  }
}

export async function probeLinkedBilibiliSource(
  url: string,
  selectedPart?: number,
) {
  const probe = await probeBilibiliNetworkSubtitle(url, selectedPart, fetchJson)
  if (!probe) throw new Error('请输入完整的 B 站视频链接')
  return probe
}

export async function resolveBilibiliTrackByCid(
  source: Extract<SubtitleSourceDescriptor, { type: 'linked-bilibili' }>,
): Promise<NetworkSubtitleTrack> {
  const ref = source.bvid
    ? `BV${source.bvid.replace(/^BV/i, '')}`
    : `av${source.aid}`
  const baseUrl = `https://www.bilibili.com/video/${ref}/`
  const catalog = await readBilibiliVideoCatalog(baseUrl, fetchJson)
  if (!catalog) throw new Error('已绑定的 B 站字幕来源无法识别')
  const part = catalog.parts.find((item) => item.cid === source.sourceCid)
  if (!part) {
    throw new Error('已绑定字幕的 CID 已不存在，请重新选择来源分P')
  }
  const resolved = await probeLinkedBilibiliSource(baseUrl, part.page)
  if (resolved.selectedCid !== source.sourceCid) {
    throw new Error('字幕来源 CID 校验失败，已停止加载以避免抓错')
  }
  return selectTrack(resolved, source.language)
}

export function selectTrack(
  probe: NetworkSubtitleProbe,
  language?: string,
): NetworkSubtitleTrack {
  const track = language
    ? probe.tracks.find((item) => item.language === language)
    : probe.tracks[0]
  if (!track) throw new Error('原字幕轨道已不存在，请重新选择字幕语言')
  return track
}
