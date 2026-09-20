/** A hint only: suppress extension entry points, never grant host authority. */
export const isMultiVideoPane = () =>
  window !== window.top && /^layerpip-pane:[a-f0-9-]+$/.test(window.name)

export function normalizePaneUrl(value: string): string {
  const input = value.trim()
  const url = new URL(
    /^BV[\da-z]+$/i.test(input)
      ? `https://www.bilibili.com/video/${input}/`
      : input,
  )
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.bilibili.com' ||
    !/^\/video\/(BV[\da-z]+|av\d+)\/?$/i.test(url.pathname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('请输入完整的 B 站视频链接或 BV 号')
  const page = Number(url.searchParams.get('p') ?? 1)
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('分 P 编号无效')
  return `${url.origin}${url.pathname.replace(/\/$/, '')}/?p=${page}`
}

/** MAIN-world, before site scripts: a pane cannot recursively open PiP. */
export function restrictPane() {
  const rejectPip = () =>
    Promise.reject(
      new DOMException('多画面内不能再次打开小窗', 'NotAllowedError'),
    )
  HTMLVideoElement.prototype.requestPictureInPicture = rejectPip
  if (window.documentPictureInPicture)
    window.documentPictureInPicture.requestWindow = rejectPip
  // The host retains media-session ownership; native in-frame keys still work.
  if (navigator.mediaSession) {
    navigator.mediaSession.setActionHandler = () => {}
    for (const key of ['metadata', 'playbackState']) {
      try {
        Object.defineProperty(navigator.mediaSession, key, {
          configurable: true,
          get: () => (key === 'metadata' ? null : 'none'),
          set: () => {},
        })
      } catch {}
    }
  }
  // Mute before the page gets its first play() call, avoiding a loading audio burst.
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    if (!this.hasAttribute('data-layerpip-audible')) this.muted = true
    return play.call(this)
  }
}
