import { normalizePaneUrl } from './pane'

/** One existing main player plus one owned frame. Never recreates the main video. */
export class MultiVideoSession {
  private shell?: HTMLDivElement
  private frame?: HTMLIFrameElement
  private secondVideo?: HTMLVideoElement
  private cleanupVideo?: () => void
  private poll?: number
  private closed = false
  private status?: HTMLElement
  private oldMuted = false
  private audible: 0 | 1 | null = null
  private active: 0 | 1 = 0
  private parent?: Node
  private next?: ChildNode | null
  private soloButtons: HTMLButtonElement[] = []
  private titles: HTMLSpanElement[] = []
  private pendingUrl = ''
  private loadedAt = 0
  private generation = 0

  constructor(
    private win: Window,
    private mainRoot: HTMLElement,
    private mainVideo: HTMLVideoElement,
    private resize: () => void,
  ) {}

  get commandVideo() {
    return this.active === 1 ? this.secondVideo : this.mainVideo
  }

  open() {
    if (this.shell) {
      this.shell.querySelector('input')?.focus()
      return
    }
    this.closed = false
    const doc = this.win.document
    this.parent = this.mainRoot.parentNode ?? undefined
    this.next = this.mainRoot.nextSibling
    this.oldMuted = this.mainVideo.muted
    const shell = doc.createElement('div')
    shell.className = 'layerpip-multi'
    const style = doc.createElement('style')
    style.textContent = `
.layerpip-multi{height:100vh;display:flex;flex-direction:column;background:#111;color:#fff;font:12px sans-serif}
.layerpip-multi *{box-sizing:border-box}
.layerpip-multi form{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px;background:#18191c}
.layerpip-multi input{min-width:100px;flex:1;color:#fff;background:#333;border:1px solid #555;border-radius:4px;padding:7px}
.layerpip-multi button{font:inherit;color:#fff;background:#333;border:0;border-radius:4px;cursor:pointer;padding:7px 9px;transition:background .15s}
.layerpip-multi button:hover{background:#555}.layerpip-multi button[aria-pressed=true]{background:#00a1d6}
.layerpip-multi button:focus-visible,.layerpip-multi input:focus-visible{outline:2px solid #00a1d6;outline-offset:2px}
.layerpip-multi button:disabled{opacity:.45;cursor:default}
.layerpip-multi-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;flex:1;min-height:0}
.layerpip-multi-pane{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.layerpip-multi-bar{padding:4px 8px;display:flex;align-items:center;justify-content:space-between;background:#202124}
.layerpip-multi-content{flex:1;min-height:0;position:relative;contain:layout paint;overflow:hidden}
.layerpip-multi iframe{width:100%;height:100%;border:0}
.layerpip-multi-status{padding:4px 8px;min-height:24px;background:#18191c}
@media(max-width:600px){.layerpip-multi-grid{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
@media(prefers-reduced-motion:reduce){.layerpip-multi button{transition:none}}
`
    shell.append(style)
    const form = doc.createElement('form')
    const label = doc.createElement('label')
    label.textContent = '第二画面'
    const input = doc.createElement('input')
    input.id = `layerpip-video-${crypto.randomUUID()}`
    label.htmlFor = input.id
    input.placeholder = 'B 站视频链接或 BV 号'
    const add = this.button('加载', () => {})
    add.type = 'submit'
    const close = this.button('退出多画面', () => this.close())
    form.append(label, input, add, close)
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      try {
        this.load(normalizePaneUrl(input.value))
      } catch (error) {
        this.message((error as Error).message)
      }
    })
    const grid = doc.createElement('div')
    grid.className = 'layerpip-multi-grid'
    const contents = [0, 1].map((index) => {
      const pane = doc.createElement('section')
      pane.className = 'layerpip-multi-pane'
      const bar = doc.createElement('div')
      bar.className = 'layerpip-multi-bar'
      const title = doc.createElement('span')
      title.textContent = index === 0 ? '当前视频 · 控制中' : '第二画面'
      this.titles.push(title)
      const solo = this.button('开启声音', () => void this.solo(index as 0 | 1))
      solo.disabled = index === 1
      solo.setAttribute('aria-pressed', 'false')
      this.soloButtons.push(solo)
      bar.append(title, solo)
      const content = doc.createElement('div')
      content.className = 'layerpip-multi-content'
      pane.addEventListener('pointerdown', () => {
        this.setActive(index as 0 | 1)
      })
      pane.addEventListener('focusin', () => this.setActive(index as 0 | 1))
      pane.append(bar, content)
      grid.append(pane)
      return content
    })
    const status = doc.createElement('div')
    status.className = 'layerpip-multi-status'
    status.setAttribute('role', 'status')
    this.status = status
    shell.append(form, grid, status)
    this.shell = shell
    const wasPlaying = !this.mainVideo.paused
    this.mainVideo.muted = true
    this.mainRoot.before(shell)
    contents[0].append(this.mainRoot)
    if (wasPlaying)
      void this.mainVideo
        .play()
        .catch(() => this.message('请点击主画面恢复播放。'))
    this.mainVideo.addEventListener('volumechange', this.mainVolume)
    // The right slot is owned by this session, never selected from arbitrary frames.
    contents[1].dataset.secondaryPane = 'true'
    this.message('两路独立播放，最多一路有声。点击画面后使用该画面的快捷键。')
    this.resize()
    input.focus()
  }

  private setActive(index: 0 | 1) {
    this.active = index
    this.titles.forEach((title, i) => {
      title.textContent =
        (i === 0 ? '当前视频' : '第二画面') + (i === index ? ' · 控制中' : '')
    })
  }

  private button(label: string, action: () => void) {
    const button = this.win.document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', action)
    return button
  }
  private message(text: string) {
    if (this.status) this.status.textContent = text
  }
  private mainVolume = () => this.enforce(0)
  private enforce(index: 0 | 1) {
    const video = index === 0 ? this.mainVideo : this.secondVideo
    if (video && !video.muted) {
      this.audible = index
      const other = index === 0 ? this.secondVideo : this.mainVideo
      if (other) {
        other.removeAttribute('data-layerpip-audible')
        other.muted = true
      }
      if (index === 1) video.setAttribute('data-layerpip-audible', '')
    } else if (this.audible === index) this.audible = null
    this.soloButtons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(this.audible === i))
      button.textContent = this.audible === i ? '静音' : '开启声音'
    })
  }
  private async solo(index: 0 | 1) {
    const video = index === 0 ? this.mainVideo : this.secondVideo
    if (!video) return
    this.setActive(index)
    if (!video.muted) {
      video.muted = true
      this.enforce(index)
      return
    }
    const other = index === 0 ? this.secondVideo : this.mainVideo
    if (other) {
      other.removeAttribute('data-layerpip-audible')
      other.muted = true
    }
    if (index === 1) video.setAttribute('data-layerpip-audible', '')
    video.muted = false
    this.enforce(index)
    try {
      await video.play()
    } catch {
      this.message('浏览器未允许播放，请在对应画面内点击播放一次。')
    }
    if (!this.closed) this.enforce(index)
  }

  private removeFrame() {
    this.generation++
    if (this.poll !== undefined) this.win.clearInterval(this.poll)
    this.poll = undefined
    this.cleanupVideo?.()
    this.cleanupVideo = undefined
    if (this.secondVideo) {
      this.secondVideo.muted = true
      this.secondVideo.pause()
    }
    this.secondVideo = undefined
    this.frame?.remove()
    this.frame = undefined
    this.soloButtons[1] && (this.soloButtons[1].disabled = true)
    if (this.audible === 1) this.audible = null
    this.setActive(0)
    this.enforce(0)
  }
  private load(url: string) {
    this.removeFrame()
    this.pendingUrl = url
    const frame = this.win.document.createElement('iframe')
    frame.title = '第二路 B 站视频'
    frame.name = `layerpip-pane:${crypto.randomUUID()}`
    frame.allow = 'autoplay'
    // No top navigation, popups, fullscreen or recursive PiP permission.
    frame.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms')
    frame.src = url
    this.frame = frame
    this.loadedAt = Date.now()
    this.shell!.querySelector('[data-secondary-pane]')!.append(frame)
    this.message('正在加载第二画面…')
    frame.addEventListener('load', () => this.inspectFrame())
    this.poll = this.win.setInterval(() => this.inspectFrame(), 350)
  }
  private inspectFrame() {
    const frame = this.frame
    if (!frame || this.closed) return
    try {
      const child = frame.contentWindow
      if (!child || child.location.href === 'about:blank')
        return this.checkTimeout()
      const currentUrl = normalizePaneUrl(child.location.href)
      if (!this.secondVideo && /\/video\/av\d+\//i.test(this.pendingUrl))
        this.pendingUrl = currentUrl
      if (currentUrl !== this.pendingUrl)
        throw new Error('第二画面已离开指定视频，请重新加载链接。')
      const doc = child.document
      // CSS confines the complete page to its native player, keeping native controls.
      if (!doc.getElementById('layerpip-pane-layout')) {
        const style = doc.createElement('style')
        style.id = 'layerpip-pane-layout'
        style.textContent = `html,body{overflow:hidden!important;margin:0!important;background:#000!important}
body *{visibility:hidden!important}.bpx-player-container,.bpx-player-container *{visibility:visible!important}
.bpx-player-container{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-width:0!important;max-width:none!important;z-index:2147483647!important}
.bpx-player-ctrl-pip,.bpx-player-ctrl-full,.bpx-player-ctrl-web,.bpx-player-ctrl-wide,.start-pip-btn{display:none!important}`
        doc.documentElement.append(style)
      }
      const video = doc.querySelector<HTMLVideoElement>(
        '.bpx-player-container video',
      )
      if (!video) return this.checkTimeout()
      if (video === this.secondVideo) return
      this.cleanupVideo?.()
      if (this.secondVideo) {
        this.secondVideo.muted = true
        this.secondVideo.pause()
      }
      this.secondVideo = video
      video.muted = true
      const volume = () => this.enforce(1)
      const focus = () => {
        this.setActive(1)
      }
      video.addEventListener('volumechange', volume)
      doc.addEventListener('pointerdown', focus, true)
      doc.addEventListener('focusin', focus, true)
      this.cleanupVideo = () => {
        video.removeEventListener('volumechange', volume)
        doc.removeEventListener('pointerdown', focus, true)
        doc.removeEventListener('focusin', focus, true)
      }
      this.soloButtons[1].disabled = false
      const generation = this.generation
      void video
        .play()
        .then(() => {
          if (generation === this.generation)
            this.message('两路已加载；各自控制播放，使用“开启声音”切换独奏。')
        })
        .catch(() => {
          if (generation === this.generation)
            this.message('第二画面已加载，请在画面中点击播放。')
        })
    } catch (error) {
      this.removeFrame()
      this.message(
        error instanceof Error
          ? error.message
          : '第二画面无法访问，请重新加载。',
      )
    }
  }
  private checkTimeout() {
    if (Date.now() - this.loadedAt > 25_000) {
      this.removeFrame()
      this.message('第二画面加载超时，已释放。可以重新加载或退出多画面。')
    }
  }
  close() {
    if (!this.shell) return
    const wasPlaying = !this.mainVideo.paused
    this.closed = true
    this.removeFrame()
    this.mainVideo.removeEventListener('volumechange', this.mainVolume)
    this.mainVideo.muted = this.oldMuted
    if (this.parent)
      this.parent.insertBefore(
        this.mainRoot,
        this.next?.parentNode === this.parent ? this.next : null,
      )
    this.shell.remove()
    if (wasPlaying && !this.win.closed)
      void this.mainVideo.play().catch(() => {})
    this.shell = undefined
    this.soloButtons = []
    this.titles = []
    this.resize()
  }
}
