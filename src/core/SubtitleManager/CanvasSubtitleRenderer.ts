import configStore from '@root/store/config'
import { subtitleParagraphs } from './presentation'
import type SubtitleManager from '.'

export default class CanvasSubtitleRenderer {
  constructor(private subtitleManager: SubtitleManager) {}

  draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const manager = this.subtitleManager
    if (!manager.showSubtitle) return
    const paragraphs = subtitleParagraphs(
      manager.snapshot,
      configStore.subtitle_historyEnabled,
      configStore.subtitle_historyCount,
    )
    const configured = Number(configStore.subtitle_fontSize) || 18
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
    let bottom = height - Math.max(12, height * 0.065)
    if (!manager.snapshot.current.length) bottom -= fontSize * 1.35
    const historyTop = height - Math.max(12, height * 0.065) - height * 0.35
    ctx.save()
    try {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const { row, history } of paragraphs.slice().reverse()) {
        const size = history ? Math.max(12, fontSize * 0.9) : fontSize
        const lines = this.wrapText(ctx, row.text, width * 0.88, size)
        const lineHeight = size * 1.35,
          padding = 4
        const blockHeight = lines.length * lineHeight + padding * 2
        const top = bottom - blockHeight
        if (history && top < historyTop) break
        ctx.font = `${configStore.subtitle_fontWeight} ${size}px ${configStore.subtitle_fontFamily}`
        const textWidth = Math.max(
          0,
          ...lines.map((line) => ctx.measureText(line).width),
        )
        const alpha = configStore.subtitle_opacity * (history ? 0.7 : 1)
        ctx.globalAlpha = alpha * configStore.subtitle_bgOpacity
        ctx.fillStyle = configStore.subtitle_bg
        this.roundRect(
          ctx,
          (width - textWidth) / 2 - 8,
          top,
          textWidth + 16,
          blockHeight,
          3,
        )
        ctx.fill()
        ctx.globalAlpha = alpha * configStore.subtitle_fontOpacity
        ctx.fillStyle = configStore.subtitle_fontColor
        lines.forEach((line, index) =>
          ctx.fillText(
            line,
            width / 2,
            top + padding + lineHeight * (index + 0.5),
          ),
        )
        bottom = top - 4
      }
    } finally {
      ctx.restore()
    }
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    fontSize: number,
  ) {
    ctx.save()
    ctx.font = `${Number(configStore.subtitle_fontWeight) || 600} ${fontSize}px ${configStore.subtitle_fontFamily}`
    const result: string[] = []
    for (const sourceLine of text.split(/\r?\n/)) {
      let line = ''
      for (const character of sourceLine) {
        const next = line + character
        if (line && ctx.measureText(next).width > maxWidth) {
          result.push(line)
          line = character
        } else {
          line = next
        }
      }
      if (line) result.push(line)
    }
    ctx.restore()
    return result
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ) {
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, radius)
  }
}
