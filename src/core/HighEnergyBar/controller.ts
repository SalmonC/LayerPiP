import { fetchPbpCurve } from '@root/api/bilibili/pbp'
import type { BilibiliVideoIdentity } from '@root/core/SubtitleSource/types'
import { watchedRangesKey } from '@root/shared/storeKey'
import WebextEvent from '@root/shared/webextEvent'
import { getBrowserLocalStorage } from '@root/utils/storage'
import { mergeRanges } from '@root/utils/highEnergyBar/geometry'
import { sendMessage } from 'webext-bridge/content-script'
import { readOfficialWatchedRanges } from './officialWatched'
import store from './store'

/** 落盘节流：内存里的区间随时更新，写存储不必那么频繁。 */
const PERSIST_THROTTLE_MS = 10_000
/** 相邻区间小于该间隔就合并，避免拖动产生大量碎片。 */
const MERGE_TOLERANCE_SEC = 1.5
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
  private resolveIdentity?: () => void
  private sourceRevision = 0
  private boundSourceRevision = 0
  private boundSource = ''
  private awaitingSource = false
  private identity: BilibiliVideoIdentity | null = null

  /** Immediately fence old samples/responses before asynchronous identity lookup. */
  suspend() {
    this.suspended = true
    this.officialLoadedFor = ''
    this.generation++
    this.curveAbort?.abort()
    void this.persist()
    return this.generation
  }

  async bind(
    video: HTMLVideoElement | null,
    identity: BilibiliVideoIdentity | null,
    resolveIdentity?: () => void,
    expectedGeneration = this.generation,
  ) {
    if (expectedGeneration !== this.generation) return
    const sameVideo = this.video === video
    const generation = ++this.generation
    const cid = identity?.cid ?? ''
    if (this.video !== video) {
      if (!this.suspended) this.readPlayed()
      this.detachVideo()
      this.video = video
      if (video) this.attachVideo(video)
    }
    this.resolveIdentity = resolveIdentity
    this.identity = identity
    store.setDuration(video?.duration ?? 0)
    if (cid !== this.cid) {
      // A route can resolve before the media resource changes. Do not attribute
      // the old element's played ranges to the new cid during that interval.
      this.awaitingSource =
        !!this.cid &&
        sameVideo &&
        this.boundSource === video?.currentSrc &&
        this.boundSourceRevision === this.sourceRevision
      // Snapshot the old cid synchronously; never await storage before switching.
      void this.persist()
      this.curveAbort?.abort()
      this.cid = cid
      this.ownRanges = []
      this.officialRanges = []
      this.officialLoadedFor = ''
      store.reset(cid)
    }
    this.boundSource = video?.currentSrc ?? ''
    this.boundSourceRevision = this.sourceRevision
    this.suspended = !cid || !video || this.awaitingSource
    if (this.suspended) return
    try {
      const record = await getBrowserLocalStorage(watchedRangesKey(cid))
      if (generation !== this.generation) return
      this.ownRanges = mergeRanges(
        [...this.ownRanges, ...(record?.ranges ?? [])],
        MERGE_TOLERANCE_SEC,
      )
    } catch (error) {
      if (generation !== this.generation) return
      console.warn('[highEnergyBar] 读取已看区间失败', error)
    }
    this.readPlayed()
    this.publish()
    void this.loadOfficialRanges()
    if (
      identity &&
      (store.curveState === 'idle' ||
        store.curveState === 'loading' ||
        (store.curveState === 'error' &&
          Date.now() - this.lastCurveAttemptAt > CURVE_RETRY_INTERVAL_MS))
    )
      void this.loadCurve(identity)
  }

  /** Release also clears the video reference so reopening attaches listeners. */
  async release() {
    if (!this.suspended) this.readPlayed()
    const pending = this.persist()
    this.detachVideo()
    this.video = null
    this.resolveIdentity = undefined
    this.identity = null
    this.curveAbort?.abort()
    this.curveAbort = null
    this.generation++
    this.cid = ''
    this.awaitingSource = false
    this.boundSource = ''
    this.suspended = true
    this.ownRanges = []
    this.officialRanges = []
    this.officialLoadedFor = ''
    store.reset('')
    await pending
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
    const generation = this.generation
    if (!cid || this.suspended || this.officialLoadedFor === cid) return
    const duration = this.video?.duration ?? 0
    if (!Number.isFinite(duration) || duration <= 0) return

    this.officialLoadedFor = cid
    const ranges = await readOfficialWatchedRanges(cid, duration)
    if (generation !== this.generation) return
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
    if (!video || !this.cid || this.suspended) return
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

    const ranges = this.ownRanges.map(([start, end]): [number, number] => [
      start,
      end,
    ])
    const generation = this.generation
    try {
      const merged = await sendMessage(WebextEvent.mergeWatchedRanges, {
        cid,
        ranges,
      })
      if (generation === this.generation && cid === this.cid) {
        this.ownRanges = mergeRanges(
          [...this.ownRanges, ...merged],
          MERGE_TOLERANCE_SEC,
        )
        this.publish()
      }
    } catch (error) {
      console.warn('[highEnergyBar] 保存已看区间失败', error)
    }
  }

  private async loadCurve(identity: BilibiliVideoIdentity) {
    const generation = this.generation
    this.lastCurveAttemptAt = Date.now()
    this.curveAbort?.abort()
    const abort = new AbortController()
    this.curveAbort = abort
    store.setCurveLoading()
    const result = await fetchPbpCurve(identity, abort.signal)
    if (generation !== this.generation || abort.signal.aborted) return
    if (result.kind === 'ready') store.setCurve(result.curve)
    else if (result.kind === 'none') store.setCurve(null)
    else store.setCurveError()
  }

  private onTimeupdate = () => {
    if (this.suspended) return
    this.readPlayed()
    this.schedulePersist()
    if (
      this.identity &&
      store.curveState === 'error' &&
      Date.now() - this.lastCurveAttemptAt > CURVE_RETRY_INTERVAL_MS
    )
      void this.loadCurve(this.identity)
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
    this.sourceRevision++
    this.awaitingSource = false
    this.suspend()
  }
  private onMetadata = () => {
    this.onDurationChange()
    this.resolveIdentity?.()
  }

  private attachVideo(video: HTMLVideoElement) {
    video.addEventListener('timeupdate', this.onTimeupdate)
    video.addEventListener('durationchange', this.onDurationChange)
    video.addEventListener('loadedmetadata', this.onMetadata)
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
    video.removeEventListener('loadedmetadata', this.onMetadata)
    video.removeEventListener('pause', this.onPauseOrEnded)
    video.removeEventListener('ended', this.onPauseOrEnded)
    video.removeEventListener('emptied', this.onSourceChanging)
    video.removeEventListener('loadstart', this.onSourceChanging)
  }
}

export default new HighEnergyBarController()
