import { SettingOutlined } from '@ant-design/icons'
import { useOnce } from '@root/hook'
import useAutoPIPHandler from '@root/hook/useAutoPIPHandler'
import useDebounceTimeoutCallback from '@root/hook/useDebounceTimeoutCallback'
import useTargetEventListener from '@root/hook/useTargetEventListener'
import { VIDEO_ID_ATTR } from '@root/shared/config'
import isPluginEnv from '@root/shared/isPluginEnv'
import PostMessageEvent from '@root/shared/postMessageEvent'
import { FLOAT_BTN_HIDDEN } from '@root/shared/storeKey'
import configStore from '@root/store/config'
import { FloatButtonPos } from '@root/store/config/floatButton'
import { DocPIPRenderType } from '@root/types/config'
import { throttle, tryCatch, uuid } from '@root/utils'
import { postStartPIPDataMsg } from '@root/utils/pip'
import { useBrowserSyncStorage } from '@root/utils/storage'
import { sendMediaStreamInSender } from '@root/utils/webRTC'
import { onPostMessage, postMessageToTop } from '@root/utils/windowMessages'
import { useMemoizedFn, useSize, useUnmount } from 'ahooks'
import classNames from 'classnames'
import { observer } from 'mobx-react'
import { FC, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Browser from 'webextension-polyfill'
import icon from '../../assets/icon.png'
import AppRoot from './AppRoot'

type Props = {
  container: HTMLElement
  vel: HTMLVideoElement
  fixedPos?: boolean
  initPos: { x: number; y: number }
}

const FloatButton: FC<Props> = (props) => {
  const { container, vel, fixedPos } = props

  const videoRef = useRef<HTMLVideoElement>(null)
  useOnce(() =>
    useBrowserSyncStorage(FLOAT_BTN_HIDDEN, (hidden) => {
      if (!floatBtn.current) return
      floatBtn.current.style.visibility = !hidden ? 'visible' : 'hidden'
    }),
  )

  const [id] = useState(() => uuid())

  useOnce(() => {
    vel.setAttribute(VIDEO_ID_ATTR, id)

    return () => {
      vel.removeAttribute(VIDEO_ID_ATTR)
    }
  })

  useAutoPIPHandler(vel)

  // fixed会受到 transform、perspective、filter 或 backdrop-filter 影响上下文
  // @see https://developer.mozilla.org/zh-CN/docs/Web/CSS/position#fixed
  const setFixedPosIn = useMemoizedFn(() => {
    if (!floatBtn.current) return
    const { left, top } = vel.getBoundingClientRect()
    ;(floatBtn.current as any).style = `left:${
      left + configStore.floatButtonX
    }px !important;top:${
      top + configStore.floatButtonY
    }px !important;position:fixed !important;`
  })

  const floatBtn = useRef<HTMLDivElement>(null)
  const isLockRef = useRef(false)
  const isHoverLockRef = useRef(false)
  const hiddenFloatBtn = useMemoizedFn(() => {
    if (isLockRef.current) return
    if (isHoverLockRef.current) return
    floatBtn.current?.classList.add('hidden-btn')
  })
  const showFloatBtn = useMemoizedFn(() => {
    floatBtn.current?.classList.remove('hidden-btn')
  })
  const { clear, run } = useDebounceTimeoutCallback(hiddenFloatBtn, 2000)
  const startShowFloatBtn = useMemoizedFn(() => {
    run(showFloatBtn)
  })
  const setFixedPosInMove = useMemoizedFn(throttle(setFixedPosIn, 500))

  const mouseTarget = fixedPos ? vel : container
  useOnce(() => {
    if (fixedPos) {
      setFixedPosIn()
    }
  })
  useTargetEventListener(
    'mousemove',
    () => {
      if (fixedPos) {
        setFixedPosInMove()
      }
      startShowFloatBtn()
    },
    mouseTarget,
  )
  useTargetEventListener(
    'mouseleave',
    () => {
      clear()
      hiddenFloatBtn()
    },
    mouseTarget,
  )

  // webRTC unmount
  const webRTCUnmountRef = useRef(() => {})
  useUnmount(webRTCUnmountRef.current)

  const handleStartPIP = useMemoizedFn(async () => {
    const videoEl =
      container instanceof HTMLVideoElement
        ? container
        : container.querySelector('video')

    console.log('视频容器', videoEl, '父容器', container)
    if (!videoEl) return
    videoRef.current = videoEl

    // 检测可否访问top
    const [cannotAccessTop] = tryCatch(() => top!.document)
    if (cannotAccessTop) {
      const type = configStore.notSameOriginIframeCaptureModePriority
      console.log(`🟡 非同源iframe，将启用其他模式 ${type}`)

      // 走非同源iframe捕获模式
      const [isErrorInOtherMode] = await tryCatch(async () => {
        switch (type) {
          case DocPIPRenderType.capture_captureStreamWithWebRTC:
            const stream = videoEl.captureStream()
            const { unMount } = sendMediaStreamInSender({ stream })

            const handleUnmount = () => {
              unMount()
              unListen()
            }
            const unListen = onPostMessage(
              PostMessageEvent.webRTC_close,
              handleUnmount,
            )
            webRTCUnmountRef.current = handleUnmount
            break
        }

        await postStartPIPDataMsg(type, videoEl)
      })

      if (isErrorInOtherMode) {
        console.error(
          '🔴 其他模式也不可用，启动保底的旧画中画',
          isErrorInOtherMode,
        )
        videoEl.requestPictureInPicture()
        throw Error('该视频可能在非同源的iframe中，目前不支持非同源iframe')
      }

      return true
    }

    // 检测该video是不是在同源的iframe里
    const isInIframeVideo = videoEl.ownerDocument !== top?.document
    // blob:开头的视频不能用replaceVideoEl模式
    const isBlobSrc = videoEl.src.startsWith('blob:')
    if (isInIframeVideo && isBlobSrc) {
      const type = configStore.sameOriginIframeCaptureModePriority
      console.log(`🟡 同源iframe，将启用其他模式 ${type}`)
      postStartPIPDataMsg(type, videoEl)
      return true
    }

    // 如果都没用上面的模式，则走默认的设置的优先模式
    postStartPIPDataMsg(configStore.docPIP_renderType, videoEl)
    return true
  })

  const handleOpenSetting = useMemoizedFn(() => {
    postMessageToTop(PostMessageEvent.openSettingPanel)
  })

  // 处理top发来的更新video状态的消息
  useOnce(() =>
    onPostMessage(PostMessageEvent.updateVideoState, (data) => {
      if (data.id !== id || !videoRef.current) return
      const video = videoRef.current
      if (data.isPause) {
        video.pause()
      }
      if (data.isPlay) {
        video.play()
      }
      if (data.currentTime !== undefined) {
        video.currentTime = data.currentTime
      }
    }),
  )
  // 处理top发来的请求PIP
  useOnce(() =>
    onPostMessage(PostMessageEvent.requestVideoPIP, (data) => {
      if (data.id !== id) return
      handleStartPIP()
    }),
  )

  const containerSize = useSize(container)
  const posStyle = useMemo(() => {
    switch (configStore.floatButtonPos) {
      case FloatButtonPos.leftBottom:
        return {
          left: +configStore.floatButtonX,
          bottom: +configStore.floatButtonY,
        }
      case FloatButtonPos.rightBottom:
        return {
          right: +configStore.floatButtonX,
          bottom: +configStore.floatButtonY,
        }
      case FloatButtonPos.leftTop:
        return {
          left: +configStore.floatButtonX,
          top: +configStore.floatButtonY,
        }
      case FloatButtonPos.rightTop:
        return {
          right: +configStore.floatButtonX,
          top: +configStore.floatButtonY,
        }
    }
  }, [
    configStore.floatButtonPos,
    configStore.floatButtonX,
    configStore.floatButtonY,
  ])

  return (
    <>
      {/* 拖动测试的4个角 */}
      {/* TODO 懒得弄这么精细了 */}
      {configStore.dragArea_show &&
        createPortal(
          <div>
            {[
              ['left', 'top'],
              ['left', 'bottom'],
              ['right', 'top'],
              ['right', 'bottom'],
            ].map(([x, y], i) => {
              return (
                <div
                  key={i}
                  style={{
                    width:
                      ((containerSize?.width ?? 0) *
                        configStore.dragArea_cornerPercentW) /
                      100,
                    height:
                      ((containerSize?.height ?? 0) *
                        configStore.dragArea_cornerPercentH) /
                      100,
                    [x]: 0,
                    [y]: 0,
                    // 下面就不用tailwind了，注入到网页里怕出问题
                    position: 'absolute',
                    backgroundColor: '#0669ff',
                    opacity: 0.5,
                    border: '1px #fff',
                    pointerEvents: 'none',
                    zIndex: 20,
                  }}
                ></div>
              )
            })}
          </div>,
          container,
        )}

      {createPortal(
        <AppRoot isShadowRoot>
          {/* TODO 拖拽功能在小网站还可以用，但是油管、bilibili这些复杂网站会出问题 */}
          {/* <DraggerContainer
            bounds={{
              left: 0,
              top: 0,
              right:
                (containerSize?.width ?? 0) - (floatBtnSize?.width ?? 0) - 10,
              bottom:
                (containerSize?.height ?? 0) - (floatBtnSize?.height ?? 0) - 10,
            }}
            onStart={() => {
              clear()
              isLockRef.current = true
            }}
            onStop={(e, data) => {
              isLockRef.current = false
              setBrowserSyncStorage(DRAG_POS, {
                x: data.x,
                y: data.y,
                xType: 'left',
                yType: 'top',
              })
            }}
            clickSensitive={2}
            initPosition={{
              x: props.initPos.x,
              y: props.initPos.y,
            }}
          > */}
          <div
            ref={floatBtn}
            className={classNames(
              'rc-float-btn',
              'fc-floatbar z-[100] text-[14px] text-white text-center opacity-100 [&.hidden-btn]:opacity-0 hidden-btn',
            )}
            style={{ ...posStyle, position: 'absolute' }}
            onMouseEnter={() => {
              isHoverLockRef.current = true
              clear()
              showFloatBtn()
            }}
            onMouseLeave={() => {
              isHoverLockRef.current = false
            }}
          >
            <div className="fc-floatbar-inner">
              <button
                type="button"
                className="start-pip-btn fc-float-button"
                aria-label="打开浮幕小窗"
                title="打开浮幕小窗"
                onClick={(e) => {
                  e.stopPropagation()
                  handleStartPIP()
                }}
              >
                <img
                  className="wh-[16px]"
                  width={16}
                  height={16}
                  alt=""
                  src={
                    isPluginEnv
                      ? `${Browser.runtime.getURL('/assets/icon.png')}`
                      : icon
                  }
                />
              </button>
              <button
                type="button"
                className="setting-btn fc-float-button"
                aria-label="打开浮幕设置"
                title="打开浮幕设置"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()

                  isLockRef.current = true
                  clear()
                  showFloatBtn()
                  setTimeout(() => {
                    isLockRef.current = false
                  }, 500)

                  handleOpenSetting()
                }}
              >
                <SettingOutlined width={16} height={16} />
              </button>
            </div>
          </div>
          {/* </DraggerContainer> */}
        </AppRoot>,
        container,
      )}
    </>
  )
}

export default observer(FloatButton)
