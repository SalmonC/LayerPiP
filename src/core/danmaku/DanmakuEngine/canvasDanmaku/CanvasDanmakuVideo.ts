import CanvasVideo from '@root/core/CanvasVideo'
import configStore from '@root/store/config'
import { autorun } from 'mobx'
import { createElement } from 'react'
import toast from 'react-hot-toast'
import { addonRecovery } from '@root/core/AddonRecovery'
import type SubtitleManager from '@root/core/SubtitleManager'
import CanvasSubtitleRenderer from '@root/core/SubtitleManager/CanvasSubtitleRenderer'
import CanvasDanmakuEngine from './CanvasDanmakuEngine'

export default class CanvasDanmakuVideo extends CanvasVideo {
  danmakuEngine?: CanvasDanmakuEngine
  renderVideo: boolean
  subtitleRenderer?: CanvasSubtitleRenderer
  private repaintDisposers: (() => void)[] = []
  private failedLayers = new Set<string>()
  private released = false

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
      danmakuEngine?: CanvasDanmakuEngine
      container?: HTMLElement
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
    this.resizeObserver.observe(
      props.container ?? this.danmakuEngine?.container ?? props.videoEl,
    )
    if (props.subtitleManager) {
      const manager = props.subtitleManager
      for (const event of ['row-enter', 'row-leave', 'reset'] as const) {
        this.repaintDisposers.push(manager.on2(event, () => this.redraw()))
      }
      this.repaintDisposers.push(
        autorun(() => {
          void manager.showSubtitle
          void manager.snapshot
          // Presentation settings must invalidate a paused composition as well.
          for (const key of Object.keys(configStore)) {
            if (key.startsWith('subtitle_'))
              void configStore[key as keyof typeof configStore]
          }
          this.redraw()
        }),
      )
    }
    let initializedPresentation = false
    this.repaintDisposers.push(
      autorun(() => {
        void configStore.fontSize
        void configStore.opacity
        void configStore.danSpeed
        void configStore.maxTunnel
        void configStore.fontFamily
        void configStore.fontWeight
        void configStore.fontShadow
        void configStore.gap
        void configStore.adjustFontsizeByPIPWidthResize
        void configStore.adjustFontsizeStartWidth
        void configStore.adjustFontsizeScaleRate
        void configStore.adjustFontsizeMaxSize
        if (!initializedPresentation) {
          initializedPresentation = true
          return
        }
        this.danmakuEngine?.forceRerenderDanmaku()
        this.redraw()
      }),
    )
  }
  override dispose() {
    this.released = true
    this.resizeObserver.disconnect()
    this.repaintDisposers.splice(0).forEach((dispose) => dispose())
    super.dispose()
  }
  retryLayer(name: '字幕' | '弹幕') {
    if (this.released) return
    this.failedLayers.delete(name)
    this.hasSeek = true
    this.redraw()
  }
  private drawOptionalLayer(name: string, draw: () => void) {
    if (this.failedLayers.has(name)) return
    this.ctx.save()
    try {
      draw()
    } catch (error) {
      this.failedLayers.add(name)
      addonRecovery.report(
        this.videoEl,
        name === '字幕' ? 'subtitle' : 'danmaku',
        error,
      )
      console.warn(`${name}绘制已停用`, error)
      toast(
        (notification) =>
          createElement(
            'button',
            {
              type: 'button',
              style: {
                color: 'inherit',
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
              },
              onClick: () => {
                toast.dismiss(notification.id)
                if (this.released) return
                this.failedLayers.delete(name)
                this.hasSeek = true
                this.redraw()
              },
            },
            `${name}显示失败，视频继续播放 · 点击重试`,
          ),
        { duration: 8000 },
      )
    } finally {
      this.ctx.restore()
    }
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
    this.drawOptionalLayer('弹幕', () => {
      if (!this.danmakuEngine?.initd) return
      if (this.hasSeek) {
        this.danmakuEngine.drawInSeek()
        this.hasSeek = false
      } else {
        this.danmakuEngine.draw()
      }
    })
    this.drawOptionalLayer('字幕', () => {
      this.subtitleRenderer?.draw(this.ctx, this.width, this.height)
    })
  }
}
