import { fetchPbpCurve } from '@root/api/bilibili/pbp'
import type { BilibiliVideoIdentity } from '@root/core/SubtitleSource/types'
import {
  WATCHED_RANGES_INDEX,
  WATCHED_RANGES_PREFIX,
  watchedRangesKey,
  type WatchedRangesRecord,
} from '@root/shared/storeKey'
import {
  getBrowserLocalStorage,
  setBrowserLocalStorage,
} from '@root/utils/storage'
import { mergeRanges } from '@root/utils/highEnergyBar/geometry'
import Browser from 'webextension-polyfill'
import { readOfficialWatchedRanges } from './officialWatched'
import store from './store'

/** 落盘节流：内存里的区间随时更新，写存储不必那么频繁。 */
const PERSIST_THROTTLE_MS = 10_000
/** 相邻区间小于该间隔就合并，避免拖动产生大量碎片。 */
const MERGE_TOLERANCE_SEC = 1.5
/** 最多保留多少个 cid 的已看记录，超出按最旧淘汰。 */
const MAX_TRACKED_CIDS = 200
/** 取数失败后的重试间隔（避免每帧重试，也不永久卡死）。 */
const CURVE_RETRY_INTERVAL_MS = 30_000

/**
 * 已看区间采集 + 高能曲线取数。
 *
 * 采集用 `HTMLMediaElement.played`，**不自己按时间采样**：
 * `played` 的语义就是「该媒体资源实际播放过的区间」，跳过/拖动经过的区间不会被标记，
 * 这正是需求要的。自己采样会踩两个坑（比例与秒混用、seeking 时把目的时间当段尾）。
 *
 * ⚠️ `played` 在**换源时会被重置**，且不持久化。因此这里的策略是：
 * 每次 timeupdate 都读一遍并合进内存（很便宜），换 cid 时再把内存里的结果落盘；
 * 同时用 `emptied`/`loadstart` 挂起采集，避免新媒体源的区间被算进旧 cid。
 */
class HighEnergyBarController {
  private video: HTMLVideoElement | null = null
  private cid = ''
  /** 我们自己采集到的已看区间（会持久化）。 */
  private ownRanges: [number, number][] = []
  /** 从 B 站 `pbp3` 只读来的已看区间（不持久化、不回写）。 */
  private officialRanges: [number, number][] = []
  /** 已经为哪个 cid 读过官方记录；官方数据需要 duration，可能要在 durationchange 后补读。 */
  private officialLoadedFor = ''
  /** 媒体源正在切换：暂存停止采集，等新的 identity 到达。 */
  private suspended = false
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private curveAbort: AbortController | null = null
  private generation = 0
  private lastCurveAttemptAt = 0

  /** 由 BilibiliVideoProvider 在每次路由/播放器更新时调用。 */
  async bind(
    video: HTMLVideoElement | null,
    identity: BilibiliVideoIdentity | null,
  ) {
    if (this.video !== video) {
      this.detachVideo()
      this.video = video
      if (video) this.attachVideo(video)
    }
    store.setDuration(video?.duration ?? 0)

    const cid = identity?.cid ?? ''
    if (cid !== this.cid) {
      await this.switchCid(cid)
      if (identity && cid) void this.loadCurve(identity)
      return
    }
    // 同一个 cid：只有在之前取数失败且已过退避时间时才重试。
    if (
      identity &&
      cid &&
      store.curveState === 'error' &&
      Date.now() - this.lastCurveAttemptAt > CURVE_RETRY_INTERVAL_MS
    )
      void this.loadCurve(identity)
  }

  /** 小窗关闭/页面卸载时调用，保证不丢最后一段。 */
  async release() {
    this.detachVideo()
    this.curveAbort?.abort()
    this.curveAbort = null
    this.generation++
    await this.persist()
  }

  /** 清除某个视频的已看记录。 */
  async clearWatched(cid: string) {
    await Browser.storage.local.remove(WATCHED_RANGES_PREFIX + cid)
    const index = (await getBrowserLocalStorage(WATCHED_RANGES_INDEX)) ?? []
    await setBrowserLocalStorage(
      WATCHED_RANGES_INDEX,
      index.filter((entry) => entry.cid !== cid),
    )
    if (cid === this.cid) {
      this.ownRanges = []
      // 官方记录在页面源的 pbp3 里，只读、不由我们清除。
      this.publish()
    }
  }

  private async switchCid(cid: string) {
    // 先把上一个 cid 的结果落盘，再切换状态。
    await this.persist()
    this.generation++
    this.cid = cid
    this.ownRanges = []
    this.officialRanges = []
    this.officialLoadedFor = ''
    this.suspended = false
    store.reset(cid)
    if (!cid) return

    const record = await getBrowserLocalStorage(watchedRangesKey(cid))
    // 读回来也做一次并集：我们自己的历史数据可能有相邻/重叠碎片。
    this.ownRanges = mergeRanges(record?.ranges ?? [], MERGE_TOLERANCE_SEC)
    this.publish()

    // 官方记录需要 duration 才能把比例换算成秒；此时可能还没拿到，交给 durationchange 重试。
    void this.loadOfficialRanges()
  }

  /**
   * 读取 B 站自己的已看记录。
   *
   * 需求是「视频自己有已播放记录就同步，没有才用自己的」，所以官方数据是**优先来源**：
   * 它与 B 站热力条的着色一致；我们自己的记录只作为补充（例如只在小窗里看过、
   * 或 B 站热力条关闭时留下的观看）。
   * 官方数据只读、不写回、也不并入我们自己的存储。
   */
  private async loadOfficialRanges() {
    const cid = this.cid
    if (!cid || this.officialLoadedFor === cid) return
    const duration = this.video?.duration ?? 0
    if (!Number.isFinite(duration) || duration <= 0) return

    this.officialLoadedFor = cid
    const ranges = await readOfficialWatchedRanges(cid, duration)
    if (cid !== this.cid) return
    this.officialRanges = mergeRanges(ranges, MERGE_TOLERANCE_SEC)
    this.publish()
  }

  /** 把「官方 ∪ 自己」的结果推给渲染层。 */
  private publish() {
    store.setWatched(
      mergeRanges(
        [...this.officialRanges, ...this.ownRanges],
        MERGE_TOLERANCE_SEC,
      ),
    )
  }

  private readPlayed() {
    const video = this.video
    if (!video) return
    const ranges: [number, number][] = []
    try {
      for (let i = 0; i < video.played.length; i++) {
        ranges.push([video.played.start(i), video.played.end(i)])
      }
    } catch {
      return
    }
    if (ranges.length === 0) return
    const merged = mergeRanges(
      [...this.ownRanges, ...ranges],
      MERGE_TOLERANCE_SEC,
    )
    // 内容没变就不要触发渲染。
    if (merged.length === this.ownRanges.length) {
      let same = true
      for (let i = 0; i < merged.length; i++) {
        if (
          merged[i][0] !== this.ownRanges[i][0] ||
          merged[i][1] !== this.ownRanges[i][1]
        ) {
          same = false
          break
        }
      }
      if (same) return
    }
    this.ownRanges = merged
    this.publish()
  }

  private schedulePersist() {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.persist()
    }, PERSIST_THROTTLE_MS)
  }

  private async persist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    const cid = this.cid
    // 只持久化我们自己采集到的部分；官方 `pbp3` 的数据只读、不回写。
    if (!cid || this.ownRanges.length === 0) return

    try {
      // 读-并-写：即使同一 cid 同时有别的标签页在写，并集也不会丢区间。
      const existing = await getBrowserLocalStorage(watchedRangesKey(cid))
      const merged = mergeRanges(
        [...(existing?.ranges ?? []), ...this.ownRanges],
        MERGE_TOLERANCE_SEC,
      )
      if (cid === this.cid) this.ownRanges = merged
      await setBrowserLocalStorage(watchedRangesKey(cid), {
        ranges: merged,
        updatedAt: Date.now(),
      } satisfies WatchedRangesRecord)
      await this.touchIndex(cid)
    } catch (error) {
      console.warn('[highEnergyBar] 保存已看区间失败', error)
    }
  }

  private async touchIndex(cid: string) {
    const index = (await getBrowserLocalStorage(WATCHED_RANGES_INDEX)) ?? []
    const next = index.filter((entry) => entry.cid !== cid)
    next.push({ cid, updatedAt: Date.now() })
    if (next.length <= MAX_TRACKED_CIDS) {
      await setBrowserLocalStorage(WATCHED_RANGES_INDEX, next)
      return
    }
    next.sort((a, b) => a.updatedAt - b.updatedAt)
    const drop = next.splice(0, next.length - MAX_TRACKED_CIDS)
    await Promise.all(
      drop.map((entry) =>
        Browser.storage.local.remove(WATCHED_RANGES_PREFIX + entry.cid),
      ),
    )
    await setBrowserLocalStorage(WATCHED_RANGES_INDEX, next)
  }

  private async loadCurve(identity: BilibiliVideoIdentity) {
    const generation = this.generation
    this.lastCurveAttemptAt = Date.now()
    this.curveAbort?.abort()
    const abort = new AbortController()
    this.curveAbort = abort
    store.setCurveLoading()
    const result = await fetchPbpCurve(identity, abort.signal)
    if (generation !== this.generation) return
    if (result.kind === 'ready') store.setCurve(result.curve)
    else if (result.kind === 'none') store.setCurve(null)
    else store.setCurveError()
  }

  private onTimeupdate = () => {
    if (this.suspended) return
    this.readPlayed()
    this.schedulePersist()
  }
  private onDurationChange = () => {
    store.setDuration(this.video?.duration ?? 0)
    // 官方已看记录存的是比例，需要 duration 才能换算成秒；
    // 切换 cid 时若还不知道时长，就在这里补读一次。
    void this.loadOfficialRanges()
  }
  private onPauseOrEnded = () => {
    if (this.suspended) return
    this.readPlayed()
    void this.persist()
  }
  /** 媒体源即将/正在更换：`played` 会被重置，先停采集，等新的 identity。 */
  private onSourceChanging = () => {
    this.suspended = true
    void this.persist()
  }

  private attachVideo(video: HTMLVideoElement) {
    video.addEventListener('timeupdate', this.onTimeupdate)
    video.addEventListener('durationchange', this.onDurationChange)
    video.addEventListener('loadedmetadata', this.onDurationChange)
    video.addEventListener('pause', this.onPauseOrEnded)
    video.addEventListener('ended', this.onPauseOrEnded)
    video.addEventListener('emptied', this.onSourceChanging)
    video.addEventListener('loadstart', this.onSourceChanging)
  }

  private detachVideo() {
    const video = this.video
    if (!video) return
    video.removeEventListener('timeupdate', this.onTimeupdate)
    video.removeEventListener('durationchange', this.onDurationChange)
    video.removeEventListener('loadedmetadata', this.onDurationChange)
    video.removeEventListener('pause', this.onPauseOrEnded)
    video.removeEventListener('ended', this.onPauseOrEnded)
    video.removeEventListener('emptied', this.onSourceChanging)
    video.removeEventListener('loadstart', this.onSourceChanging)
  }
}

export default new HighEnergyBarController()
