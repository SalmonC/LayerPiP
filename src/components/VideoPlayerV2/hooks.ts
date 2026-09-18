import { useContext, useEffect } from 'react'
import { minmax } from '@root/utils'
import configStore from '@root/store/config'
import { PlayerEvent } from '@root/core/event'
import { isInteractiveEvent } from '@root/core/KeyBinding'
import { requestPlayback } from '@root/core/playbackRequest'
import useTargetEventListener from '@root/hook/useTargetEventListener'
import { Key, keyCodeToCode, keyToKeyCodeMap } from '@root/types/key'
import { isFunction, isString } from 'lodash-es'
import { useMemoizedFn } from 'ahooks'
import toast from 'react-hot-toast'
import vpContext from './context'

export const useTogglePlayState = () => {
  const { webVideo, isLive } = useContext(vpContext)

  const togglePlayState = useMemoizedFn(async (type?: 'play' | 'pause') => {
    if (!webVideo) return false
    if (type === 'play' && !webVideo.paused) return true

    if (type !== 'play' && (!webVideo.paused || type === 'pause')) {
      webVideo.pause()
      return true
    } else {
      if (webVideo.currentTime === webVideo.duration) {
        webVideo.currentTime = 0
      }
      const played = await requestPlayback(webVideo, (message) =>
        toast.error(`无法播放：${message}`),
      )
      return played
    }
  })

  return togglePlayState
}

/**监听docPIP全局键盘 */
export const useInWindowKeydown = () => {
  const { webVideo, eventBus, isLive, keydownWindow, keyBinding } =
    useContext(vpContext)
  const togglePlayState = useTogglePlayState()

  useEffect(() => {
    if (!keydownWindow) return

    const oneFrame = 1 / 60
    let active = true
    let beforeLongPressSpeedModePlaybackRate: number = 1
    let longPressSpeedModeActive = false
    const callbackFns = [
      eventBus.on2(PlayerEvent.command_rewind, () => {
        if (!webVideo) return
        if (isLive) return
        let getNewTime = () =>
          minmax(webVideo.currentTime - 5, 0, webVideo.duration)

        if (webVideo.paused) {
          const video = webVideo
          togglePlayState('play').then((played) => {
            if (!active || !played) return
            video.currentTime = getNewTime()
            eventBus.emit(PlayerEvent.changeCurrentTimeByKeyboard)
          })
        } else {
          webVideo.currentTime = getNewTime()
          eventBus.emit(PlayerEvent.changeCurrentTimeByKeyboard)
        }
      }),
      eventBus.on2(PlayerEvent.command_forward, () => {
        if (!webVideo) return
        if (isLive) return
        const getNewTime = () =>
          minmax(webVideo.currentTime + 5, 0, webVideo.duration)

        if (webVideo.paused) {
          const video = webVideo
          togglePlayState('play').then((played) => {
            if (!active || !played) return
            video.currentTime = getNewTime()
            eventBus.emit(PlayerEvent.changeCurrentTimeByKeyboard)
          })
        } else {
          webVideo.currentTime = getNewTime()
          eventBus.emit(PlayerEvent.changeCurrentTimeByKeyboard)
        }
      }),
      eventBus.on2(PlayerEvent.command_pressSpeedMode, () => {
        if (!webVideo) return
        if (isLive) return
        beforeLongPressSpeedModePlaybackRate = webVideo.playbackRate
        webVideo.playbackRate = configStore.playbackRate
        longPressSpeedModeActive = true
        eventBus.emit(PlayerEvent.longTabPlaybackRate)
      }),
      eventBus.on2(PlayerEvent.command_pressSpeedMode_release, () => {
        if (!webVideo) return
        if (isLive) return
        webVideo.playbackRate = beforeLongPressSpeedModePlaybackRate
        longPressSpeedModeActive = false
        eventBus.emit(PlayerEvent.longTabPlaybackRateEnd)
      }),

      eventBus.on2(PlayerEvent.command_playToggle, () => togglePlayState()),
      eventBus.on2(PlayerEvent.command_fineForward, () => {
        if (!webVideo) return
        const getNewTime = () =>
          minmax(webVideo.currentTime + oneFrame, 0, webVideo.duration)

        webVideo.currentTime = getNewTime()
        eventBus.emit(PlayerEvent.changeCurrentTimeByKeyboard_fine)
      }),
      eventBus.on2(PlayerEvent.command_fineRewind, () => {
        if (!webVideo) return
        const getNewTime = () =>
          minmax(webVideo.currentTime - oneFrame, 0, webVideo.duration)

        webVideo.currentTime = getNewTime()
        eventBus.emit(PlayerEvent.changeCurrentTimeByKeyboard_fine)
      }),
    ]

    return () => {
      active = false
      if (longPressSpeedModeActive && webVideo && !isLive) {
        webVideo.playbackRate = beforeLongPressSpeedModePlaybackRate
        eventBus.emit(PlayerEvent.longTabPlaybackRateEnd)
        longPressSpeedModeActive = false
      }
      callbackFns.forEach((fn) => fn())
    }
  }, [keydownWindow, isLive, webVideo])
}

export function useKeydown(
  onKeydown: (key: Key, e: KeyboardEvent) => void,
): void
export function useKeydown(key: Key, fn: (e: KeyboardEvent) => void): void
export function useKeydown(
  onKeydown: ((key: Key, e: KeyboardEvent) => void) | Key,
  fn?: (e: KeyboardEvent) => void,
) {
  const { webVideo, isLive, keydownWindow } = useContext(vpContext)
  useEffect(() => {
    if (!keydownWindow) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!webVideo) return
      if (isInteractiveEvent(e)) return
      const key = e.key?.length === 1 ? e.key.toUpperCase() : e.key
      let keyCode =
        e.keyCode ||
        (keyToKeyCodeMap as any)[e.code] ||
        (keyToKeyCodeMap as any)[key]
      if (isFunction(onKeydown)) {
        onKeydown((keyCodeToCode as any)[keyCode] as Key, e)
      }
      if (isString(onKeydown)) {
        if (keyCode === (keyToKeyCodeMap as any)[onKeydown]) {
          fn?.(e)
        }
      }
    }
    keydownWindow.addEventListener('keydown', handleKeyDown)
    // 这是给replacer模式监听的，keydown keyup已经被阻止了，通过一层代理转发和监听
    const handleKeyDownCustom = (e: KeyboardEvent) => {
      const detail = e.detail
      handleKeyDown(detail as any)
    }
    keydownWindow.addEventListener(
      'layerpip-player-keydown' as any,
      handleKeyDownCustom,
    )

    return () => {
      keydownWindow.removeEventListener('keydown', handleKeyDown)
      keydownWindow.removeEventListener(
        'layerpip-player-keydown' as any,
        handleKeyDownCustom,
      )
    }
  }, [keydownWindow, isLive])
}

export const useWebVideoEventsInit = () => {
  const { webVideo, eventBus } = useContext(vpContext)

  useTargetEventListener(
    'seeked',
    () => eventBus.emit(PlayerEvent.seeked),
    webVideo,
  )
  useTargetEventListener(
    'play',
    () => eventBus.emit(PlayerEvent.play),
    webVideo,
  )
  useTargetEventListener(
    'pause',
    () => eventBus.emit(PlayerEvent.pause),
    webVideo,
  )
}
