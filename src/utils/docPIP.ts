/**
 * 快速隐藏（quickHideToggle）时窗口被缩到的尺寸。
 * 它只表示"被收起"，不是用户选择的窗口大小，因此既不能作为下次打开的尺寸，
 * 也不能被当成关闭时的窗口几何保存下来。
 * 注意：该值同时被 WebProvider 的隐藏逻辑和此处的有效性判断使用，只在此处定义一份。
 */
export const DOC_PIP_QUICK_HIDE_SIZE = { width: 240, height: 52 } as const

/**
 * 可作为"窗口几何"的最小尺寸。
 * 低于此值的几何一律视为无效（例如快速隐藏残留、创建过程中的中间态），
 * 读取时忽略并回退到视频尺寸，保存时直接跳过。
 * 阈值高于 DOC_PIP_QUICK_HIDE_SIZE，以便把快速隐藏残留下来的几何挡掉。
 */
export const DOC_PIP_MIN_USABLE_SIZE = { width: 320, height: 180 } as const

/** 判断一份窗口几何是否可用；非法数值（NaN/Infinity/非数字）一律不可用。 */
export function isUsableDocPIPSize(
  width: unknown,
  height: unknown,
): width is number {
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= DOC_PIP_MIN_USABLE_SIZE.width &&
    height >= DOC_PIP_MIN_USABLE_SIZE.height
  )
}

export function resizeDocPIPWindow(
  docPIPWindow: Window | undefined,
  size: Partial<{ width: number; height: number }>,
) {
  if (!docPIPWindow) return
  const [borX, borY] = getDocPIPBorderSize(docPIPWindow)
  const [width, height] = [
    size.width || docPIPWindow.innerWidth + borX,
    size.height || docPIPWindow.innerHeight + borY,
  ]

  docPIPWindow.resizeTo(width, height)
}

export function getDocPIPBorderSize(docPIPWindow: Window | undefined) {
  if (!docPIPWindow) return [0, 0]
  return [
    docPIPWindow.outerWidth - docPIPWindow.innerWidth,
    docPIPWindow.outerHeight - docPIPWindow.innerHeight,
  ]
}
