/** Installed before site scripts. Observes registrations; borrows controls only during PiP. */
export function installNativeMediaSession(root: Window) {
  const marker = Symbol.for('layerpip.native-media-observer.v1')
  if (Object.getOwnPropertyDescriptor(root, marker)) return
  const media = root.navigator.mediaSession
  if (!media || root.document.readyState !== 'loading') return
  const prototype = Object.getPrototypeOf(media) as MediaSession
  const descriptor = Object.getOwnPropertyDescriptor(
    prototype,
    'setActionHandler',
  )
  if (!descriptor?.value || !descriptor.configurable) return
  const original = media.setActionHandler
  const pageHandlers = new Map<
    MediaSessionAction,
    MediaSessionActionHandler | null
  >()
  let lease:
    | {
        channel: string
        handlers: Map<MediaSessionAction, MediaSessionActionHandler>
        stop: () => void
      }
    | undefined

  const tracked: MediaSession['setActionHandler'] = function (action, handler) {
    // Let the browser validate arguments before recording the page's intent.
    original.call(this, action, handler)
    if (this !== media) return
    pageHandlers.set(action, handler)
    const borrowed = lease?.handlers.get(action)
    if (borrowed) original.call(media, action, borrowed)
  }
  Object.defineProperty(root, marker, { value: true })
  Object.defineProperty(prototype, 'setActionHandler', {
    ...descriptor,
    value: tracked,
  })

  root.addEventListener('layerpip:native-claim', (event) => {
    const request = (event as CustomEvent<{ channel: string; live: boolean }>)
      .detail
    if (
      !request ||
      typeof request.channel !== 'string' ||
      !/^layerpip-media-session-[a-f0-9-]+$/.test(request.channel)
    )
      return
    const { channel, live } = request
    const respond = (error?: string) =>
      root.dispatchEvent(
        new CustomEvent(`${channel}:ready`, { detail: { error } }),
      )
    if (lease) {
      respond(
        lease.channel === channel ? undefined : '已有原生小窗正在使用媒体控制',
      )
      return
    }
    if (media.setActionHandler !== tracked) {
      respond('页面媒体控制已被替换，无法安全接管；请手动重新打开视频页后重试')
      return
    }
    const actions: MediaSessionAction[] = live
      ? ['play', 'pause']
      : ['play', 'pause', 'seekbackward', 'seekforward', 'seekto']
    const handlers = new Map<MediaSessionAction, MediaSessionActionHandler>()
    const stateEvent = `${channel}:state`
    const onState = (event: Event) => {
      if (lease?.channel !== channel) return
      const state = (
        event as CustomEvent<{
          playing: boolean
          duration?: number
          position?: number
          playbackRate: number
        }>
      ).detail
      if (!state || typeof state.playing !== 'boolean') return
      media.playbackState = state.playing ? 'playing' : 'paused'
      if (
        !live &&
        Number.isFinite(state.duration) &&
        state.duration! > 0 &&
        Number.isFinite(state.position) &&
        state.position! >= 0 &&
        state.position! <= state.duration!
      ) {
        try {
          media.setPositionState({
            duration: state.duration!,
            position: state.position!,
            playbackRate:
              Number.isFinite(state.playbackRate) && state.playbackRate > 0
                ? state.playbackRate
                : 1,
          })
        } catch {
          /* Unsupported position reporting does not change source playback. */
        }
      }
    }
    const stop = () => {
      if (lease?.channel !== channel) return
      root.removeEventListener(stateEvent, onState)
      lease = undefined
      // Never overwrite an unknown controller that replaced the observed method.
      if (media.setActionHandler !== tracked) return
      for (const action of handlers.keys()) {
        try {
          original.call(media, action, pageHandlers.get(action) ?? null)
        } catch {
          /* Continue restoring other actions. */
        }
      }
    }
    lease = { channel, handlers, stop }
    try {
      for (const action of actions) {
        const handler: MediaSessionActionHandler = (details) => {
          if (lease?.channel !== channel) return
          root.dispatchEvent(
            new CustomEvent(`${channel}:action`, {
              detail: {
                action,
                seekOffset: details.seekOffset,
                seekTime: details.seekTime,
              },
            }),
          )
        }
        original.call(media, action, handler)
        handlers.set(action, handler)
      }
      root.addEventListener(stateEvent, onState)
      respond()
    } catch {
      stop()
      respond('浏览器未能建立完整的原生媒体控制，已归还页面控制')
    }
  })
  root.addEventListener('layerpip:native-release', (event) => {
    if (
      (event as CustomEvent<{ channel: string }>).detail?.channel ===
      lease?.channel
    )
      lease?.stop()
  })
  root.addEventListener('pagehide', () => lease?.stop())
}
