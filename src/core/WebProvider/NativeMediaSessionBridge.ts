export type NativeMediaAction = {
  action: MediaSessionAction
  seekOffset?: number
  seekTime?: number
}
export type NativeMediaState = {
  duration?: number
  playbackRate: number
  playing: boolean
  position?: number
}

/** A dedicated channel avoids sharing uncorrelated run-code responses. */
export default class NativeMediaSessionBridge {
  private channel?: string
  private dispose = () => {}

  async start(isLive: boolean, onAction: (action: NativeMediaAction) => void) {
    if (this.channel) return
    const channel = `layerpip-media-session-${crypto.randomUUID()}`
    this.channel = channel
    const actions = new Set<MediaSessionAction>(
      isLive
        ? ['play', 'pause']
        : ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'],
    )
    const actionEvent = `${channel}:action`
    const readyEvent = `${channel}:ready`
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<NativeMediaAction>).detail
      if (this.channel === channel && detail && actions.has(detail.action))
        onAction(detail)
    }
    window.addEventListener(actionEvent, listener)
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (error?: string) => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          window.removeEventListener(readyEvent, ready)
          error ? reject(new Error(error)) : resolve()
        }
        const ready = (event: Event) =>
          finish((event as CustomEvent<{ error?: string }>).detail?.error)
        const timer = window.setTimeout(
          () => finish('未能安全记录页面媒体控制，请手动重新打开视频页后重试'),
          3000,
        )
        this.dispose = () => {
          window.removeEventListener(actionEvent, listener)
          window.dispatchEvent(
            new CustomEvent('layerpip:native-release', { detail: { channel } }),
          )
          finish('原生媒体控制已取消')
        }
        window.addEventListener(readyEvent, ready)
        window.dispatchEvent(
          new CustomEvent('layerpip:native-claim', {
            detail: { channel, live: isLive },
          }),
        )
      })
      if (this.channel !== channel) throw new Error('原生媒体控制已取消')
    } catch (error) {
      if (this.channel === channel) this.stop()
      throw error
    }
  }
  sync(state: NativeMediaState) {
    if (this.channel)
      window.dispatchEvent(
        new CustomEvent(`${this.channel}:state`, { detail: state }),
      )
  }
  stop() {
    this.channel = undefined
    this.dispose()
    this.dispose = () => {}
  }
}
