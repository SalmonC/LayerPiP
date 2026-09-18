/** Always settle event-handler play requests. Rejection must not lock future controls. */
const pendingPlayback = new WeakSet<HTMLVideoElement>()

export async function requestPlayback(
  video: HTMLVideoElement,
  report: (message: string) => void,
) {
  if (pendingPlayback.has(video)) return false

  pendingPlayback.add(video)
  video.setAttribute('can-pause', 'false')
  try {
    await video.play()
    return true
  } catch (error) {
    if ((error as { name?: string })?.name !== 'AbortError') {
      try {
        report(
          error instanceof Error
            ? error.message
            : '浏览器未能开始播放，请再次点击播放',
        )
      } catch {}
    }
    return false
  } finally {
    pendingPlayback.delete(video)
    video.setAttribute('can-pause', 'true')
  }
}
