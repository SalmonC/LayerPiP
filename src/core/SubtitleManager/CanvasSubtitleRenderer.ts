import configStore from '@root/store/config'
import type SubtitleManager from '.'

export default class CanvasSubtitleRenderer {
  constructor(private subtitleManager: SubtitleManager) {}

  draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const manager = this.subtitleManager
    if (!manager.showSubtitle || !manager.activeRows.size) return

    const configuredSize = Number(configStore.subtitle_fontSize) || 18
    const scale = configStore.subtitle_autoSize
      ? Math.min(
          Number(configStore.subtitle_autoSize_maxSize) / configuredSize,
          Math.max(
            1,
            (width / Number(configStore.subtitle_autoSize_startWidth)) *
              Number(configStore.subtitle_autoSize_scaleRate),
          ),
        )
      : 1
    const fontSize = Math.max(12, Math.round(configuredSize * scale))
    const lineHeight = Math.round(fontSize * 1.35)
    const paddingX = Math.round(fontSize * 0.55)
    const paddingY = Math.round(fontSize * 0.28)
    const maxTextWidth = width * 0.88
    const lines = Array.from(manager.activeRows).flatMap((row) =>
      this.wrapText(ctx, row.text, maxTextWidth, fontSize),
    )
    if (!lines.length) return

    ctx.save()
    ctx.font = `${Number(configStore.subtitle_fontWeight) || 600} ${fontSize}px ${configStore.subtitle_fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const textWidth = Math.min(
      maxTextWidth,
      Math.max(...lines.map((line) => ctx.measureText(line).width)),
    )
    const blockHeight = lines.length * lineHeight + paddingY * 2
    const centerX = width / 2
    const bottom = height - Math.max(12, height * 0.065)
    const top = bottom - blockHeight

    ctx.globalAlpha = Number(configStore.subtitle_bgOpacity)
    ctx.fillStyle = configStore.subtitle_bg
    this.roundRect(
      ctx,
      centerX - textWidth / 2 - paddingX,
      top,
      textWidth + paddingX * 2,
      blockHeight,
      Math.max(4, fontSize * 0.25),
    )
    ctx.fill()

    ctx.globalAlpha =
      Number(configStore.subtitle_opacity) *
      Number(configStore.subtitle_fontOpacity)
    ctx.fillStyle = configStore.subtitle_fontColor
    lines.forEach((line, index) => {
      ctx.fillText(
        line,
        centerX,
        top + paddingY + lineHeight * (index + 0.5),
        maxTextWidth,
      )
    })
    ctx.restore()
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
