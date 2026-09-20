import onRouteChange from '@root/inject/csUtils/onRouteChange'
import { MultiVideoSession } from '@root/core/MultiVideo/session'
import { PIP_WINDOW_CONFIG } from '@root/shared/storeKey'
import WebextEvent from '@root/shared/webextEvent'
import configStore, { videoBorderType } from '@root/store/config'
import { calculateNewDimensions, createElement } from '@root/utils'
import { getDocPIPBorderSize, isUsableDocPIPSize } from '@root/utils/docPIP'
import {
  getBrowserSyncStorage,
  setBrowserSyncStorage,
} from '@root/utils/storage'
import { sendMessage } from 'webext-bridge/content-script'
import { MovePIPAfterOpenType, Position } from '@root/types/config'
import { autorun } from 'mobx'
import { HtmlVideoPlayer } from '../VideoPlayer/HtmlVideoPlayer'
import { PlayerEvent } from '../event'
import { WebProvider } from '.'

export default class DocPIPWebProvider extends WebProvider {
  declare miniPlayer: HtmlVideoPlayer
  protected override MiniPlayer = HtmlVideoPlayer

  pipWindow?: Window
  private multiVideo?: MultiVideoSession
  protected override get commandVideo() {
    return this.multiVideo?.commandVideo ?? this.webVideo
  }

  override async onOpenPlayer() {
    if (!window.documentPictureInPicture?.requestWindow)
      throw new Error('当前浏览器不支持增强小窗，请在设置中选择原生小窗')
    // Title restoration also covers partial-open failures.
    const title = document.title
    const pipTitle = title + ' - PIP'
    document.title = pipTitle
    this.addOnUnloadFn(() => {
      if (document.title === pipTitle) document.title = title
    })

    // 获取应该有的docPIP宽高
    const pipWindowConfig = await getBrowserSyncStorage(PIP_WINDOW_CONFIG)
    // 只有"可用"的几何才会被采用：快速隐藏留下的 240×52 或创建过程中的中间态一旦被写入，
    // 会让之后每次打开都极小。忽略它既能挡住坏值，也能让已经写坏的历史值自愈。
    const usableSavedSize =
      pipWindowConfig &&
      isUsableDocPIPSize(pipWindowConfig.width, pipWindowConfig.height)
        ? pipWindowConfig
        : undefined
    if (pipWindowConfig && !usableSavedSize) {
      console.warn(
        '[docPIP_WH] 忽略不可用的已保存窗口尺寸，回退到视频尺寸',
        pipWindowConfig,
      )
    }
    let width = usableSavedSize?.width ?? this.webVideo.clientWidth,
      height = usableSavedSize?.height ?? this.webVideo.clientHeight

    console.log('[docPIP_WH] pipWindowConfig', pipWindowConfig)
    // cw / ch = vw / vh
    const vw = this.webVideo.videoWidth,
      vh = this.webVideo.videoHeight

    switch (configStore.videoNoBorder) {
      // cw = vw / vh * ch
      case videoBorderType.height: {
        width = (vw / vh) * height
        break
      }
      // ch = vh / vw * cw
      case videoBorderType.width: {
        height = (vh / vw) * width
        break
      }
    }

    width = Number.isFinite(width) && width > 0 ? width : 640
    height = Number.isFinite(height) && height > 0 ? height : 360
    await sendMessage(WebextEvent.beforeStartPIP, null)
    await this.miniPlayer.init()
    if (!this.active) throw new Error('小窗打开已取消')
    const playerEl = this.miniPlayer.playerRootEl
    if (!playerEl) {
      console.error('不正常的miniPlayer.init()，没有 playerEl', this.miniPlayer)
      throw Error('不正常的miniPlayer.init()')
    }

    console.log('[docPIP_WH] real width height', { width, height })
    const pipWindow = await window.documentPictureInPicture.requestWindow({
      width,
      height,
    })
    if (!this.active) {
      pipWindow.close()
      throw new Error('小窗打开已取消')
    }
    this.pipWindow = pipWindow
    this.addOnUnloadFn(() => {
      if (!pipWindow.closed) pipWindow.close()
      this.pipWindow = undefined
    })

    // 这里await会莫名其妙使webVideo被暂停
    const handleOptionalPositionError = (error: unknown) => {
      console.warn('[docPIP] optional window positioning failed', error)
    }
    sendMessage(WebextEvent.afterStartPIP, {
      width: pipWindow.innerWidth,
    })
      .then(() => {
        switch (configStore.movePIPInOpen) {
          case MovePIPAfterOpenType.lastPos: {
            const [borX, borY] = getDocPIPBorderSize(pipWindow)
            console.log('borX, borY', borX, borY)

            let [realWidth, realHeight] = [width + borX, height + borY]

            // 低DPR屏幕到高DPR屏幕需要缩小wh，高到低就不需要😓
            // 只有采用了已保存尺寸时，保存当时的 DPR 才与这次要设置的尺寸相关；
            // 忽略坏几何、回退到视频尺寸时不能套用旧的 DPR 修正，否则会再缩一次。
            if (
              usableSavedSize?.pipDPR &&
              usableSavedSize.pipDPR > window.devicePixelRatio
            ) {
              realWidth = ~~(realWidth / usableSavedSize.pipDPR)
              realHeight = ~~(realHeight / usableSavedSize.pipDPR)
            }

            // ! 已经确定是chrome的bug，网页里第二次打开不会按照width和height来设置窗口大小，需要自己调整
            void sendMessage(WebextEvent.updateDocPIPRect, {
              width: realWidth,
              height: realHeight,
              docPIPWidth: pipWindow.innerWidth,
              left: pipWindowConfig?.left,
              top: pipWindowConfig?.top,
            }).catch(handleOptionalPositionError)
            break
          }
          case MovePIPAfterOpenType.custom: {
            const [borX, borY] = getDocPIPBorderSize(pipWindow)
            // ! 已经确定是chrome的bug，第二次打开不会按照width和height来设置窗口大小
            void sendMessage(WebextEvent.resizeDocPIP, {
              width: width + borX,
              height: height + borY,
              docPIPWidth: pipWindow.innerWidth,
            }).catch(handleOptionalPositionError)

            this.addOnUnloadFn(
              autorun(() => {
                const [x, y] = (() => {
                  switch (configStore.movePIPInOpen_basePos) {
                    case Position['topLeft']:
                      return [0, 0]
                    case Position['topRight']:
                      return [screen.width - width, 0]
                    case Position['bottomLeft']:
                      return [0, screen.height - height]
                    case Position['bottomRight']:
                      return [screen.width - width, screen.height - height]
                  }
                })()

                void sendMessage(WebextEvent.moveDocPIPPos, {
                  docPIPWidth: width,
                  x: x + configStore.movePIPInOpen_offsetX,
                  y: y + configStore.movePIPInOpen_offsetY,
                }).catch(handleOptionalPositionError)
              }),
            )
            break
          }
        }
      })
      .catch(handleOptionalPositionError)

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      const isUp = e.deltaY < 0

      const {
        outerHeight: height,
        outerWidth: width,
        screenLeft: left,
        screenTop: top,
      } = pipWindow
      const scale = isUp ? 1.03 : 0.97

      const { width: sw, height: sh } = screen

      const x = sw / 2 - left > left + width - sw / 2 ? 'left' : 'right'
      const y = sh / 2 - top > top + height - sh / 2 ? 'top' : 'bottom'

      const [newWidth, newHeight] = calculateNewDimensions(width, height, scale)

      const docPIPWidth = pipWindow.innerWidth

      switch (`${x}${y}`) {
        case 'lefttop':
          sendMessage(WebextEvent.resizeDocPIP, {
            docPIPWidth,
            height: newHeight,
            width: newWidth,
          })
          break
        case 'righttop': {
          const newLeft = left - (newWidth - width)
          sendMessage(WebextEvent.updateDocPIPRect, {
            docPIPWidth,
            height: newHeight,
            width: newWidth,
            left: newLeft,
          })
          break
        }
        case 'leftbottom': {
          const newTop = top - (newHeight - height)
          sendMessage(WebextEvent.updateDocPIPRect, {
            docPIPWidth,
            height: newHeight,
            width: newWidth,
            top: newTop,
          })
          break
        }
        case 'rightbottom': {
          const newLeft = left - (newWidth - width)
          const newTop = top - (newHeight - height)
          sendMessage(WebextEvent.updateDocPIPRect, {
            docPIPWidth,
            height: newHeight,
            width: newWidth,
            left: newLeft,
            top: newTop,
          })
        }
      }
    }
    pipWindow.addEventListener('wheel', handleWheel, {
      passive: false,
      capture: true,
    })

    // 挂载事件
    pipWindow.addEventListener('pagehide', () => {
      // 保存画中画的大小
      if (!this.isQuickHiding) {
        const [width, height] = [
          pipWindow.innerWidth + configStore.saveWidthOnDocPIPCloseOffset,
          pipWindow.innerHeight + configStore.saveHeightOnDocPIPCloseOffset,
        ]
        // ! isQuickHiding 只是第一道闸门：源页面卸载/导航时 WebProvider.onUnload() 会先把它置回 false，
        // ! 之后本窗口才关闭并触发 pagehide，于是快速隐藏的 240×52 会被当成"上次窗口大小"存下来，
        // ! 导致以后每次打开都极小。所以这里必须再按实际尺寸判断一次，低于阈值的几何一律不保存。
        if (isUsableDocPIPSize(width, height)) {
          console.log('[docPIP_WH] save width and height', { width, height })
          setBrowserSyncStorage(PIP_WINDOW_CONFIG, {
            height,
            width,
            left: pipWindow.screenLeft,
            top: pipWindow.screenTop,
            mainDPR: window.devicePixelRatio,
            pipDPR: pipWindow.devicePixelRatio,
          })
        } else {
          console.warn('[docPIP_WH] 跳过保存不可用的窗口尺寸', {
            width,
            height,
          })
        }
      }
      this.emit(PlayerEvent.close)
      pipWindow.removeEventListener('wheel', handleWheel, { capture: true })
      sendMessage(WebextEvent.closePIP, null)

      // 恢复原始标题
      document.title = title
    })
    pipWindow.addEventListener('resize', () => {
      this.emit(PlayerEvent.resize)
    })

    this.on(PlayerEvent.close, () => {
      try {
        pipWindow.close()
      } catch (error) {}
    })

    pipWindow.document.body.appendChild(playerEl)
    // React may have resolved the keyboard owner while the player still
    // belonged to the source page. Rebind after DOM adoption without touching
    // the video node; calling updateVideo(sameVideo) can remove it and black out.
    this.miniPlayer.refreshInputWindow()

    if (
      location.hostname === 'www.bilibili.com' &&
      /^\/video\//.test(location.pathname)
    ) {
      const openMulti = () => {
        this.multiVideo ??= new MultiVideoSession(
          pipWindow,
          playerEl,
          this.webVideo,
          () => {
            this.emit(PlayerEvent.resize)
            this.miniPlayer.refreshInputWindow()
          },
        )
        this.multiVideo.open()
      }
      pipWindow.document.addEventListener('layerpip-open-multi', openMulti)
      this.addOnUnloadFn(
        onRouteChange(() => {
          this.multiVideo?.close()
          this.multiVideo = undefined
        }),
      )
      this.addOnUnloadFn(() => {
        this.multiVideo?.close()
        this.multiVideo = undefined
        pipWindow.document.removeEventListener('layerpip-open-multi', openMulti)
      })
    }

    // docPIP有自带的样式，需要覆盖掉
    const docPIPRootStyle = createElement('style', {
      innerHTML: `body{
  margin: 0;
  background-color: #000;
}
video{
  width: 100%;
  height: 100%;
}
canvas{
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10;
  width: 100%;
  pointer-events: none;
}`,
    })
    playerEl.appendChild(docPIPRootStyle)

    const keepAlive = setInterval(() => {
      sendMessage(WebextEvent.keepAlive, null)
    }, 1000)
    this.addOnUnloadFn(() => {
      clearInterval(keepAlive)
    })
  }

  override close(): void {
    this.pipWindow?.close?.()
  }
}
