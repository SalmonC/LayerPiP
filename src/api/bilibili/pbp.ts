import type { BilibiliVideoIdentity } from '@root/core/SubtitleSource/types'

/**
 * 高能进度条（pbp）取数。
 *
 * 官方接口是 `https://bvc.bilivideo.com/pbp/data`，**必须带 `r=loader`**，
 * 否则返回 404 HTML 错误页（旧文档里只带 cid 的写法已经失效）。
 * 官方自己用 `withCredentials: false`，响应头 `access-control-allow-origin: *`，
 * 因此内容脚本可以直接 fetch，不需要注入 MAIN world。
 */
const PBP_URL = 'https://bvc.bilivideo.com/pbp/data'
const REQUEST_TIMEOUT_MS = 8000

export interface PbpCurve {
  /** 单位时间弹幕密度序列 */
  points: number[]
  /** 采样间隔（秒），由视频时长决定 */
  stepSec: number
}

/**
 * `none` 与 `error` 必须分开：
 * - `none` 是该视频**正常没有**高能进度条（弹幕量不足），可以负缓存；
 * - `error` 是网络/风控(412)/非法响应，**不能**负缓存，需要退避重试且不能每帧重试。
 */
export type PbpFetchResult =
  | { kind: 'ready'; curve: PbpCurve }
  | { kind: 'none' }
  | { kind: 'error'; retryable: boolean }

export function buildPbpUrl(identity: BilibiliVideoIdentity): string {
  const url = new URL(PBP_URL)
  if (identity.bvid) url.searchParams.set('bvid', identity.bvid)
  if (identity.aid) url.searchParams.set('aid', identity.aid)
  url.searchParams.set('cid', identity.cid)
  url.searchParams.set('r', 'loader')
  return url.href
}

/**
 * 解析接口响应。
 *
 * ⚠️ 最容易踩的坑：官方 `parse()` 读的是 `res.data.modules`，那是因为它的 HTTP 客户端
 * 会把响应包一层。用 `fetch(...).json()` 拿到的 JSON **顶层就是 `modules`**
 * （实测 `topKeys = ["modules"]`）。照抄 `.data.modules` 会把有数据的视频误判成无曲线。
 */
export function parsePbp(body: unknown): PbpCurve | null {
  const modules = (body as { modules?: unknown })?.modules
  if (!Array.isArray(modules)) return null

  for (const item of modules) {
    const module = item as {
      load_mode?: unknown
      params?: { data?: Record<string, unknown> }
    }
    if (module?.load_mode !== 'pbp') continue
    const data = module.params?.data
    if (!data) continue

    const stepSec = Number(data.step_sec)
    // 硬化校验：不要用 truthy 判断。
    if (!Number.isFinite(stepSec) || stepSec <= 0) continue

    const points = data.events
      ? (data.events as { default?: unknown }).default
      : undefined
    if (!Array.isArray(points) || points.length < 2) continue
    if (
      !points.every(
        (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0,
      )
    )
      continue

    // 注意：不要执行返回体里的 script_src，它只是上游元信息。
    return { points: points as number[], stepSec }
  }
  return null
}

export async function fetchPbpCurve(
  identity: BilibiliVideoIdentity,
  signal?: AbortSignal,
): Promise<PbpFetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => controller.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })

  try {
    const response = await fetch(buildPbpUrl(identity), {
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) {
      // 412 是风控，属于可重试；其他 4xx 也不要当成「该视频没有曲线」。
      return {
        kind: 'error',
        retryable: response.status >= 500 || response.status === 412,
      }
    }
    const body = await response.json()
    const curve = parsePbp(body)
    if (curve) return { kind: 'ready', curve }
    // 走到了这里说明响应合法但没有点数组：正常无数据。
    // 官方在同一种情况下给出 `step_sec=0` 与 `debug.err_id=3`（not enough dm）。
    return { kind: 'none' }
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError'
    return { kind: 'error', retryable: !signal?.aborted || !aborted }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}
