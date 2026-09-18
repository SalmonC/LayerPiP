import { useContext, useEffect, useState, type CSSProperties } from 'react'
import useTargetEventListener from '@root/hook/useTargetEventListener'
import { PlayerEvent } from '@root/core/event'
import Dropdown from '../../Dropdown'
import VolumeGlyph from './VolumeGlyph'
import ActionButton from './ActionButton'
import vpContext from '../context'

export default function VolumeBar() {
  const { webVideo, eventBus } = useContext(vpContext)
  const [volume, setVolume] = useState(0)
  const [muted, setMuted] = useState(false)
  const sync = () => {
    setVolume(Math.round((webVideo?.volume ?? 0) * 100))
    setMuted(webVideo?.muted ?? false)
  }
  useEffect(sync, [webVideo])
  useTargetEventListener('volumechange', sync, webVideo)
  const toggle = () => {
    if (webVideo) webVideo.muted = !webVideo.muted
  }
  useEffect(
    () => eventBus.on2(PlayerEvent.command_muteToggle, toggle),
    [eventBus, webVideo],
  )
  return (
    <Dropdown
      playerMenu
      action={['hover']}
      popupClassName="fc-volume-popup"
      popupAlign={{
        points: ['bc', 'tc'],
        offset: [0, -14],
        overflow: { adjustX: 1, adjustY: 1 },
      }}
      menuRender={() => (
        <div className="fc-menu fc-volume-menu">
          <output>{muted ? 0 : volume}</output>
          <input
            type="range"
            className="fc-volume-slider"
            aria-label="音量"
            min={0}
            max={100}
            value={muted ? 0 : volume}
            style={
              { '--range-fill': `${muted ? 0 : volume}%` } as CSSProperties
            }
            onChange={(event) => {
              if (webVideo) {
                webVideo.muted = false
                webVideo.volume = Number(event.target.value) / 100
              }
            }}
          />
        </div>
      )}
    >
      <ActionButton
        className="fc-volume-button"
        aria-label={muted || !volume ? '取消静音' : '静音'}
        title="音量（M）"
        onClick={toggle}
      >
        <VolumeGlyph muted={muted || !volume} />
      </ActionButton>
    </Dropdown>
  )
}
