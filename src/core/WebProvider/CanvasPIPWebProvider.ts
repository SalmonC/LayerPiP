import { ERROR_MSG } from '@root/shared/errorMsg'
import { addEventListener, createElement, throttle } from '@root/utils'
import { CanvasVideoPlayer } from '../VideoPlayer/CanvasVideoPlayer'
import { CanvasDanmakuEngine } from '../danmaku/DanmakuEngine'
import { PlayerEvent } from '../event'
import { WebProvider } from '.'

export default class CanvasPIPWebProvider extends WebProvider {
  declare miniPlayer: CanvasVideoPlayer
  protected override MiniPlayer = CanvasVideoPlayer

  private pipVideoEl = createElement('video')
  private canvasStream?: MediaStream

  private unlistenPipVideoEl = () => {}
  private unlistenPlaybackBridge = () => {}
  private mediaSessionTimer = 0
  private requestingPip = false
  private ignoreNextPipPlay = false
  override onOpenPlayer(): Promise<void> | void {
    this.pipVideoEl = createElement('video')
    this.pipVideoEl.muted = true
    this.pipVideoEl.playsInline = true

    if (!this.danmakuEngine) {
      throw Error(ERROR_MSG.unInitDanmakuEngine)
    }
    this.miniPlayer.init()
    this.danmakuEngine.init({
      media: this.webVideo,
      container: this.webVideo,
    })

    if (this.danmakuEngine instanceof CanvasDanmakuEngine) {
      const stream = this.danmakuEngine.canvasDanmakuVideo?.canvasVideoStream
      if (!stream) {
        throw Error(ERROR_MSG.unInitDanmakuEngine)
      }

      this.canvasStream = stream
      this.pipVideoEl.srcObject = stream
      this.bindPlaybackBridge()
      if (this.pipVideoEl.readyState > 0) {
        this.onVideoLoadedmetadata()
      }
      this.unlistenPipVideoEl = addEventListener(
        this.pipVideoEl,
        (pipVideoEl) => {
          pipVideoEl.addEventListener('loadedmetadata', () => {
            this.onVideoLoadedmetadata()
          })
          pipVideoEl.addEventListener('leavepictureinpicture', () => {
            this.onPIPClose()
          })
        },
      )
    }
  }

  onVideoLoadedmetadata() {
    if (this.requestingPip) return
    this.requestingPip = true
    if (this.pipVideoEl.paused) {
      this.playPipFromSource()
    }

    const onResize = throttle((pipWindow: PictureInPictureWindow) => {
      const canvasVideo = (this.danmakuEngine as CanvasDanmakuEngine)
        ?.canvasDanmakuVideo
      if (!canvasVideo) {
        console.warn('canvasVideo已经被移除了，但还是触发了pip resize')
        return
      }

      canvasVideo.updateSize({
        height: pipWindow.height,
        width: pipWindow.width,
      })
    }, 500)

    this.pipVideoEl
      .requestPictureInPicture()
      .then((pipWindow) => {
        onResize(pipWindow)
        if (this.webVideo.paused) this.pipVideoEl.pause()
        pipWindow.addEventListener('resize', () => {
          this.emit(PlayerEvent.resize)
          onResize(pipWindow)
        })
      })
      .catch((error) => {
        console.error('无法打开 Edge 原生小窗', error)
        this.miniPlayer.emit(PlayerEvent.close)
      })
      .finally(() => {
        this.requestingPip = false
      })
  }

  private bindPlaybackBridge() {
    const source = this.webVideo
    const pip = this.pipVideoEl
    const onSourcePlay = () => {
      if (!pip.paused) return
      this.playPipFromSource()
    }
    const onSourcePause = () => pip.pause()
    const onPipPlay = () => {
      if (this.ignoreNextPipPlay) {
        this.ignoreNextPipPlay = false
        return
      }
      if (source.paused) void source.play()
    }
    const onPipPause = () => {
      if (!source.paused) source.pause()
    }
    source.addEventListener('play', onSourcePlay)
    source.addEventListener('pause', onSourcePause)
    pip.addEventListener('play', onPipPlay)
    pip.addEventListener('pause', onPipPause)
    this.unlistenPlaybackBridge = () => {
      source.removeEventListener('play', onSourcePlay)
      source.removeEventListener('pause', onSourcePause)
      pip.removeEventListener('play', onPipPlay)
      pip.removeEventListener('pause', onPipPause)
    }

    const mediaSession = navigator.mediaSession
    if (!mediaSession) return
    const syncPosition = () => {
      if (
        Number.isFinite(source.duration) &&
        source.duration > 0 &&
        source.currentTime <= source.duration
      ) {
        mediaSession.setPositionState({
          duration: source.duration,
          playbackRate: source.playbackRate || 1,
          position: source.currentTime,
        })
      }
    }
    syncPosition()
    this.mediaSessionTimer = window.setInterval(syncPosition, 1000)
    const previousUnlisten = this.unlistenPlaybackBridge
    this.unlistenPlaybackBridge = () => {
      previousUnlisten()
      window.clearInterval(this.mediaSessionTimer)
      this.mediaSessionTimer = 0
    }
  }

  private playPipFromSource() {
    this.ignoreNextPipPlay = true
    void this.pipVideoEl.play().catch((error) => {
      this.ignoreNextPipPlay = false
      console.warn('合成视频暂时无法播放', error)
    })
  }
  onPIPClose() {
    this.miniPlayer.emit(PlayerEvent.close)
  }

  override onUnload() {
    console.log('CanvasPIPWebProvider on unload')
    this.unlistenPlaybackBridge()
    this.unlistenPlaybackBridge = () => {}
    this.canvasStream?.getTracks().forEach((track) => track.stop())
    this.canvasStream = undefined
    this.pipVideoEl.srcObject = null
    this.unlistenPipVideoEl()
    this.unlistenPipVideoEl = () => {}
    this.requestingPip = false
    this.ignoreNextPipPlay = false
  }

  override close() {
    document.exitPictureInPicture()
  }
}
