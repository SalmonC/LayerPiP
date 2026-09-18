import { createElement } from '@root/utils'
import toast from 'react-hot-toast'
import { addonRecovery } from '../AddonRecovery'
import CanvasDanmakuVideo from '../danmaku/DanmakuEngine/canvasDanmaku/CanvasDanmakuVideo'
import { CanvasVideoPlayer } from '../VideoPlayer/CanvasVideoPlayer'
import { CanvasDanmakuEngine } from '../danmaku/DanmakuEngine'
import { PlayerEvent } from '../event'
import NativeMediaSessionBridge, {
  NativeMediaAction,
} from './NativeMediaSessionBridge'
import { WebProvider } from '.'

export default class CanvasPIPWebProvider extends WebProvider {
  declare miniPlayer: CanvasVideoPlayer
  protected override MiniPlayer = CanvasVideoPlayer

  private pipVideoEl = createElement('video')
  private canvasStream?: MediaStream
  private composite?: CanvasDanmakuVideo

  private unlistenPipVideoEl = () => {}
  private unlistenPlaybackBridge = () => {}
  private mediaSessionTimer = 0
  private mediaSessionBridge = new NativeMediaSessionBridge()
  private openingAbort?: AbortController
  private ignoreNextPipPlay = false
  override async onOpenPlayer(): Promise<void> {
    const abort = new AbortController()
    this.openingAbort = abort
    this.pipVideoEl = createElement('video')
    this.pipVideoEl.playsInline = true
    const source = this.webVideo
    // The composite stream has no audio; mirror before binding queued volume events.
    this.pipVideoEl.muted = source.muted
    this.pipVideoEl.volume = source.volume
    this.on(PlayerEvent.webVideoChanged, (video) => {
      if (video === source) return
      this.doNotUsePauseInCloseConfig = true
      this.emit(PlayerEvent.close)
      toast('视频播放器已更换，请重新打开原生小窗')
    })

    await this.miniPlayer.init()
    if (abort.signal.aborted) throw Error('小窗打开已取消')
    const engine =
      this.danmakuEngine instanceof CanvasDanmakuEngine
        ? this.danmakuEngine
        : undefined
    this.composite = new CanvasDanmakuVideo({
      videoEl: source,
      container: source,
      danmakuEngine: engine,
      subtitleManager: this.subtitleManager,
      renderVideo: true,
    })
    engine?.useComposite(this.composite)
    try {
      this.prepareDanmakuRetry()
    } catch (error) {
      addonRecovery.report(source, 'danmaku', error)
      toast.error('弹幕初始化失败，视频继续播放；可在弹幕设置中重试')
    }
    const stream = this.composite.canvasVideoStream
    this.canvasStream = stream
    this.pipVideoEl.srcObject = stream
    await this.bindPlaybackBridge()
    const pip = this.pipVideoEl
    const onLeave = () => this.onPIPClose()
    pip.addEventListener('leavepictureinpicture', onLeave)
    this.unlistenPipVideoEl = () =>
      pip.removeEventListener('leavepictureinpicture', onLeave)
    await this.waitForMetadata(pip, abort.signal)
    this.ignoreNextPipPlay = true
    await this.withDeadline(pip.play(), abort.signal)
    const request = pip.requestPictureInPicture()
    // A browser request can resolve after cancellation; close only our video.
    void request.then(
      () => {
        if (abort.signal.aborted && document.pictureInPictureElement === pip) {
          void document.exitPictureInPicture().catch(() => {})
        }
      },
      () => {},
    )
    const pipWindow = await this.withDeadline(request, abort.signal)
    this.syncPipVolumeFromSource()
    const onResize = () => {
      this.emit(PlayerEvent.resize)
      this.composite?.updateSize({
        width: pipWindow.width,
        height: pipWindow.height,
      })
    }
    onResize()
    pipWindow.addEventListener('resize', onResize)
    const previousUnlisten = this.unlistenPipVideoEl
    this.unlistenPipVideoEl = () => {
      previousUnlisten()
      pipWindow.removeEventListener('resize', onResize)
    }
    if (this.webVideo.paused) pip.pause()
  }

  protected override prepareDanmakuRetry() {
    const engine = this.danmakuEngine
    if (!(engine instanceof CanvasDanmakuEngine) || engine.initd) return
    try {
      engine.init({ media: this.webVideo, container: this.webVideo })
    } catch (error) {
      try {
        engine.unload()
      } catch (cleanupError) {
        console.warn(cleanupError)
      }
      throw error
    }
  }

  private withDeadline<T>(
    operation: Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const onAbort = () => finish(() => reject(Error('小窗打开已取消')))
      const timer = window.setTimeout(
        () => finish(() => reject(Error('打开原生小窗超时，请重试'))),
        10000,
      )
      const finish = (settle: () => void) => {
        window.clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        settle()
      }
      signal.addEventListener('abort', onAbort, { once: true })
      operation.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      )
      if (signal.aborted) onAbort()
    })
  }

  private async waitForMetadata(video: HTMLVideoElement, signal: AbortSignal) {
    if (video.readyState >= 1) return
    let cleanup = () => {}
    const ready = new Promise<void>((resolve, reject) => {
      const onReady = () => resolve()
      const onError = () => reject(Error('合成视频无法加载'))
      video.addEventListener('loadedmetadata', onReady)
      video.addEventListener('error', onError)
      cleanup = () => {
        video.removeEventListener('loadedmetadata', onReady)
        video.removeEventListener('error', onError)
      }
    })
    try {
      await this.withDeadline(ready, signal)
    } finally {
      cleanup()
    }
  }

  private async bindPlaybackBridge() {
    const source = this.webVideo
    const pip = this.pipVideoEl
    const onSourcePlay = () => {
      if (source.paused || !pip.paused) return
      this.playPipFromSource()
    }
    const onSourcePause = () => {
      if (source.paused) pip.pause()
    }
    const onPipPlay = () => {
      if (this.ignoreNextPipPlay) {
        this.ignoreNextPipPlay = false
        return
      }
      if (!pip.paused && source.paused)
        void source.play().catch(() => pip.pause())
    }
    const onPipPause = () => {
      // Media events are queued: a mirrored pause may arrive after playback resumed.
      if (pip.paused && !source.paused) source.pause()
    }
    let syncingVolume = false
    const onSourceVolume = () => {
      if (syncingVolume) return
      syncingVolume = true
      pip.muted = source.muted
      pip.volume = source.volume
      syncingVolume = false
    }
    const onPipVolume = () => {
      if (syncingVolume) return
      syncingVolume = true
      source.muted = pip.muted
      source.volume = pip.volume
      syncingVolume = false
    }
    source.addEventListener('play', onSourcePlay)
    source.addEventListener('pause', onSourcePause)
    source.addEventListener('volumechange', onSourceVolume)
    pip.addEventListener('play', onPipPlay)
    pip.addEventListener('pause', onPipPause)
    pip.addEventListener('volumechange', onPipVolume)
    this.unlistenPlaybackBridge = () => {
      source.removeEventListener('play', onSourcePlay)
      source.removeEventListener('pause', onSourcePause)
      source.removeEventListener('volumechange', onSourceVolume)
      pip.removeEventListener('play', onPipPlay)
      pip.removeEventListener('pause', onPipPause)
      pip.removeEventListener('volumechange', onPipVolume)
    }

    const seek = (time: number) => {
      if (
        !Number.isFinite(time) ||
        !Number.isFinite(source.duration) ||
        source.duration <= 0
      )
        return
      source.currentTime = Math.max(0, Math.min(source.duration, time))
      this.syncMediaSession()
    }
    const onMediaAction = ({
      action,
      seekOffset,
      seekTime,
    }: NativeMediaAction) => {
      switch (action) {
        case 'play':
          void source.play().catch((error) => {
            toast.error('播放未成功，请回到视频页点击播放')
            console.warn(error)
          })
          break
        case 'pause':
          source.pause()
          break
        case 'seekbackward':
          seek(
            source.currentTime -
              (seekOffset && seekOffset > 0 ? seekOffset : 10),
          )
          break
        case 'seekforward':
          seek(
            source.currentTime +
              (seekOffset && seekOffset > 0 ? seekOffset : 10),
          )
          break
        case 'seekto':
          if (seekTime !== undefined) seek(seekTime)
          break
      }
    }
    await this.mediaSessionBridge.start(Boolean(this.isLive), onMediaAction)
    if (this.openingAbort?.signal.aborted) {
      this.mediaSessionBridge.stop()
      throw new Error('小窗打开已取消')
    }
    this.syncMediaSession()
    const syncMediaSession = () => this.syncMediaSession()
    source.addEventListener('play', syncMediaSession)
    source.addEventListener('pause', syncMediaSession)
    source.addEventListener('ended', syncMediaSession)
    source.addEventListener('ratechange', syncMediaSession)
    this.mediaSessionTimer = window.setInterval(syncMediaSession, 750)
    const previousUnlisten = this.unlistenPlaybackBridge
    this.unlistenPlaybackBridge = () => {
      previousUnlisten()
      source.removeEventListener('play', syncMediaSession)
      source.removeEventListener('pause', syncMediaSession)
      source.removeEventListener('ended', syncMediaSession)
      source.removeEventListener('ratechange', syncMediaSession)
      this.mediaSessionBridge.stop()
      window.clearInterval(this.mediaSessionTimer)
      this.mediaSessionTimer = 0
    }
  }

  private syncPipVolumeFromSource() {
    this.pipVideoEl.muted = this.webVideo.muted
    this.pipVideoEl.volume = this.webVideo.volume
  }

  private syncMediaSession() {
    const source = this.webVideo
    const duration = Number.isFinite(source.duration)
      ? source.duration
      : undefined
    const position = Number.isFinite(source.currentTime)
      ? Math.max(
          0,
          Math.min(duration ?? source.currentTime, source.currentTime),
        )
      : undefined
    this.mediaSessionBridge.sync({
      duration,
      playbackRate: source.playbackRate || 1,
      playing: !source.paused && !source.ended,
      position,
    })
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
    super.onUnload()
    this.openingAbort?.abort()
    this.openingAbort = undefined
    this.unlistenPlaybackBridge()
    this.unlistenPlaybackBridge = () => {}
    this.unlistenPipVideoEl()
    this.unlistenPipVideoEl = () => {}
    if (document.pictureInPictureElement === this.pipVideoEl) {
      void document.exitPictureInPicture().catch(() => {})
    }
    this.pipVideoEl.pause()
    this.canvasStream?.getTracks().forEach((track) => track.stop())
    this.canvasStream = undefined
    this.composite?.dispose()
    this.composite = undefined
    this.pipVideoEl.srcObject = null
    this.ignoreNextPipPlay = false
    this.mediaSessionBridge.stop()
  }

  override close() {
    this.miniPlayer.emit(PlayerEvent.close)
  }
}
