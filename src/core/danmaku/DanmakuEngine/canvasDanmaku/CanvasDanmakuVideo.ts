import CanvasVideo from '@root/core/CanvasVideo'
import { PlayerEvent } from '@root/core/event'
import type SubtitleManager from '@root/core/SubtitleManager'
import CanvasSubtitleRenderer from '@root/core/SubtitleManager/CanvasSubtitleRenderer'
import CanvasDanmakuEngine from './CanvasDanmakuEngine'

export default class CanvasDanmakuVideo extends CanvasVideo {
  danmakuEngine: CanvasDanmakuEngine
  renderVideo: boolean
  subtitleRenderer?: CanvasSubtitleRenderer

  resizeObserver = new ResizeObserver(([entry]) => {
    const el = entry?.target as HTMLElement
    if (!el || !el.clientWidth || !el.clientHeight) return
    this.updateSize({
      width: el.clientWidth,
      height: el.clientHeight,
    })
  })
  constructor(
    props: ConstructorParameters<typeof CanvasVideo>[0] & {
      danmakuEngine: CanvasDanmakuEngine
      renderVideo?: boolean
      subtitleManager?: SubtitleManager
    },
  ) {
    super(props)
    this.danmakuEngine = props.danmakuEngine
    this.renderVideo = props.renderVideo ?? false
    if (props.subtitleManager) {
      this.subtitleRenderer = new CanvasSubtitleRenderer(props.subtitleManager)
    }
    // TODO 监听container大小变化，然后调用resize
    // this.danmakuManager.container
    this.resizeObserver.observe(this.danmakuEngine.container)
    const unListenerClose = this.on2(PlayerEvent.close, () => {
      this.resizeObserver.disconnect()
      unListenerClose()
    })
  }
  override drawCanvas(): void {
    if (!this.canvas.width || !this.canvas.height) return
    if (this.renderVideo) {
      this.ctx.drawImage(
        this.videoEl,
        this.x,
        this.y,
        this.videoWidth,
        this.videoHeight,
      )
    }
    if (this.hasSeek) {
      this.danmakuEngine.drawInSeek()
      this.hasSeek = false
    } else {
      this.danmakuEngine.draw()
    }
    this.subtitleRenderer?.draw(this.ctx, this.width, this.height)
  }
}
