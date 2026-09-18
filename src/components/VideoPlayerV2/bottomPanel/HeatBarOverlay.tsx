import highEnergyBarStore from '@root/core/HighEnergyBar/store'
import configStore from '@root/store/config'
import {
  calcPoints,
  downsamplePoints,
  generateBezierCurvePath,
  generateZebraPath,
  rangesToRatios,
  SVG_HEIGHT,
  SVG_WIDTH,
} from '@root/utils/highEnergyBar/geometry'
import { observer } from 'mobx-react'
import {
  type CSSProperties,
  type FC,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react'

/** 长视频降采样上限：只影响显示，不影响存储。 */
const MAX_CURVE_POINTS = 400
/** 没有官方曲线时的「纯色带」厚度（SVG 单位，viewBox 高 100）。 */
const FLAT_BAND_HEIGHT = 8

type Props = {
  duration: number
  playedPercent: number
  color: string
}

/**
 * 高能进度条覆盖层。放在 `.played-progress-bar` 内部，因此会**自动**出现在增强小窗
 * （进度条本身就跟播放器一起被移进 PiP 文档）。
 *
 * 两条渲染路径：
 * - **有官方曲线**：画成弹幕密度面积（未看 = 白 20%，已看 = 主题色裁剪）。
 * - **没有官方曲线**：退化成一条纯色带（同样未看灰白、已看主题色），
 *   这样「无论视频有没有原生热力条都生效」。
 *
 * 语义边界：覆盖层只表达**历史已看区间**，不参与「本次播放位置」；
 * 主轨道（`.rc-slider-track` / `.bottom-progress`）保持原样不动。
 */
const HeatBarOverlay: FC<Props> = observer(
  ({ duration, playedPercent, color }) => {
    const clipSeed = useId().replace(/[^a-zA-Z0-9_-]/g, '')
    const lineRef = useRef<SVGLineElement>(null)
    const { watched, curve } = highEnergyBarStore

    const points = useMemo(() => {
      if (!configStore.highEnergyBar_curve || !curve || duration <= 0) return []
      return downsamplePoints(
        calcPoints(curve.points, curve.stepSec, duration),
        MAX_CURVE_POINTS,
      )
    }, [curve, duration])

    const curvePath = useMemo(() => generateBezierCurvePath(points), [points])
    const watchedPath = useMemo(
      () => generateZebraPath(rangesToRatios(watched, duration)),
      [watched, duration],
    )

    // 每帧只改这一条竖线的位置，不重建路径字符串。
    useEffect(() => {
      const x = ((playedPercent / 100) * SVG_WIDTH).toFixed(1)
      lineRef.current?.setAttribute('x1', x)
      lineRef.current?.setAttribute('x2', x)
    }, [playedPercent])

    if (!configStore.highEnergyBar_show || duration <= 0) return null

    const hasCurve = curvePath.length > 0
    const curveClipId = `${clipSeed}-curve`
    const watchedClipId = `${clipSeed}-watched`
    // 有曲线时用曲线形状裁剪整块面积；没有曲线时退化成底部一条纯色带。
    const bandY = hasCurve ? 0 : SVG_HEIGHT - FLAT_BAND_HEIGHT
    const bandHeight = hasCurve ? SVG_HEIGHT : FLAT_BAND_HEIGHT

    return (
      <svg
        className="fc-heatbar"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ '--heatbar-color': color } as CSSProperties}
      >
        <defs>
          {hasCurve && (
            <clipPath id={curveClipId} clipPathUnits="userSpaceOnUse">
              <path d={curvePath} />
            </clipPath>
          )}
          <clipPath id={watchedClipId} clipPathUnits="userSpaceOnUse">
            <path d={watchedPath} />
          </clipPath>
        </defs>
        <g
          fillOpacity={0.2}
          clipPath={hasCurve ? `url(#${curveClipId})` : undefined}
        >
          <rect
            x="0"
            y={bandY}
            width={SVG_WIDTH}
            height={bandHeight}
            fill="rgba(255, 255, 255)"
          />
          <rect
            x="0"
            y={bandY}
            width={SVG_WIDTH}
            height={bandHeight}
            fill="var(--heatbar-color, #00a1d6)"
            clipPath={`url(#${watchedClipId})`}
          />
        </g>
        <line
          ref={lineRef}
          y1="0"
          y2={SVG_HEIGHT}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={1}
        />
      </svg>
    )
  },
)

export default HeatBarOverlay
