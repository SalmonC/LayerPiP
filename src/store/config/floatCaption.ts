import { DocPIPRenderType } from '@root/types/config'

/** Hidden runtime invariants for the focused FloatCaption product. */
export const FLOAT_CAPTION_CORE_CONFIG = {
  useDocPIP: true,
  docPIP_renderType: DocPIPRenderType.replaceVideoEl,
  injectPIPFn: true,
  showReplacerBtn: false,
  vpActionAreaLock: false,
  bp_preVideo: true,
  bp_playToggle: true,
  bp_nextVideo: true,
  bp_subtitle: true,
  bp_danmaku: true,
  bp_danmakuInput: false,
  bp_playbackRate: true,
  bp_resize: true,
  keyboardTips_show: true,
  bp_volume: true,
  bp_sharpening: false,
  autoPIP_inPageHide: false,
  autoPIP_inScrollToInvisible: false,
  autoPIP_closeInReturnToOriginPos: false,
  useHtmlDanmaku: true,
  htmlDanmakuEngine: 'Apades',
  videoProgress_show: true,
  videoSharpening: false,
  performanceInfo: false,
  vpBufferTest: false,
  FPS_limitOffsetAccurate: false,
  dragArea_show: false,
  disable_sites: [],
} as const

export const FLOAT_CAPTION_VISIBLE_DEFAULTS = {
  floatButtonVisible: true,
  pauseInClose_video: true,
  disable_scrollToChangeVolume: false,
  videoNoBorder: 'default',
  playbackRate: 3,
  subtitle_opacity: 1,
  subtitle_bgOpacity: 0.45,
  subtitle_fontSize: 18,
  subtitle_fontColor: '#ffffff',
  opacity: 0.9,
  fontSize: 18,
  danSpeed: 20,
  maxTunnel: '1/2',
} as const

export const FLOAT_CAPTION_SAFE_DEFAULTS = {
  ...FLOAT_CAPTION_VISIBLE_DEFAULTS,
  ...FLOAT_CAPTION_CORE_CONFIG,
}

export function normalizeFloatCaptionConfig<T extends Record<string, unknown>>(
  config: T,
): T & typeof FLOAT_CAPTION_CORE_CONFIG {
  return { ...config, ...FLOAT_CAPTION_CORE_CONFIG }
}
