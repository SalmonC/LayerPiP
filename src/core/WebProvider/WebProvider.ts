import { onMessage, sendMessage } from 'webext-bridge/content-script'
import configStore from '@root/store/config'
import { createElement, dq, tryCatch, wait } from '@root/utils'
import EventSwitcher from '@root/utils/EventSwitcher'
import playerConfig from '@root/store/playerConfig'
import { checkIsLive } from '@root/utils/video'
import { DOC_PIP_QUICK_HIDE_SIZE } from '@root/utils/docPIP'
import { SettingDanmakuEngine } from '@root/store/config/danmaku'
import WebextEvent from '@root/shared/webextEvent'
import { DocPIPRenderType, PipMode, Position } from '@root/types/config'
import {
  CanvasDanmakuEngine,
  DanmakuEngine,
  HtmlDanmakuEngine,
} from '../danmaku/DanmakuEngine'
import SubtitleManager from '../SubtitleManager'
import { addonRecovery } from '../AddonRecovery'
import VideoPlayerBase, {
  ExtendComponent,
} from '../VideoPlayer/VideoPlayerBase'
import DanmakuSender from '../danmaku/DanmakuSender'
import { EventBus, PlayerEvent } from '../event'
import { SideSwitcher } from '../SideSwitcher'
import IronKinokoEngine from '../danmaku/DanmakuEngine/IronKinoko/IronKinokoEngine'
import VideoPreviewManager from '../VideoPreviewManager'
import type { SiteAdapter } from './SiteAdapter'
import { autorun } from 'mobx'
import Browser from 'webextension-polyfill'
import { aiSubtitles } from '../AiSubtitle/controller'

// ? 不知道为什么不能集中一起放这里，而且放这里是3个empty😅
// const FEAT_PROVIDER_LIST = [
//   DocPIPWebProvider,
//   CanvasPIPWebProvider,
//   ReplacerWebProvider,
// ]

export default abstract class WebProvider
  extends EventBus
  implements ExtendComponent
{
  protected get commandVideo(): HTMLVideoElement {
    return this.webVideo
  }

  // videoChanger: VideoChanger
  subtitleManager!: SubtitleManager
  danmakuEngine?: DanmakuEngine
  danmakuSender?: DanmakuSender
  sideSwitcher?: SideSwitcher
  videoPreviewManager?: VideoPreviewManager
  isLive?: boolean
  active = false
  isQuickHiding = false
  doNotUsePauseInCloseConfig = false

  private _webVideo?: HTMLVideoElement
  get webVideo() {
    if (!this._webVideo)
      throw new Error('webVideo还没初始化，请用openPlayer()后再调用')
    return this._webVideo
  }
  set webVideo(v: HTMLVideoElement) {
    this._webVideo = v
  }

  miniPlayer!: VideoPlayerBase
  protected MiniPlayer!: typeof VideoPlayerBase

  siteAdapter?: SiteAdapter
  private closing = false
  private opening = false
  private releaseRecovery = () => {}
  private releaseAi = () => {}
  private observeAi = () => {}

  private bindAi() {
    try {
      this.releaseAi()
      this.releaseAi = aiSubtitles.bind(this.webVideo, this.subtitleManager, Browser.runtime.getURL('ai-frame.html'), document)
    } catch (error) {
      aiSubtitles.stop('AI 字幕接入失败，请重新打开小窗后重试')
      console.warn('AI 字幕未接入，视频继续播放', error)
    }
  }

  refreshRecovery() {
    this.releaseRecovery()
    const source = this.webVideo
    let current = true
    const release = addonRecovery.bind(source, {
      subtitle: async () => {
        await this.subtitleManager.init(source)
        if (!current) return
        if (this.danmakuEngine instanceof CanvasDanmakuEngine)
          this.danmakuEngine.canvasDanmakuVideo?.retryLayer('字幕')
      },
      danmaku: async () => {
        await this.prepareDanmakuRetry()
        if (!current) return
        await this.siteAdapter?.retryDanmaku?.()
        if (!current) return
        this.danmakuEngine?.forceRerenderDanmaku()
        if (this.danmakuEngine instanceof CanvasDanmakuEngine)
          this.danmakuEngine.canvasDanmakuVideo?.retryLayer('弹幕')
      },
    })
    this.releaseRecovery = () => {
      current = false
      release()
    }
  }

  protected prepareDanmakuRetry(): void | Promise<void> {
    const engine = this.danmakuEngine
    if (engine && !engine.initd && engine.container)
      engine.init({ media: this.webVideo, container: engine.container })
  }

  init() {
    this.danmakuEngine = (() => {
      if (
        configStore.useHtmlDanmaku &&
        configStore.pipMode === PipMode.document
      ) {
        if (configStore.htmlDanmakuEngine === SettingDanmakuEngine.IronKinoko)
          return new IronKinokoEngine()
        return new HtmlDanmakuEngine()
      }
      return new CanvasDanmakuEngine()
    })()

    this.onInit()
    this.siteAdapter?.onInit()
    this.subtitleManager ??= new SubtitleManager()
    this.active = true
  }
  onInit(): void {}

  /**播放器初始化完毕后触发 */
  onPlayerInitd(): void {}

  protected onUnloadFn: (() => void)[] = []
  addOnUnloadFn(fn: () => void) {
    this.onUnloadFn.push(fn)
  }
  unload() {
    console.log('WebProvider unload')
    const release = (fn: () => void) => {
      try {
        fn()
      } catch (error) {
        console.error('小窗资源释放失败', error)
      }
    }
    release(() => this.releaseRecovery())
    release(() => this.observeAi())
    release(() => this.releaseAi())
    release(() => this.siteAdapter?.onUnload())
    release(() => this.onUnload())
    this.onUnloadFn.forEach(release)
    this.onUnloadFn.length = 0
    this.active = false
  }
  onUnload() {
    this.isQuickHiding = false
  }

  /**打开播放器 */
  async openPlayer(props?: { videoEl?: HTMLVideoElement }) {
    if (this.opening || this.active) return
    if (!navigator.userActivation.isActive)
      throw new Error('请先点击网页后打开小窗')
    this.opening = true
    this.closing = false
    const cleanup = () => {
      if (this.closing) return
      this.closing = true
      try {
        this.unload()
        for (const release of [
          () => this.subtitleManager?.unload(),
          () => this.videoPreviewManager?.unload(),
        ]) {
          try {
            release()
          } catch (error) {
            console.warn('附加资源释放失败', error)
          }
        }
        if (
          configStore.pauseInClose_video &&
          !this.doNotUsePauseInCloseConfig &&
          !this.isLive
        )
          this._webVideo?.pause()
      } finally {
        this.offAll()
        playerConfig.clear()
        this.active = false
      }
    }
    // Register before the first await: partial opens follow the same cleanup path.
    this.on(PlayerEvent.close, cleanup)
    try {
      this.webVideo = props?.videoEl ?? this.getVideoEl()
      this.init()
      this.injectVideoEventsListener(this.webVideo)
      this.bindCommandsEvent()
      this.isLive ??= checkIsLive(this.webVideo)
      this.miniPlayer = new this.MiniPlayer({
        webVideoEl: this.webVideo,
        danmakuEngine: this.danmakuEngine,
        subtitleManager: this.subtitleManager,
        danmakuSender: this.danmakuSender,
        sideSwitcher: this.sideSwitcher,
        videoPreviewManager: this.videoPreviewManager,
        isLive: !!this.isLive,
      })
      this.on(PlayerEvent.webVideoChanged, (newVideo) => {
        this.webVideo = newVideo
        this.refreshRecovery()
        this.subtitleManager.updateVideo(newVideo)
        this.bindAi()
      })
      this.refreshRecovery()
      await this.onOpenPlayer()
      if (this.closing) throw new Error('小窗已关闭')
      await this.onPlayerInitd()
      await this.siteAdapter?.onPlayerInitd()
      this.bindAi()
      this.observeAi = autorun(() => aiSubtitles.setEnabled(!!configStore.aiSubtitleEnabled))
      void sendMessage('PIP-active', { name: 'PIP-active' }).catch(console.warn)
    } catch (error) {
      this.doNotUsePauseInCloseConfig = true
      this.emit(PlayerEvent.close)
      cleanup()
      throw error
    } finally {
      this.opening = false
    }
  }

  eventSwitcher?: EventSwitcher<HTMLVideoElement>
  // 注入video事件监听器
  injectVideoEventsListener(videoEl: HTMLVideoElement) {
    const eventSwitcher = new EventSwitcher(videoEl)
    this.eventSwitcher = eventSwitcher

    this.onUnloadFn.push(
      ...[
        this.on2(PlayerEvent.longTabPlaybackRate, () => {
          eventSwitcher.disable('seeking')
          eventSwitcher.disable('seeked')
        }),
        this.on2(PlayerEvent.longTabPlaybackRateEnd, () => {
          setTimeout(() => {
            eventSwitcher.enable('seeking')
            eventSwitcher.enable('seeked')
          }, 0)
        }),
        eventSwitcher.unload,
      ],
    )
  }

  /**获取视频 */
  getVideoEl(document = window.document): HTMLVideoElement {
    const videos = [
      ...dq('video', document),
      ...dq('iframe', document)
        .map((iframe) => {
          try {
            return Array.from(
              iframe.contentWindow?.document.querySelectorAll('video') ?? [],
            )
          } catch (error) {
            return null
          }
        })
        .filter((v) => !!v)
        .flat(),
    ]

    if (!videos.length)
      throw Error('页面中不存在video，或者video在不支持的非同源iframe中')
    const targetVideo = videos.reduce((tar, now) => {
      if (tar.clientHeight < now.clientHeight) return now
      return tar
    }, videos[0])

    return targetVideo
  }

  onOpenPlayer(): Promise<void> | void {}

  bindCommandsEvent() {
    let lastX = 0,
      lastY = 0,
      lastW = 0,
      lastH = 0,
      lastIsPause = false,
      coverDom = createElement('div', {
        style: {
          position: 'fixed',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          zIndex: 9999999999,
          backgroundColor: 'black',
        },
      })

    this.addOnUnloadFn(
      onMessage('PIP-action', async (req) => {
        console.log('PIP-action', req)
        if (!this.miniPlayer || !this.webVideo) return
        const videoEl = this.commandVideo
        switch ((req?.data as any)?.body) {
          case 'back': {
            videoEl.currentTime -= 5
            break
          }
          case 'forward': {
            videoEl.currentTime += 5
            break
          }
          case 'pause/play': {
            videoEl.paused ? videoEl.play() : videoEl.pause()
            break
          }
          case 'hide': {
            document.body.click()
            if (document.pictureInPictureElement)
              document.exitPictureInPicture()
            if (window.documentPictureInPicture?.window) {
              window.documentPictureInPicture.window.close()
            }
            // TODO 显示的提示
            // document.pictureInPictureElement
            //   ? document.exitPictureInPicture()
            //   : this.startPIPPlay({
            //       onNeedUserClick: () => {
            //         sendToBackground({ name: 'PIP-need-click-notifications' })
            //       },
            //     })
            break
          }
          case 'playbackRate': {
            videoEl.playbackRate == 1
              ? (videoEl.playbackRate = configStore.playbackRate)
              : (videoEl.playbackRate = 1)
            break
          }
          case 'quickHideToggle': {
            if (!window.documentPictureInPicture?.window) return
            // !不能完全隐藏，只能通过其他方式隐藏 Error: Invalid value for bounds. Bounds must be at least 50% within visible screen space.
            const docWin = window.documentPictureInPicture.window
            if (this.isQuickHiding) {
              docWin.document.body.removeChild(coverDom)
              // ! Document PiP 窗口内的 resizeTo 需要瞬时激活，否则抛
              // ! NotAllowedError: resizeTo() requires user activation in document picture-in-picture。
              // ! 一旦抛出，下面的恢复逻辑会被整段跳过，窗口会卡在快速隐藏尺寸且 isQuickHiding 停在 true。
              // ! 因此改走 background 的 chrome.windows.update，与"隐藏"路径保持对称。
              try {
                await sendMessage(WebextEvent.updateDocPIPRect, {
                  width: lastW,
                  height: lastH,
                  left: lastX,
                  top: lastY,
                  docPIPWidth: docWin.innerWidth,
                })
              } catch (error) {
                console.warn('[docPIP] 恢复小窗尺寸失败', error)
              }
              if (!lastIsPause) {
                videoEl.play()
              }

              await wait(10)
              this.isQuickHiding = false
            } else {
              lastX = docWin.screenLeft
              lastY = docWin.screenTop
              lastW = docWin.outerWidth
              lastH = docWin.outerHeight
              lastIsPause = videoEl.paused

              this.webVideo.pause()
              docWin.document.body.appendChild(coverDom)
              const screen = docWin.screen

              const minWidth = DOC_PIP_QUICK_HIDE_SIZE.width,
                minHeight = DOC_PIP_QUICK_HIDE_SIZE.height
              const [left, top] = (() => {
                switch (configStore.quickHide_pos) {
                  case Position.topLeft:
                    return [0, 0]
                  case Position.topRight:
                    return [screen.width - minWidth, 0]
                  case Position.bottomLeft:
                    return [0, screen.height - minHeight]
                  case Position.bottomRight:
                    return [screen.width - minWidth, screen.height - minHeight]
                }
              })()

              await sendMessage(WebextEvent.updateDocPIPRect, {
                left,
                top,
                width: minWidth,
                height: minHeight,
                docPIPWidth: docWin.innerWidth,
              })
              this.isQuickHiding = true
            }
            break
          }
        }
      }),
    )
  }

  close() {}
}
