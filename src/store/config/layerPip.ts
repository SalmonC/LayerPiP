import { DocPIPRenderType, PipMode } from '@root/types/config'

/** Hidden runtime invariants for the focused LayerPiP product. */
export const LAYER_PIP_CORE_CONFIG = {
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
  disable_sites: [] as string[],
} as const

export const LAYER_PIP_VISIBLE_DEFAULTS = {
  aiSubtitleEnabled: false,
  pipMode: PipMode.document,
  nativeCompositeOptIn: false,
  floatButtonVisible: true,
  pauseInClose_video: true,
  disable_scrollToChangeVolume: false,
  videoNoBorder: 'default',
  playbackRate: 3,
  subtitle_opacity: 1,
  subtitle_historyEnabled: true,
  subtitle_historyCount: 2,
  subtitle_bgOpacity: 0.45,
  subtitle_fontSize: 18,
  subtitle_fontColor: '#ffffff',
  opacity: 0.9,
  fontSize: 18,
  danSpeed: 20,
  maxTunnel: '1/2',
} as const

export const LAYER_PIP_SAFE_DEFAULTS = {
  ...LAYER_PIP_VISIBLE_DEFAULTS,
  ...LAYER_PIP_CORE_CONFIG,
}

export function normalizeLayerPipConfig<T extends Record<string, unknown>>(
  config: T,
): T & typeof LAYER_PIP_CORE_CONFIG {
  const pipMode =
    config.pipMode === PipMode.nativeComposite &&
    config.nativeCompositeOptIn === true
      ? PipMode.nativeComposite
      : PipMode.document
  const normalized = {
    ...config,
    ...LAYER_PIP_CORE_CONFIG,
    pipMode,
    nativeCompositeOptIn:
      pipMode === PipMode.nativeComposite &&
      config.nativeCompositeOptIn === true,
  } as T & typeof LAYER_PIP_CORE_CONFIG
  const ranges: Record<string, [number, number, number]> = {
    subtitle_historyCount: [1, 5, 2],
    subtitle_opacity: [0, 1, 1],
    subtitle_bgOpacity: [0, 1, 0.45],
    subtitle_fontSize: [10, 72, 18],
    opacity: [0, 1, 0.9],
    fontSize: [10, 72, 18],
    danSpeed: [1, 100, 20],
    playbackRate: [0.25, 16, 3],
  }
  const values = normalized as Record<string, unknown>
  for (const [key, [min, max, fallback]] of Object.entries(ranges)) {
    const value = values[key]
    values[key] =
      typeof value === 'number' && Number.isFinite(value)
        ? Math.min(
            max,
            Math.max(
              min,
              key === 'subtitle_historyCount' ? Math.floor(value) : value,
            ),
          )
        : fallback
  }
  if (typeof values.subtitle_historyEnabled !== 'boolean')
    values.subtitle_historyEnabled = true
  if (typeof values.aiSubtitleEnabled !== 'boolean')
    values.aiSubtitleEnabled = false
  delete values.useDocPIP
  return normalized
}
