import { addEventListener, createElement, getTextWidth } from '@root/utils'
import { DanmakuBase } from '../'
import type { DanmakuInitProps } from '../DanmakuBase'

const STANDARD_FS = 14
export default class HtmlDanmaku extends DanmakuBase {
  // 弹幕el: text_<s></s>
  // 通过用IntersectionObserver监听<s>是否enter或leave，占领/释放弹幕tunnel
  // TODO 还需要解决缩放后一个tunnel还有2个以上变化到leave，第一个enter并leave，那第二个会跟新danmakus冲突的情况
  el?: HTMLElement
  /**给tunnelManager监听 */
  outTunnelObserveEl?: HTMLSpanElement
  // imageLength = 0
  allImageWidth = 0
  onlyImage = false
  private sourceText?: string

  override onInit(props: DanmakuInitProps): void {
    // Reflow can initialize the same comment repeatedly. Preserve image tokens
    // and restart measurements instead of progressively stripping the source.
    this.sourceText ??= this.text
    this.text = this.sourceText
    this.allImageWidth = 0
    this.onlyImage = false
    this.disabled = false
    this.tunnel = this.danmakuEngine.tunnelManager.getTunnel(this)
    if (this.tunnel == -1) {
      this.disabled = true
      return
    }

    this.initTime = props.initTime || this.time

    this.outTunnelObserveEl = createElement('span')

    let innerHTML = Object.entries(this.imageMap)
      .reduce((resolvedText, [imageKey, imageData]) => {
        return resolvedText.replaceAll(imageKey, (_, matchIndex, matchKey) => {
          // 去除匹配到的图片字符串
          this.text =
            this.text.slice(0, matchIndex) +
            this.text.slice(matchIndex + matchKey.length)

          const imageWidth =
            imageData.width * (this.danmakuEngine.fontSize / STANDARD_FS)
          this.allImageWidth += imageWidth

          return `<div style="height: var(--font-size); width: calc(var(--font-size) * ${imageData.width / imageData.height}); display: inline-block;" ><img src="${imageData.url}" style="height: 100%; width: 100%;" /></div>`
        })
      }, this.text)
      .trim()

    // 只有图片的情况
    if (!this.text.trim()) {
      this.onlyImage = true
    }

    if (this.danmakuEngine.disableOnlyImageDanmaku ? !this.onlyImage : true) {
      this.el = createElement('div', {
        className: `danmaku-item ${this.type}`,
        // innerText: this.text,
        innerHTML,
        children: [this.outTunnelObserveEl],
      })

      this.updateState()
      this.container.appendChild(this.el)
      this.danmakuEngine.emit('danmaku-enter', this)
      this.bindEvent()
      this.danmakuEngine.runningDanmakus.add(this)
    } else {
      this.disabled = true
      this.danmakuEngine.tunnelManager.popTunnel(this)
    }

    this.initd = true
  }

  private unbindEvent = () => {}
  private bindEvent() {
    if (!this.el) return

    switch (this.type) {
      case 'right': {
        const unbind1 = addEventListener(this.el, (el) => {
          el.addEventListener('animationend', () => {
            this.danmakuEngine.emit('danmaku-leave', this)
            this.onLeave()
          })
        })

        this.unbindEvent = () => {
          unbind1()
        }
        break
      }
      case 'bottom':
      case 'top': {
        // 只需要监听el的动画结束就行了
        const unbind1 = addEventListener(this.el, (el) => {
          el.addEventListener('animationend', () => {
            this.outTunnel = true
            // console.log('outTunnel', this)
            this.danmakuEngine.emit('danmaku-leaveTunnel', this)
            this.danmakuEngine.tunnelManager.popTunnel(this)
            this.danmakuEngine.emit('danmaku-leave', this)
            this.onLeave()
          })
        })
        this.unbindEvent = () => {
          unbind1()
        }
      }
    }
  }

  override updateState() {
    const imageWidth =
      this.allImageWidth * (this.danmakuEngine.fontSize / STANDARD_FS)
    const w =
      getTextWidth(this.text, {
        fontSize: this.danmakuEngine.fontSize + 'px',
        fontFamily: this.danmakuEngine.fontFamily,
        fontWeight: this.danmakuEngine.fontWeight,
      }) + imageWidth

    this.width = w

    const cw = this.container.clientWidth
    const initTimeOffset = this.initTime - this.time

    let duration = this.danmakuEngine.unmovingDanmakuSaveTime - initTimeOffset,
      offset = cw - initTimeOffset * this.speed,
      translateX = 0
    if (this.type == 'right') {
      duration = (offset + w) / this.speed
      translateX = (offset + w) * -1
    }

    // 设置el的property
    const propertyData = {
      color: this.color,
      // 对应的css var
      offset: offset + 'px',
      width: this.width + 'px',
      translateX: translateX + 'px',
      tunnel: this.tunnel,
      duration: duration + 's',
      'font-size': this.danmakuEngine.fontSize + 'px',
      // offsetY:
      //   this.tunnel * this.danmakuManager.fontSize +
      //   this.tunnel * this.danmakuManager.gap,
    }
    Object.entries(propertyData).forEach(([key, val]) => {
      if (!this.el) return
      this.el.style.setProperty(`--${key}`, val + '')
    })
  }

  override onUnload(): void {
    this.el = undefined
    this.outTunnelObserveEl = undefined
  }
  onLeave() {
    this.reset()
    this.unload()
    this.danmakuEngine.runningDanmakus.delete(this)
  }
  override reset() {
    if (!this.el) return
    if (!this.initd) return
    this.initd = false
    this.outTunnel = false
    this.disabled = false
    this.unbindEvent()

    this.container.removeChild(this.el)
  }
}
