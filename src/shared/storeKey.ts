import type configStore from '@root/store/config'
import { Language } from '@root/utils/i18n'
import type { SubtitleSourceBindings } from '@root/core/SubtitleSource/types'

function key<T = any>(key: string) {
  return key as string & { __key: T }
}

export type KeyType<T extends { __key: any }> = T['__key']

export const FLOAT_BTN_HIDDEN = key<boolean>('LAYERPIP_FLOAT_BUTTON_HIDDEN_V1')
export const PIP_WINDOW_CONFIG = key<{
  width: number
  height: number
  left: number
  top: number
  mainDPR: number
  pipDPR: number
}>('LAYERPIP_WINDOW_CONFIG_V1')
export const DM_MINI_PLAYER_CONFIG =
  key<Partial<typeof configStore>>('LAYERPIP_CONFIG_V1')

export const DRAG_POS = key<{
  x: number
  y: number
  xType: 'left' | 'right'
  yType: 'top' | 'bottom'
}>('LAYERPIP_DRAG_POSITION_V1')

export const LATEST_SAVE_VERSION = key<string>(
  'LAYERPIP_LATEST_SAVE_VERSION_V1',
)

export const LOCALE = key<Language>('LAYERPIP_LOCALE_V1')

export const DANMAKU_VISIBLE = key<boolean>('LAYERPIP_DANMAKU_VISIBLE_V1')

export const NEED_RELOAD = key<boolean>('LAYERPIP_NEED_RELOAD_V1')

/** 按 B 站 aid + cid 保存的原生小窗字幕来源，不参与浏览器同步。 */
export const SUBTITLE_SOURCE_BINDINGS = key<SubtitleSourceBindings>(
  'LAYERPIP_SUBTITLE_SOURCE_BINDINGS_V1',
)

/**
 * 「已看区间」按 cid 分键保存，不参与浏览器同步。
 * 值形如 `{ ranges: [[startSec, endSec], ...], updatedAt: number }`。
 */
export const WATCHED_RANGES_PREFIX = 'LAYERPIP_WATCHED_V1:'

/** 已看区间的 cid 索引，用于按时间淘汰，避免本地存储无限增长。 */
export const WATCHED_RANGES_INDEX = key<{ cid: string; updatedAt: number }[]>(
  'LAYERPIP_WATCHED_INDEX_V1',
)

/** 单个视频的已看记录；区间单位为**秒**。 */
export type WatchedRangesRecord = {
  ranges: [number, number][]
  updatedAt: number
}

/**
 * 已看记录是按 cid 分键存的，所以键名要在运行期拼。
 * 用这个工厂而不是直接传字符串：`getBrowserLocalStorage` 的泛型参数是**键**类型，
 * 传裸字符串会拿不到值类型。
 */
export const watchedRangesKey = (cid: string) =>
  key<WatchedRangesRecord>(WATCHED_RANGES_PREFIX + cid)
