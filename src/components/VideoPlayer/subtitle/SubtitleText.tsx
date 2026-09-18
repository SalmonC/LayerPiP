import SubtitleManager from '@root/core/SubtitleManager'
import { subtitleParagraphs } from '@root/core/SubtitleManager/presentation'
import configStore from '@root/store/config'
import { observer } from 'mobx-react'
import { useLayoutEffect, useRef, useState, type FC } from 'react'

const SubtitleText: FC<{ subtitleManager: SubtitleManager }> = observer(
  ({ subtitleManager }) => {
    const ref = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(500)
    const configured = configStore.subtitle_fontSize
    const fontSize = configStore.subtitle_autoSize
      ? Math.max(
          configured,
          Math.min(
            configStore.subtitle_autoSize_maxSize,
            ((configured * width) / configStore.subtitle_autoSize_startWidth) *
              configStore.subtitle_autoSize_scaleRate,
          ),
        )
      : configured
    const paragraphs = subtitleParagraphs(
      subtitleManager.snapshot,
      configStore.subtitle_historyEnabled,
      configStore.subtitle_historyCount,
    )

    useLayoutEffect(() => {
      const container = ref.current
      const player = container?.closest<HTMLElement>('.video-player-v2')
      if (!container || !player) return
      const fit = () => {
        setWidth(container.clientWidth)
        const history = [
          ...container.querySelectorAll<HTMLElement>('[data-history="true"]'),
        ]
        history.forEach((el) => {
          el.style.display = ''
        })
        const currentHeight = [
          ...container.querySelectorAll<HTMLElement>('[data-history="false"]'),
        ].reduce((height, el) => height + el.offsetHeight + 4, 0)
        let remaining = Math.max(
          0,
          player.clientHeight * 0.35 - Math.max(currentHeight, fontSize * 1.35),
        )
        let full = false
        for (const el of history.reverse()) {
          const height = el.offsetHeight + 4
          if (full || height > remaining) {
            el.style.display = 'none'
            full = true
          } else remaining -= height
        }
      }
      fit()
      const resize = new ResizeObserver(fit)
      resize.observe(player)
      return () => resize.disconnect()
    }, [
      subtitleManager.snapshot,
      configStore.subtitle_historyEnabled,
      configStore.subtitle_historyCount,
      fontSize,
    ])

    return (
      <div
        ref={ref}
        className="vp-subtitle w-full flex flex-col items-center px-[24px]"
        style={{
          opacity: subtitleManager.showSubtitle
            ? configStore.subtitle_opacity
            : 0,
          pointerEvents: 'none',
        }}
      >
        {paragraphs.map(({ row, history }) => (
          <div
            key={(history ? 'h-' : 'c-') + row.id}
            data-history={String(history)}
            style={{
              position: 'relative',
              maxWidth: '100%',
              padding: '2px 8px',
              marginBottom: 4,
              color: configStore.subtitle_fontColor,
              fontFamily: configStore.subtitle_fontFamily,
              fontWeight: configStore.subtitle_fontWeight,
              fontSize: history ? Math.max(12, fontSize * 0.9) : fontSize,
              opacity: configStore.subtitle_fontOpacity * (history ? 0.7 : 1),
              lineHeight: 1.35,
              whiteSpace: 'pre-line',
              overflowWrap: 'anywhere',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 3,
                background: configStore.subtitle_bg,
                opacity: configStore.subtitle_bgOpacity,
              }}
            />
            <span style={{ position: 'relative' }}>{row.text}</span>
          </div>
        ))}
        {!!paragraphs.length && !subtitleManager.snapshot.current.length && (
          <div style={{ height: fontSize * 1.35 }} />
        )}
      </div>
    )
  },
)
export default SubtitleText
