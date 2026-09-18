import {
  cloneElement,
  type CSSProperties,
  type FC,
  type HTMLAttributes,
  type ReactElement,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { observer } from 'mobx-react'
import configStore from '@root/store/config'
import { formatTime } from '@root/utils'
import type { VideoPreviewData } from '@root/core/VideoPreviewManager'
import ProgressBar from '../../ProgressBar'
import vpContext from '../context'
import style from './PlayerProgressBar.less?inline'
import ProgressThumb from './ProgressThumb'

const clamp = (value: number) => Math.min(100, Math.max(0, value))

const PlayerProgressBar: FC = () => {
  const { webVideo } = useContext(vpContext)
  const containerRef = useRef<HTMLDivElement>(null)
  const seekingRef = useRef(false)
  const [playedPercent, setPlayedPercent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isSeeking, setSeeking] = useState(false)
  const [buffered, setBuffered] = useState<{ left: number; width: number }[]>(
    [],
  )
  const [color, setColor] = useState('#00a1d6')
  const ownerDocument = containerRef.current?.ownerDocument

  useEffect(() => {
    // The page can theme its native player. Read only its public CSS token;
    // never copy page styles into the PiP document.
    const nativePlayer = document.querySelector('.bpx-player-container')
    const primary =
      nativePlayer &&
      getComputedStyle(nativePlayer)
        .getPropertyValue('--bpx-primary-color')
        .trim()
    setColor(primary || '#00a1d6')
  }, [webVideo])

  useEffect(() => {
    const win = containerRef.current?.ownerDocument.defaultView
    if (!webVideo || !win) return
    let frame: number | undefined
    const sync = () => {
      const total =
        Number.isFinite(webVideo.duration) && webVideo.duration > 0
          ? webVideo.duration
          : 0
      setDuration(total)
      if (!seekingRef.current)
        setPlayedPercent(
          total ? clamp((webVideo.currentTime / total) * 100) : 0,
        )
    }
    const syncBuffer = () => {
      const total = webVideo.duration
      const ranges: { left: number; width: number }[] = []
      if (Number.isFinite(total) && total > 0) {
        for (let i = 0; i < webVideo.buffered.length; i++) {
          const left = clamp((webVideo.buffered.start(i) / total) * 100)
          ranges.push({
            left,
            width: Math.max(
              0,
              clamp((webVideo.buffered.end(i) / total) * 100) - left,
            ),
          })
        }
      }
      setBuffered(ranges)
    }
    const stop = () => {
      if (frame !== undefined) win.cancelAnimationFrame(frame)
      frame = undefined
      sync()
    }
    const tick = () => {
      sync()
      frame =
        !webVideo.paused && !webVideo.ended
          ? win.requestAnimationFrame(tick)
          : undefined
    }
    const start = () => {
      stop()
      tick()
    }
    const reset = () => {
      sync()
      syncBuffer()
    }
    for (const name of ['timeupdate', 'seeking', 'seeked'])
      webVideo.addEventListener(name, sync)
    for (const name of ['loadedmetadata', 'durationchange', 'emptied'])
      webVideo.addEventListener(name, reset)
    webVideo.addEventListener('progress', syncBuffer)
    webVideo.addEventListener('play', start)
    webVideo.addEventListener('pause', stop)
    webVideo.addEventListener('ended', stop)
    reset()
    if (!webVideo.paused) start()
    return () => {
      if (frame !== undefined) win.cancelAnimationFrame(frame)
      for (const name of ['timeupdate', 'seeking', 'seeked'])
        webVideo.removeEventListener(name, sync)
      for (const name of ['loadedmetadata', 'durationchange', 'emptied'])
        webVideo.removeEventListener(name, reset)
      webVideo.removeEventListener('progress', syncBuffer)
      webVideo.removeEventListener('play', start)
      webVideo.removeEventListener('pause', stop)
      webVideo.removeEventListener('ended', stop)
    }
  }, [webVideo, ownerDocument])

  useEffect(() => {
    const doc = containerRef.current?.ownerDocument
    const win = doc?.defaultView
    if (!doc || !win) return
    const finish = () => {
      seekingRef.current = false
      setSeeking(false)
    }
    const visibility = () => {
      if (doc.visibilityState !== 'visible') finish()
    }
    win.addEventListener('pointerup', finish, true)
    win.addEventListener('pointercancel', finish, true)
    win.addEventListener('blur', finish)
    doc.addEventListener('visibilitychange', visibility)
    return () => {
      win.removeEventListener('pointerup', finish, true)
      win.removeEventListener('pointercancel', finish, true)
      win.removeEventListener('blur', finish)
      doc.removeEventListener('visibilitychange', visibility)
    }
  }, [ownerDocument])

  const seek = (value: number) => {
    if (!webVideo || !duration || !Number.isFinite(value)) return
    const percent = clamp(value)
    setPlayedPercent(percent)
    // Seeking must not start a paused video or enqueue stale delayed seeks.
    webVideo.currentTime = (duration * percent) / 100
  }

  return (
    <>
      {configStore.videoProgress_show && (
        <div
          className="bottom-progress"
          style={{ '--progress-color': color } as CSSProperties}
        >
          <span style={{ transform: `scaleX(${playedPercent / 100})` }} />
        </div>
      )}
      <div
        ref={containerRef}
        className={`played-progress-bar${isSeeking ? ' is-seeking' : ''}`}
        style={{ '--progress-color': color } as CSSProperties}
      >
        <style dangerouslySetInnerHTML={{ __html: style }} />
        <div className="fc-progress-buffer" aria-hidden="true">
          {buffered.map((range, i) => (
            <span
              key={i}
              style={{ left: `${range.left}%`, width: `${range.width}%` }}
            />
          ))}
        </div>
        <ProgressBar
          percent={playedPercent}
          onClick={seek}
          loadColor={color}
          bgColor="rgba(255,255,255,.2)"
          keyboard={false}
          disabled={!duration}
          step={0.01}
          ariaLabelForHandle="播放进度"
          ariaValueTextFormatterForHandle={(value) =>
            `${formatTime((duration * value) / 100)} / ${formatTime(duration)}`
          }
          onBeforeChange={() => {
            seekingRef.current = true
            setSeeking(true)
          }}
          onChangeComplete={() => {
            seekingRef.current = false
            setSeeking(false)
          }}
          handleRender={(node) =>
            cloneElement(node as ReactElement<HTMLAttributes<HTMLDivElement>>, {
              children: (
                <span className="fc-progress-thumb">
                  <ProgressThumb />
                </span>
              ),
            })
          }
        />
        <ToolTips
          containerRef={containerRef}
          duration={duration}
          seeking={isSeeking}
          playedPercent={playedPercent}
        />
      </div>
    </>
  )
}

type ToolTipsProps = {
  containerRef: React.RefObject<HTMLDivElement | null>
  duration: number
  seeking: boolean
  playedPercent: number
}
const ToolTips: FC<ToolTipsProps> = ({
  containerRef,
  duration,
  seeking,
  playedPercent,
}) => {
  const { videoPreviewManger } = useContext(vpContext)
  const [hovered, setHovered] = useState(false)
  const [percent, setPercent] = useState(0)
  const [image, setImage] = useState<VideoPreviewData>()
  const previewGeneration = useRef(0)
  const visible = (hovered || seeking) && duration > 0
  const shownPercent = seeking ? playedPercent : percent
  const target = containerRef.current
  useEffect(() => {
    if (!target) return
    const move = (event: MouseEvent) => {
      const rect = target.getBoundingClientRect()
      if (!rect.width) return
      setPercent(clamp(((event.clientX - rect.left) / rect.width) * 100))
      setHovered(true)
    }
    const leave = () => setHovered(false)
    target.addEventListener('mousemove', move)
    target.addEventListener('mouseleave', leave)
    target.ownerDocument.defaultView?.addEventListener('blur', leave)
    return () => {
      target.removeEventListener('mousemove', move)
      target.removeEventListener('mouseleave', leave)
      target.ownerDocument.defaultView?.removeEventListener('blur', leave)
    }
  }, [target])
  useEffect(() => {
    let current = true
    const generation = ++previewGeneration.current
    if (!visible || !videoPreviewManger) {
      setImage(undefined)
      return
    }
    void videoPreviewManger
      .getPreviewImage((duration * shownPercent) / 100)
      .then((value) => {
        if (current && generation === previewGeneration.current) setImage(value)
      })
      .catch(() => {
        if (current && generation === previewGeneration.current)
          setImage(undefined)
      })
    return () => {
      current = false
    }
  }, [videoPreviewManger, visible, duration, shownPercent])
  useEffect(
    () =>
      videoPreviewManger?.on2('unload', () => {
        ++previewGeneration.current
        setImage(undefined)
      }),
    [videoPreviewManger],
  )
  if (!visible) return null
  return (
    <>
      <div
        className="fc-progress-indicator"
        style={{ left: `${shownPercent}%` }}
      />
      <div
        className={`fc-progress-preview${image ? ' has-image' : ''}`}
        style={{
          left: `clamp(min(80px, 50%), ${shownPercent}%, max(50%, calc(100% - 80px)))`,
        }}
      >
        {image && <img src={image.image} alt="" />}
        <span>{formatTime((duration * shownPercent) / 100)}</span>
      </div>
    </>
  )
}
export default observer(PlayerProgressBar)
