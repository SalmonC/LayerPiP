import type { PbpCurve } from '@root/api/bilibili/pbp'
import { makeAutoObservable } from 'mobx'

export type CurveState = 'idle' | 'loading' | 'ready' | 'none' | 'error'

/**
 * 高能进度条在渲染层需要的全部状态。
 *
 * 这里只放「当前 cid 的展示数据」，采集与取数都在 controller 里；
 * 组件只读这个 store，不自己发请求、不自己读写存储。
 */
class HighEnergyBarStore {
  cid = ''
  duration = 0
  /** 已看区间，**单位是秒**；渲染时才换算成 0–1 比例。 */
  watched: [number, number][] = []
  curve: PbpCurve | null = null
  curveState: CurveState = 'idle'
  /** 已看区间是否已从存储加载完成（避免加载前闪一下「全部未看」）。 */
  watchedLoaded = false

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
  }

  setDuration(duration: number) {
    this.duration = Number.isFinite(duration) && duration > 0 ? duration : 0
  }

  setWatched(ranges: [number, number][]) {
    this.watched = ranges
    this.watchedLoaded = true
  }

  setCurveLoading() {
    this.curveState = 'loading'
  }

  setCurve(curve: PbpCurve | null) {
    this.curve = curve
    // 正常没有曲线（弹幕量不足）与加载失败要能区分开。
    this.curveState = curve ? 'ready' : 'none'
  }

  setCurveError() {
    this.curve = null
    this.curveState = 'error'
  }

  /** 切换视频/cid 时清空，避免把上一个视频的曲线或已看区间画到新视频上。 */
  reset(cid: string) {
    this.cid = cid
    this.watched = []
    this.watchedLoaded = false
    this.curve = null
    this.curveState = 'idle'
  }
}

export default new HighEnergyBarStore()
