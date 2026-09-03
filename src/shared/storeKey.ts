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
