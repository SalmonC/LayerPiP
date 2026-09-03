import {
  ArrowsAltOutlined,
  CloseOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  QuestionCircleFilled,
  SettingOutlined,
  ShrinkOutlined,
} from '@ant-design/icons'
import { PlayerEvent } from '@root/core/event'
import { CommonSubtitleManager } from '@root/core/SubtitleManager'
import { useOnce } from '@root/hook'
import useDebounceTimeoutCallback from '@root/hook/useDebounceTimeoutCallback'
import useOpenIsolationModal from '@root/hook/useOpenIsolationModal'
import useTargetEventListener from '@root/hook/useTargetEventListener'
import PostMessageEvent from '@root/shared/postMessageEvent'
import configStore, { ReplacerDbClickAction } from '@root/store/config'
import { isDocPIP, isIframe, ownerWindow, wait } from '@root/utils'
import { hasParent } from '@root/utils/dom'
import screenfull from '@root/utils/screenfull'
import { Omit } from '@root/utils/typeUtils'
import { postMessageToTop } from '@root/utils/windowMessages'
import { useMemoizedFn, useUnmount, useUpdate } from 'ahooks'
import classNames from 'classnames'
import { observer } from 'mobx-react'
import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import AppRoot from '../AppRoot'
import VideoPlayerSide from '../VideoPlayer/Side'
import SubtitleSelection from '../VideoPlayer/subtitle/SubtitleSelection'
import SubtitleText from '../VideoPlayer/subtitle/SubtitleText'
import ActionButton from './bottomPanel/ActionButton'
import CurrentTimeTooltipsWithKeydown from './bottomPanel/CurrentTimeTooltipsWithKeydown'
import DanmakuSettingBtn from './bottomPanel/DanmakuSettingBtn'
import SharpeningButton from './bottomPanel/SharpeningButton'
import PlaybackRateSelection from './bottomPanel/PlaybackRateSelection'
import PlayedTime from './bottomPanel/PlayedTime'
import PlayerProgressBar from './bottomPanel/PlayerProgressBar'
import TogglePlayActionButton from './bottomPanel/TogglePlayActionButton'
import {
  ChangeNextVideoButton,
  ChangePreVideoButton,
} from './bottomPanel/VideoChangeButton'
import VolumeBar from './bottomPanel/VolumeBar'
import vpContext, { ContextData, defaultVpContext } from './context'
import DanmakuContainer from './DanmakuContainer'
import EventCenter from './EventCenter'
import {
  useInWindowKeydown,
  useKeydown,
  useTogglePlayState,
  useWebVideoEventsInit,
} from './hooks'
import KeyboardTipsModal from './KeyboardTipsModal'
import LoadingIcon from './LoadingIcon'
import ScreenshotTips from './ScreenshotTips'
import SpeedIcon from './SpeedIcon'
import Toast from './Toast'
import VolumeIcon from './VolumeIcon'
import ResizeButton from './bottomPanel/ResizeButton'

export type VideoPlayerHandle = {
  setCurrentTime: (time: number, pause?: boolean) => void
  togglePlayState: ReturnType<typeof useTogglePlayState>
  updateVideo: (video: HTMLVideoElement) => void
  updateVideoStream: (videoStream: MediaStream) => void
  ref: React.RefObject<HTMLVideoElement | null>
}

type Props = {
  className?: string
  isReplacerMode?: boolean
  showCloseButton?: boolean
} & Omit<ContextData, 'eventBus' | 'keyBinding'>

type VpInnerProps = Props & {
  setContext: React.Dispatch<React.SetStateAction<ContextData>>
} & Pick<ContextData, 'eventBus'>

const ACTION_AREA_ACTIVE = 'active'

const VideoPlayerV2Inner = observer(
  forwardRef<VideoPlayerHandle, VpInnerProps>((props, ref) => {
    const forceUpdate = useUpdate()
    const { isLive, keyBinding, keydownWindow, videoPreviewManger, eventBus } =
      useContext(vpContext)
    const [isFullInWeb, setFullInWeb] = useState(false)
    const [isFullscreen, setFullscreen] = useState(false)

    useOnce(() => {
      keyBinding.init()
      return () => {
        keyBinding.unload()
      }
    })

    useEffect(() => {
      if (!keydownWindow) return
      keyBinding.updateKeydownWindow(keydownWindow)
    }, [keydownWindow])

    const subtitleManager = useMemo(() => {
      if (props.subtitleManager) return props.subtitleManager
      else return new CommonSubtitleManager()
    }, [props.subtitleManager])
    useUnmount(() => {
      subtitleManager.unload()
    })

    const [keyboardTipsModal, keyboardTipsModalContext] =
      useOpenIsolationModal(KeyboardTipsModal)

    const { run, clear } = useDebounceTimeoutCallback(() => {
      videoPlayerRef.current?.classList.remove(ACTION_AREA_ACTIVE)
    }, 1000)

    const videoPlayerRef = useRef<HTMLDivElement>(null)
    /**video插入替换位置 */
    const videoInsertRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    /**这个专属于vp的ref，videoRef是专属于传入的webVideo */
    const inVpVideoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
      if (!videoPlayerRef.current) return
      videoPlayerRef.current.focus()
    }, [videoPlayerRef.current])

    useEffect(() => {
      if (!props.webVideo) return
      if (!videoRef.current) {
        videoRef.current = props.webVideo
      }

      // 不替换video
      if (!props.useWebVideo) {
        updateVideoRef(videoRef.current)
        return
      }

      if (!videoInsertRef.current) return
      // 替换video node
      const parent = videoInsertRef.current?.parentElement
      const lastVideo = videoRef.current
      if (!parent) return
      console.log('替换video node')
      parent.insertBefore(videoRef.current, videoInsertRef.current)
      setTimeout(() => {
        videoRef.current && updateVideoRef(videoRef.current)
      }, 0)

      // return () => {
      //   try {
      //     if (lastVideo?.parentElement != parent) return
      //     if (!videoInsertRef.current) return

      //     console.log('还原videoInert')
      //     parent.replaceChild(videoInsertRef.current, lastVideo)
      //   } catch (error) {
      //     console.error(error)
      //   }
      // }
    }, [videoRef.current, isFullInWeb])

    useEffect(() => {
      if (!videoPreviewManger || !videoRef.current) return
      videoPreviewManger.init(videoRef.current)

      return () => {
        videoPreviewManger.unload()
      }
    }, [videoPreviewManger, videoRef.current])

    const toggleFullInWeb = useMemoizedFn(() => {
      setFullInWeb((v) => {
        const toFullInWeb = !v
        if (isIframe()) {
          postMessageToTop(
            toFullInWeb
              ? PostMessageEvent.fullInWeb_request
              : PostMessageEvent.fullInWeb_close,
          )
        }
        return toFullInWeb
      })
    })
    const toggleFullscreen = useMemoizedFn(() => {
      if (screenfull.isFullscreen) {
        screenfull.exit()
        setFullscreen(false)
      } else {
        screenfull.isEnabled && screenfull.request(videoPlayerRef.current)
        setFullscreen(true)
      }
    })

    useEffect(() => {
      if (!isFullInWeb) return
      const bodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = bodyOverflow
      }
    }, [isFullInWeb])
    const quitFullMode = useMemoizedFn(() => {
      if (isFullInWeb) return toggleFullInWeb()
      if (screenfull.isFullscreen) return toggleFullscreen()
    })

    useTargetEventListener(
      'dblclick',
      (ev) => {
        if (!props.isReplacerMode) return
        ev.stopPropagation()
        ev.preventDefault()
        if (configStore.replacerDbClickAction === ReplacerDbClickAction.none)
          return
        if (!videoRef.current) return
        const isPause = videoRef.current.paused
        switch (configStore.replacerDbClickAction) {
          case ReplacerDbClickAction.fullscreen: {
            toggleFullscreen()
            break
          }
          case ReplacerDbClickAction.fullpage: {
            toggleFullInWeb()
            break
          }
        }
        wait(10).then(() => {
          if (!videoRef.current) return
          if (isPause !== videoRef.current.paused) {
            togglePlayState()
          }
        })
      },
      videoPlayerRef.current,
    )

    const updateVideoRef = useMemoizedFn((video: HTMLVideoElement) => {
      // console.trace('updateVideoRef', video)
      videoRef.current = video
      if (!subtitleManager.initd) {
        subtitleManager.init(video)
      }
      subtitleManager.video = video

      const isLive = props.isLive || video.duration === Infinity

      const keydownWindow = props.useWebVideo
        ? ownerWindow(video)
        : ownerWindow(videoPlayerRef.current)
      props.setContext((v) => ({
        ...v,
        isLive,
        webVideo: video,
        keydownWindow,
        videoPlayerRef: videoPlayerRef,
      }))

      if (!props.useWebVideo && props.videoStream) {
        updateVideoStream(props.videoStream)
      }
      forceUpdate()
    })

    const handleChangeActionArea = useMemoizedFn(
      (visible = true, lock = false) => {
        if (configStore.vpActionAreaLock) return

        if (visible) {
          run(() => {
            videoPlayerRef.current?.classList.add(ACTION_AREA_ACTIVE)
          })
          if (lock) {
            clear()
          }
        } else {
          clear()
          videoPlayerRef.current?.classList.remove(ACTION_AREA_ACTIVE)
        }
      },
    )

    useOnce(() => {
      return eventBus.on2(PlayerEvent.command_lockedModeToggle, () => {
        const dom = videoPlayerRef.current
        if (!dom) return
        const disable = 'pointer-events-none'
        if (dom.classList.contains(disable)) {
          dom.classList.remove(disable)
        } else {
          dom.classList.add(disable)
        }
      })
    })

    const togglePlayState = useTogglePlayState()

    // 初始化
    useInWindowKeydown()
    useWebVideoEventsInit()

    useKeydown('Escape', () => {
      quitFullMode()
    })

    const setCurrentTime = useMemoizedFn((time: number, pause?: boolean) => {
      if (!videoRef.current) return
      videoRef.current.currentTime = time
      if (pause) togglePlayState('pause')
    })
    const updateVideoStream = useMemoizedFn((stream: MediaStream) => {
      if (!inVpVideoRef.current) return
      inVpVideoRef.current.srcObject = stream
    })
    const updateVideo = useMemoizedFn((video: HTMLVideoElement) => {
      if (videoRef.current && videoPlayerRef.current && props.useWebVideo) {
        const videoInVp = hasParent(videoRef.current, videoPlayerRef.current)
        // 避免检测到替换了video，但旧video还存在vp中
        if (videoInVp) {
          videoRef.current.parentElement!.removeChild(videoRef.current)
        }
      }

      updateVideoRef(video)
    })

    useImperativeHandle(ref, () => {
      return {
        setCurrentTime,
        togglePlayState,
        updateVideo,
        updateVideoStream,
        ref: videoRef,
      }
    })

    const handleOpenSetting = useMemoizedFn(() => {
      // 全屏模式和docPIP内需要
      if (isFullscreen || isDocPIP(videoPlayerRef.current)) {
        if (!videoPlayerRef.current) return
        window.openSettingPanel(videoPlayerRef.current)
      } else {
        postMessageToTop(PostMessageEvent.openSettingPanel)
      }
    })

    const el = (
      <div
        tabIndex={-1}
        className={classNames(
          'video-player-v2 relative overflow-hidden select-none wh-[100%] group',
          props.className,
          configStore.vpActionAreaLock && ACTION_AREA_ACTIVE,
        )}
        style={{
          '--area-height': '48px',
          '--btn-size': '120px',
          '--side-width': configStore.sideWidth + 'px',
        }}
        ref={videoPlayerRef}
        onMouseLeave={() => {
          handleChangeActionArea(false)
        }}
      >
        {keyboardTipsModalContext}
        <div
          className={classNames(
            'video-container relative h-full bg-black',
            !isLive && 'cursor-pointer',
          )}
          onClick={() => {
            !isLive && togglePlayState()
          }}
          onMouseMove={() => {
            handleChangeActionArea(true)
          }}
          // onWheel={handleWheelInVideo}
        >
          <div ref={videoInsertRef}></div>
          <style>
            {`.video-player-v2 video {
    position: absolute !important;
    top: initial !important;
    right: initial !important;
    bottom: initial !important;
    left: initial !important;
    width: 100% !important;
    height: 100% !important;
    margin: 0 auto !important;
    cursor: pointer !important;
    ${configStore.videoSharpening ? `filter: contrast(1) !important;` : ''}
    pointer-events: none !important;
    transform: initial !important;
    z-index: initial !important;
  }`}
          </style>
          {!props.useWebVideo && (
            <video
              ref={(ref) => {
                if (!ref) return
                if (!props.webVideo) {
                  updateVideoRef(ref)
                }

                inVpVideoRef.current = ref
              }}
              autoPlay
              muted
            />
          )}

          {/* 状态icon */}
          <LoadingIcon />
          <VolumeIcon />
          <SpeedIcon />
          <ScreenshotTips />
          <EventCenter />
        </div>

        {/* 底部操作栏 */}
        <div
          className={classNames(
            'video-action-area w-full transition-[bottom] duration-fc-fast ease-out',
            // tailwind 检测不到ACTION_AREA_ACTIVE这种动态参数
            `absolute bottom-[calc(-1*(var(--area-height)+5px))] group-[&.active]:bottom-0`,
          )}
          onMouseEnter={(e) => handleChangeActionArea(true, true)}
          onMouseLeave={() => {
            handleChangeActionArea(false)
          }}
        >
          <div className="absolute -top-8 w-full pointer-events-none">
            <Toast />
          </div>

          <div className="absolute bottom-[calc(100%+12px)] w-full pointer-events-none">
            <SubtitleText subtitleManager={subtitleManager} />
          </div>

          {!isLive && <PlayerProgressBar />}

          <div className="action-controls opacity-0 group-[&.active]:opacity-100 transition-opacity duration-fc-fast ease-out">
            <div className="mask w-full h-[calc(var(--area-height)+24px)] absolute bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent z-[1]"></div>
            <div className="actions text-fc-text px-4 py-2 f-i-center relative z-[6] gap-2 h-area-height">
              {configStore.bp_preVideo && (
                <div className="fc-narrow-hide -mr-2">
                  <ChangePreVideoButton />
                </div>
              )}
              {configStore.bp_playToggle && <TogglePlayActionButton />}
              {configStore.bp_nextVideo && (
                <div className="fc-narrow-hide -ml-2">
                  <ChangeNextVideoButton />
                </div>
              )}

              <div className="fc-narrow-hide text-[12px] tabular-nums text-fc-text-muted">
                <PlayedTime />
              </div>

              <div className="f-i-center gap-1">
                {configStore.bp_subtitle && (
                  <SubtitleSelection subtitleManager={subtitleManager} />
                )}

                {configStore.bp_danmaku && <DanmakuSettingBtn />}

                {configStore.bp_playbackRate && <PlaybackRateSelection />}

                {configStore.bp_sharpening && <SharpeningButton />}

                <ActionButton
                  aria-label="打开设置"
                  title="打开设置"
                  onClick={handleOpenSetting}
                  className="fc-narrow-hide mb:hidden"
                >
                  <SettingOutlined className="block" />
                </ActionButton>
              </div>

              <div className="right ml-auto f-i-center gap-1">
                {configStore.bp_resize && (
                  <div className="fc-narrow-hide">
                    <ResizeButton />
                  </div>
                )}
                {configStore.keyboardTips_show && (
                  <ActionButton
                    aria-label="Keyboard shortcuts"
                    title="Keyboard shortcuts"
                    className="fc-narrow-hide"
                    onClick={keyboardTipsModal.openModal}
                  >
                    <QuestionCircleFilled />
                  </ActionButton>
                )}
                {configStore.bp_volume && <VolumeBar />}
                {props.isReplacerMode && (
                  <>
                    <ActionButton
                      aria-label={
                        isFullInWeb ? 'Exit full page' : 'Enter full page'
                      }
                      aria-pressed={isFullInWeb}
                      title={isFullInWeb ? 'Exit full page' : 'Enter full page'}
                      onClick={toggleFullInWeb}
                      className="ml-[6px]"
                    >
                      {isFullInWeb ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
                    </ActionButton>
                    <ActionButton
                      aria-label={
                        isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                      }
                      aria-pressed={isFullscreen}
                      title={
                        isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                      }
                      onClick={toggleFullscreen}
                    >
                      {isFullscreen ? (
                        <FullscreenExitOutlined />
                      ) : (
                        <FullscreenOutlined />
                      )}
                    </ActionButton>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <DanmakuContainer />
        <div className="group-[&.active]:opacity-0 transition-opacity duration-fc-fast">
          <CurrentTimeTooltipsWithKeydown />
        </div>

        {/* 侧边操作栏 */}
        <VideoPlayerSide />

        {props.isReplacerMode && (
          <button
            type="button"
            aria-label="Close player"
            title="Close player"
            className={classNames(
              'absolute right-[16px] top-0 z-20 group-[&.active]:top-[16px]',
              'opacity-0 group-[&.active]:opacity-100',
              'appearance-none border border-solid border-fc-border p-0',
              'fc-close-button',
              'rounded-fc-control wh-[32px] cursor-pointer text-fc-text bg-fc-control hover:bg-fc-control-hover text-[16px] f-center',
              'transition-[top,opacity,background-color,border-color] duration-fc-fast',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-accent',
            )}
            onClick={() => {
              props.videoPlayer.emit(PlayerEvent.close)
            }}
          >
            <CloseOutlined />
          </button>
        )}
      </div>
    )

    if (isFullInWeb)
      return createPortal(
        <AppRoot isShadowRoot>
          <div className="fixed top-0 left-0 size-full z-[9999]">{el}</div>
        </AppRoot>,
        document.body,
      )

    return el
  }),
)

const VideoPlayerV2 = forwardRef<VideoPlayerHandle, Props>((props, ref) => {
  const [context, setContext] = useState<ContextData>({
    ...defaultVpContext,
    ...props,
  })

  return (
    <vpContext.Provider value={{ ...context, setContext }}>
      <VideoPlayerV2Inner
        {...props}
        eventBus={context.eventBus}
        setContext={setContext}
        ref={ref}
      />
    </vpContext.Provider>
  )
})

export default VideoPlayerV2
