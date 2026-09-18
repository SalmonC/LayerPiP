/**
 * 高能进度条（pbp）几何计算。
 *
 * 这里的数值与公式全部来自 B 站官方播放器实现（chunk `npd.911.<hash>.js`：
 * `svgW=1000`、`svgH=100`、`increasedHeightRatio=0.2`，以及 `calcPoints` /
 * `generateBezierCurvePath` / `generateZebraPath`）。改动前请先对拍，不要凭感觉调参。
 *
 * 坐标约定：viewBox 为 `0 0 1000 100`，`preserveAspectRatio="none"`。
 * 峰值 `ratioH=1` → `y=0`；零值 `ratioH=0` → `y=80`；底部 20 单位留白。
 */

export const SVG_WIDTH = 1000
export const SVG_HEIGHT = 100
/** 底部留白占高度的比例，官方为 0.2。 */
export const INCREASED_HEIGHT_RATIO = 0.2

export interface CurvePoint {
  value: number
  /** 高度比例，峰值 = 1 */
  ratioH: number
  /** 横向比例，0–1 */
  ratioW: number
}

/**
 * 把接口返回的弹幕密度序列归一化。
 *
 * 关键点（照抄官方）：
 * - 先按 `floor(duration / stepSec)` 补零到预期长度；
 * - 再除以最大值得到 `ratioH`（最大值为 0 时兜底 1，避免除零）；
 * - `ratioW` 用下标除以**补零后**的数组长度。
 */
export function calcPoints(
  data: readonly number[],
  stepSec: number,
  duration: number,
): CurvePoint[] {
  if (
    !Number.isFinite(stepSec) ||
    stepSec <= 0 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    data.length === 0
  )
    return []

  const expected = Math.floor(duration / stepSec)
  const values =
    expected > data.length
      ? data.concat(new Array<number>(expected - data.length).fill(0))
      : data.slice()

  const max = values.reduce((a, b) => (a > b ? a : b), 0) || 1

  return values.map((value, index) => ({
    value,
    ratioH: value / max,
    ratioW: index / values.length,
  }))
}

/**
 * 生成曲线面积路径。
 *
 * 用水平控制点的三次贝塞尔得到官方的「圆肩平台」形态，最后闭合到底边，
 * 因此画出来是**填充面积**而不是一条线。点数少于 2 时返回空串
 * （调用前应已判定为「无曲线」）。
 */
export function generateBezierCurvePath(points: readonly CurvePoint[]): string {
  if (points.length < 2) return ''

  const pad = INCREASED_HEIGHT_RATIO * SVG_HEIGHT
  const radius = (points[1].ratioW * SVG_WIDTH) / 2
  const out = [`M 0 ${SVG_HEIGHT} L 0 ${SVG_HEIGHT - pad}`]

  let prevX = 0
  let prevY = SVG_HEIGHT - pad
  // 收尾补一个零点，让曲线落回基线。
  const seq = points.concat([{ value: 0, ratioH: 0, ratioW: 1 }])

  for (let i = 1; i < seq.length; i++) {
    const point = seq[i]
    const x = point.ratioW * SVG_WIDTH
    const y =
      SVG_HEIGHT -
      (pad + (1 - INCREASED_HEIGHT_RATIO) * point.ratioH * SVG_HEIGHT)
    const cx = prevX + radius
    out.push(
      `C ${cx.toFixed(1)} ${prevY.toFixed(1)}, ${cx.toFixed(1)} ${y.toFixed(
        1,
      )}, ${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    prevX = x
    prevY = y
  }

  out.push(`L ${SVG_WIDTH} ${SVG_HEIGHT} Z`)
  return out.join(' ')
}

/**
 * 生成「已看区间」的裁剪路径：每个区间是一个全高矩形。
 * 入参是 0–1 的比例，调用方负责用 duration 换算。
 */
export function generateZebraPath(
  areas: readonly (readonly [number, number])[],
): string {
  return areas
    .map(([start, end]) => {
      const x1 = (SVG_WIDTH * start).toFixed(2)
      const x2 = (SVG_WIDTH * end).toFixed(2)
      return `M ${x1} ${SVG_HEIGHT} H ${x2} V 0 H ${x1} Z`
    })
    .join(' ')
}

/**
 * 合并区间并集（**本项目自己实现，不要照抄官方**）。
 *
 * 官方 `pbpZebraCache` 里存在未合并的重叠区间（实测同时出现
 * `[0,0.1411]` 与 `[0.0712,0.1411]`），因此必须自己做一次正确的并集：
 * 排序后处理包含 / 相邻 / 跨越 / 完全重叠。
 *
 * @param ranges 任意顺序的区间，单位由调用方决定（本项目统一用秒）
 * @param tolerance 小于该间隔的相邻区间会被合并，避免产生碎片
 */
export function mergeRanges(
  ranges: readonly (readonly [number, number])[],
  tolerance = 0,
): [number, number][] {
  const valid = ranges
    .filter(
      ([start, end]) =>
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end > start &&
        start >= 0,
    )
    .map(([start, end]) => [start, end] as [number, number])
    .sort((a, b) => a[0] - b[0])

  const merged: [number, number][] = []
  for (const [start, end] of valid) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1] + tolerance) {
      if (end > last[1]) last[1] = end
      continue
    }
    merged.push([start, end])
  }
  return merged
}

/** 把秒级区间换算成 0–1 比例，供 SVG 裁剪路径使用。 */
export function rangesToRatios(
  ranges: readonly (readonly [number, number])[],
  duration: number,
): [number, number][] {
  if (!Number.isFinite(duration) || duration <= 0) return []
  return ranges
    .map(([start, end]) => {
      const a = Math.min(1, Math.max(0, start / duration))
      const b = Math.min(1, Math.max(0, end / duration))
      return [a, b] as [number, number]
    })
    .filter(([a, b]) => b > a)
}

/**
 * 长视频降采样：按目标点数抽取，但**保留时间位置与峰值**。
 * 只做等距抽取会把尖峰抹平，所以每个桶取该桶内的最大值。
 */
export function downsamplePoints(
  points: readonly CurvePoint[],
  maxPoints: number,
): CurvePoint[] {
  if (maxPoints <= 0 || points.length <= maxPoints) return points.slice()

  const bucketSize = points.length / maxPoints
  const out: CurvePoint[] = []
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucketSize)
    const end = Math.min(points.length, Math.floor((i + 1) * bucketSize))
    let peak = points[start]
    for (let j = start + 1; j < end; j++) {
      if (points[j].value > peak.value) peak = points[j]
    }
    out.push(peak)
  }
  return out
}
