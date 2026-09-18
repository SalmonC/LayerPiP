import Trigger, { TriggerProps, type TriggerRef } from '@rc-component/trigger'
import { useAppRootElRef } from '@root/hook/useAppRootEl'
import {
  useEffect,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
  type ReactNode,
} from 'react'

type Props = PropsWithChildren<{
  menuRender: (close: () => void) => ReactNode
  playerMenu?: boolean
}> &
  Omit<TriggerProps, 'popup'>

// Player-only coordination; legacy callers retain their original trigger behavior.
const Dropdown: FC<Props> = ({ playerMenu = false, menuRender, ...props }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<TriggerRef>(null)
  const [isVisible, setVisible] = useState(false)
  const keyboardOpen = useRef(false)
  const rootRef = useAppRootElRef()
  const player = () =>
    containerRef.current?.closest<HTMLElement>('.video-player-v2')
  const close = () => {
    setVisible(false)
    if (playerMenu) player()?.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (!playerMenu || !isVisible) return
    const root = player()
    const doc = containerRef.current?.ownerDocument
    if (!root || !doc) return
    const opened = new CustomEvent('layerpip-menu-open', {
      detail: containerRef.current,
    })
    root.dispatchEvent(opened)
    root.dataset.menuOpen = 'true'
    // 菜单锚在触发按钮上方，所以可用高度就是「按钮上边缘到播放器顶部」的距离。
    // 原来固定用 `clientHeight - 60`，在小窗里会白白浪费一截空间。
    const size = () => {
      const triggerTop = containerRef.current?.getBoundingClientRect().top
      const available =
        typeof triggerTop === 'number' && triggerTop > 0
          ? triggerTop - 12
          : root.clientHeight - 60
      const next = `${Math.max(64, Math.floor(available))}px`
      // 值没变就不要重设：本函数会被下面观察弹层尺寸的 ResizeObserver 调用，
      // 而设置 max-height 又会改变弹层尺寸，必须避免自激循环。
      if (root.style.getPropertyValue('--fc-menu-height') !== next)
        root.style.setProperty('--fc-menu-height', next)
    }
    size()
    const resize = new ResizeObserver(size)
    resize.observe(root)
    // 弹层自身高度会变（例如弹幕菜单展开「高级设置」）。rc-trigger 不会因此重新对齐，
    // 于是新增的选项可能落到可视区之外，看起来「展开了却看不见」，收起时位置也不回收。
    // 这里监听弹层尺寸并主动重排。
    const align = new ResizeObserver(() => {
      size()
      triggerRef.current?.forceAlign()
    })
    if (popupRef.current) align.observe(popupRef.current)
    const other = (event: Event) => {
      if ((event as CustomEvent).detail !== containerRef.current)
        setVisible(false)
    }
    const dismiss = (event: PointerEvent) => {
      const path = event.composedPath()
      if (
        !path.includes(containerRef.current!) &&
        !path.includes(popupRef.current!)
      )
        setVisible(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    const blur = () => setVisible(false)
    root.addEventListener('layerpip-menu-open', other)
    doc.addEventListener('pointerdown', dismiss, true)
    doc.addEventListener('keydown', escape, true)
    doc.defaultView?.addEventListener('blur', blur)
    return () => {
      resize.disconnect()
      align.disconnect()
      root.removeEventListener('layerpip-menu-open', other)
      doc.removeEventListener('pointerdown', dismiss, true)
      doc.removeEventListener('keydown', escape, true)
      doc.defaultView?.removeEventListener('blur', blur)
      // Another menu may already own the lock when this one closes.
      queueMicrotask(() => {
        if (!root.querySelector('[data-player-menu-visible="true"]'))
          delete root.dataset.menuOpen
      })
    }
  }, [isVisible, playerMenu])
  return (
    <Trigger
      ref={triggerRef}
      action={['hover', 'click']}
      mouseEnterDelay={0.12}
      mouseLeaveDelay={0.2}
      popupVisible={isVisible}
      onOpenChange={setVisible}
      afterPopupVisibleChange={(visible) => {
        if (visible && keyboardOpen.current) {
          popupRef.current
            ?.querySelector<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
            )
            ?.focus()
          keyboardOpen.current = false
        }
      }}
      popupAlign={{
        points: playerMenu ? ['br', 'tr'] : ['bl', 'tl'],
        offset: playerMenu ? [0, -8] : [-4, -6],
        overflow: { adjustX: 1, adjustY: 1 },
      }}
      popupStyle={playerMenu ? { zIndex: 30 } : undefined}
      getPopupContainer={(node) =>
        playerMenu
          ? (player() ?? node.ownerDocument.body)
          : (props.getPopupContainer?.(node) ??
            rootRef.current ??
            node.ownerDocument.body)
      }
      {...props}
      popup={() => (
        <div
          ref={popupRef}
          className={playerMenu ? 'fc-player-popover' : undefined}
          onPointerUp={
            playerMenu ? (event) => event.stopPropagation() : undefined
          }
          onKeyDown={
            playerMenu
              ? (event) => {
                  event.stopPropagation()
                  if (event.key === 'Tab') {
                    const items = Array.from(
                      event.currentTarget.querySelectorAll<HTMLElement>(
                        'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
                      ),
                    ).filter((el) => el.getClientRects().length)
                    if (!items.length) return
                    if (event.shiftKey && event.target === items[0]) {
                      event.preventDefault()
                      items[items.length - 1].focus()
                    } else if (
                      !event.shiftKey &&
                      event.target === items[items.length - 1]
                    ) {
                      event.preventDefault()
                      items[0].focus()
                    }
                  }
                }
              : undefined
          }
        >
          {menuRender(close)}
        </div>
      )}
    >
      <div
        ref={containerRef}
        data-player-menu-visible={playerMenu && isVisible ? 'true' : undefined}
        onPointerUp={
          playerMenu ? (event) => event.stopPropagation() : undefined
        }
        onKeyDown={
          playerMenu
            ? (event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  event.stopPropagation()
                  keyboardOpen.current = true
                  setVisible(true)
                  containerRef.current?.ownerDocument.defaultView?.requestAnimationFrame(
                    () =>
                      popupRef.current
                        ?.querySelector<HTMLElement>('button, input, select')
                        ?.focus(),
                  )
                }
              }
            : undefined
        }
      >
        {props.children}
      </div>
    </Trigger>
  )
}
export default Dropdown
