import { createElement } from '@root/utils'
import { ERROR_MSG } from '@root/shared/errorMsg'
import { CanvasDanmakuEngine } from '../danmaku/DanmakuEngine'
import VideoPlayerBase from './VideoPlayerBase'

export class CanvasVideoPlayer extends VideoPlayerBase {
  videoEl?: HTMLVideoElement
  override onInit(): void {
    this.videoEl = createElement('video')

    this.initVideoPlayer()
  }

  override onUnload(): void {
    this.videoEl = undefined
  }

  protected initVideoPlayer() {
    if (!this.videoEl) {
      throw Error(ERROR_MSG.unInitVideoEl)
    }

    if (!this.danmakuEngine) {
      throw Error(ERROR_MSG.unInitDanmakuEngine)
    }

    if (this.danmakuEngine instanceof CanvasDanmakuEngine) {
      this.danmakuEngine.enableCompositeVideo(this.subtitleManager)
    }
  }
}
