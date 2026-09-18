import { FC, useContext, useEffect, useState } from 'react'
import useTargetEventListener from '@root/hook/useTargetEventListener'
import classNames from 'classnames'
import { useMemoizedFn } from 'ahooks'
import { useOnce } from '@root/hook'
import { PlayerEvent } from '@root/core/event'
import HiddenAble from '@root/components/HiddenAble'
import Dropdown from '../../Dropdown'
import vpContext from '../context'
import ActionButton from './ActionButton'

const PlaybackRateSelection: FC = (props) => {
  const { webVideo, isLive, eventBus } = useContext(vpContext)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [lastPlaybackRate, setLastPlaybackRate] = useState(3)

  useEffect(() => {
    if (!webVideo) return
    setPlaybackRate(webVideo.playbackRate)
  }, [webVideo])
  useTargetEventListener(
    'ratechange',
    () => {
      if (!webVideo) return
      setPlaybackRate(webVideo.playbackRate)
    },
    webVideo,
  )

  const handleChangePlaybackRate = (rate: number) => {
    if (!webVideo) return
    if (rate == playbackRate) return
    if (playbackRate != 1) {
      setLastPlaybackRate(playbackRate)
    }
    setPlaybackRate(rate)
    webVideo.playbackRate = rate
  }

  const handleTogglePlaybackRate = useMemoizedFn(() => {
    if (playbackRate === 1) {
      handleChangePlaybackRate(lastPlaybackRate)
    } else {
      handleChangePlaybackRate(1)
    }
  })

  useOnce(() =>
    eventBus.on2(PlayerEvent.command_speedDown, () => {
      if (!webVideo || isLive) return
      webVideo.playbackRate -= 0.25
    }),
  )
  useOnce(() =>
    eventBus.on2(PlayerEvent.command_speedUp, () => {
      if (!webVideo || isLive) return
      webVideo.playbackRate += 0.25
    }),
  )
  useOnce(() =>
    eventBus.on2(PlayerEvent.command_speedToggle, () => {
      if (!webVideo || isLive) return
      handleTogglePlaybackRate()
    }),
  )

  const menu = (close: () => void) => (
    <div className="fc-menu fc-rate-menu">
      {[2, 1.5, 1.25, 1, 0.75, 0.5].map((rate) => {
        return (
          <button
            type="button"
            key={rate}
            className={classNames(
              'fc-menu-item is-centered',
              rate === playbackRate && 'is-active',
            )}
            onClick={() => {
              handleChangePlaybackRate(rate)
              close()
            }}
          >
            {Number.isInteger(rate * 10) ? rate.toFixed(1) : rate}x
          </button>
        )
      })}
    </div>
  )

  if (isLive) return null
  return (
    <Dropdown playerMenu menuRender={menu}>
      <ActionButton
        aria-label={`播放速度 ${playbackRate.toFixed(2)} 倍`}
        title="播放速度"
      >
        {playbackRate === 1 ? '倍速' : `${playbackRate}x`}
      </ActionButton>
    </Dropdown>
  )
}

export default PlaybackRateSelection
