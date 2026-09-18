import configStore from '@root/store/config'
import config_shortcut, {
  disableRender,
  formatKeys,
} from '@root/store/config/shortcut'
import { Key, keyCodeToCode, keyToKeyCodeMap, KeyType } from '@root/types/key'
import { autorun } from 'mobx'
import { addEventListener } from '@root/utils'
import { eventBus, PlayerEvent } from './event'
import { shortcutKeys } from './shortcutKeys'

const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, [contenteditable]:not([contenteditable="false"])'
type ShortcutConfigName = Exclude<keyof typeof config_shortcut, 'shortcut_desc'>
type ShortcutConfigs = Partial<Record<ShortcutConfigName, Key[]>>

export const isInteractiveTarget = (target: EventTarget | null | undefined) => {
  if (!target) return false

  if (
    typeof (target as HTMLElement).closest === 'function' &&
    (target as HTMLElement).closest(INTERACTIVE_SELECTOR)
  )
    return true

  // Replacer/full-page proxy events carry a small serializable target object
  // instead of the original DOM node, so `closest()` is unavailable there.
  const serializableTarget = target as {
    tagName?: unknown
    contentEditable?: unknown
    isContentEditable?: unknown
  }
  const tagName =
    typeof serializableTarget.tagName === 'string'
      ? serializableTarget.tagName.toUpperCase()
      : ''
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tagName)) return true

  return (
    serializableTarget.isContentEditable === true ||
    serializableTarget.contentEditable === '' ||
    serializableTarget.contentEditable === 'true' ||
    serializableTarget.contentEditable === 'plaintext-only'
  )
}

export const isInteractiveEvent = (event: KeyboardEvent) => {
  const eventPath = event.composedPath?.()
  const targets = eventPath?.length ? eventPath : [event.target]
  return targets.some((target) => isInteractiveTarget(target))
}

const getEventKeyCode = (event: KeyboardEvent) => {
  const keyCode = event.keyCode || (event as any).which
  if (keyCode) return keyCode as number

  const code = event.code as keyof typeof keyToKeyCodeMap
  if (code && code in keyToKeyCodeMap) return keyToKeyCodeMap[code]

  const key = event.key?.length === 1 ? event.key.toUpperCase() : event.key
  if (key && key in keyToKeyCodeMap)
    return keyToKeyCodeMap[key as keyof typeof keyToKeyCodeMap]

  return undefined
}

// const getShortcutConfigs = onceCall(() =>
//   Object.fromEntries(
//     Object.entries(configStore)
//       .map(([key, val]) =>
//         key.startsWith('shortcut_') ? [key, val] : undefined,
//       )
//       .filter((v) => !!v),
//   ),
// )

export const getShortcutConfigs = (): ShortcutConfigs => {
  const keys = Object.entries(config_shortcut)
    .filter(
      ([key, val]) =>
        (val as any).render !== disableRender && key !== 'shortcut_desc',
    )
    .map(([key]) => key)

  const configs: ShortcutConfigs = {}
  keys.forEach((key) => {
    const configKey = key as ShortcutConfigName
    configs[configKey] = shortcutKeys(
      (configStore as any)[key],
      (config_shortcut as any)[key]?.defaultValue,
    ) as Key[]
  })
  return configs
}

export const getShortcutAllConfigs = () => {
  const keys = Object.entries(config_shortcut).map(([key]) => key)

  return Object.fromEntries(
    keys.map((key) => [key, (configStore as any)[key]]),
  ) as Pick<typeof configStore, keyof typeof config_shortcut>
}

export class KeyBinding {
  keydownWindow: Window = window

  constructor() {}

  protected configKeyMap: Record<string, () => void> = {}
  protected pressingKeyMap: Record<string, number> = {}
  protected triggeredPressingKeyMap: Record<string, boolean> = {}
  protected releasePressingKeyFnMap: Record<string, () => void> = {}

  protected unListens: (() => void)[] = []
  protected onKeydownFns = new Set<(e: KeyboardEvent) => void>()
  protected onKeyupFns = new Set<(e: KeyboardEvent) => void>()

  protected pressingConstant = 3

  updateKeydownWindow(keydownWindow: Window) {
    this.reset()

    this.keydownWindow = keydownWindow
    this.init()
  }

  isLockedMode = false
  lockedKey = ''

  init() {
    this.reset()
    this.unListens.push(
      addEventListener(this.keydownWindow, (keydownWindow) => {
        keydownWindow.addEventListener('keydown', (e) => {
          this.handleKeyDown(e)
        })
        keydownWindow.addEventListener(
          'layerpip-player-keydown' as any,
          (e) => {
            this.handleCustomKeyDown(e)
          },
        )
        keydownWindow.addEventListener('keyup', (e) => {
          this.handleKeyUp(e)
        })
        keydownWindow.addEventListener('layerpip-player-keyup' as any, (e) => {
          this.handleCustomKeyUp(e)
        })
        keydownWindow.addEventListener('blur', () => {
          this.releasePressedKeys()
        })
      }),
    )

    this.unListens.push(
      autorun(() => {
        this.configKeyMap = {}
        const configs = getShortcutConfigs()
        Object.entries(configs).forEach(([name, _keys]) => {
          const keys = shortcutKeys(
            _keys,
            (config_shortcut as any)[name]?.defaultValue,
          ) as Key[]
          if (!keys.length) return
          const key = (keys as string[]).join('+')
          const command = name.replace('shortcut_', 'command_') as any

          if (command === PlayerEvent.command_lockedModeToggle) {
            this.lockedKey = key
            this.configKeyMap[key] = () => {
              this.isLockedMode = !this.isLockedMode
              eventBus.emit(command)
            }
          } else {
            this.configKeyMap[key] = () => {
              eventBus.emit(command)
            }
          }

          if (keys[keys.length - 1] === KeyType.press) {
            this.configKeyMap[`${key}_release`] = () => {
              const command = name.replace('shortcut_', 'command_') as any
              console.log('command', `${command}_release`)
              eventBus.emit(`${command}_release` as any)
            }
          }
        })

        console.log('configKeyMap', this.configKeyMap)
      }),
    )
  }

  reset() {
    this.releasePressedKeys()
    this.unListens.forEach((fn) => fn())
    this.unListens.length = 0
    this.pressingKeyMap = {}
    this.triggeredPressingKeyMap = {}
    this.releasePressingKeyFnMap = {}
    this.configKeyMap = {}
    this.lockedKey = ''
  }

  private releasePressedKeys() {
    Object.entries(this.releasePressingKeyFnMap).forEach(
      ([mapKey, release]) => {
        try {
          release()
        } catch (error) {
          console.error('failed to release pressed shortcut', error)
        } finally {
          delete this.releasePressingKeyFnMap[mapKey]
        }
      },
    )
    this.pressingKeyMap = {}
    this.triggeredPressingKeyMap = {}
  }

  unload() {
    this.isLockedMode = false
    this.reset()
  }

  protected handleKeyDown(e: KeyboardEvent) {
    if (isInteractiveEvent(e)) return
    e.stopPropagation()

    const { shiftKey, ctrlKey, altKey } = e
    const keyCode = getEventKeyCode(e)
    // if (key.length === 1) key = key.toLowerCase()
    const actions: Key[] = []

    if (shiftKey && keyCode !== keyToKeyCodeMap.Shift) actions.push('Shift')
    if (ctrlKey && keyCode !== keyToKeyCodeMap.Ctrl) actions.push('Ctrl')
    if (altKey && keyCode !== keyToKeyCodeMap.Alt) actions.push('Alt')

    if (keyCode) actions.push(...formatKeys((keyCodeToCode as any)[keyCode]))

    const mapKey = actions.join('+')

    if (this.isLockedMode && mapKey !== this.lockedKey) {
      e.preventDefault()
      return
    }

    // 强制keyup、keypress的都阻止默认行为
    // 例如→键，现在有长按触发模式，所以默认没有down行为，只有up行为
    // 会导致网页的一些默认为down滚动网页触发了
    if (
      this.configKeyMap[`${mapKey}+${KeyType.keydown}`] ||
      this.configKeyMap[`${mapKey}+${KeyType.press}`]
    ) {
      e.preventDefault()
    }

    if (this.triggeredPressingKeyMap[mapKey]) {
      return
    }
    // pressing
    if (
      this.pressingKeyMap[mapKey] >= this.pressingConstant &&
      this.configKeyMap[`${mapKey}+${KeyType.press}`] &&
      !this.triggeredPressingKeyMap[mapKey]
    ) {
      e.preventDefault()
      const fn = this.configKeyMap[`${mapKey}+${KeyType.press}`]
      fn()
      this.releasePressingKeyFnMap[mapKey] = () => {
        this.configKeyMap[`${mapKey}+${KeyType.press}_release`]?.()
        delete this.triggeredPressingKeyMap[mapKey]
      }
      this.triggeredPressingKeyMap[mapKey] = true
    }
    // +keydown
    else if (this.configKeyMap[`${mapKey}+${KeyType.keydown}`]) {
      e.preventDefault()
      this.configKeyMap[`${mapKey}+${KeyType.keydown}`]()
    }
    // +keydown default 格式
    else if (this.configKeyMap[mapKey]) {
      e.preventDefault()
      this.configKeyMap[mapKey]()
    } else {
      this.onKeydownFns.forEach((fn) => fn(e))
    }

    this.pressingKeyMap[mapKey] ??= 0
    this.pressingKeyMap[mapKey]++
  }
  protected handleKeyUp(e: KeyboardEvent) {
    if (isInteractiveEvent(e)) return
    e.stopPropagation()

    const { shiftKey, ctrlKey, altKey } = e
    const keyCode = getEventKeyCode(e)
    // if (key.length === 1) key = key.toLowerCase()
    const actions: Key[] = []

    if (shiftKey && keyCode !== keyToKeyCodeMap.Shift) actions.push('Shift')
    if (ctrlKey && keyCode !== keyToKeyCodeMap.Ctrl) actions.push('Ctrl')
    if (altKey && keyCode !== keyToKeyCodeMap.Alt) actions.push('Alt')

    if (keyCode) actions.push(...formatKeys((keyCodeToCode as any)[keyCode]))

    const mapKey = actions.join('+')
    if (this.isLockedMode && mapKey !== this.lockedKey) {
      e.preventDefault()
      return
    }

    if (this.releasePressingKeyFnMap[mapKey]) {
      e.preventDefault()
      this.releasePressingKeyFnMap[mapKey]()
      delete this.releasePressingKeyFnMap[mapKey]
    }

    if (
      this.configKeyMap[`${mapKey}+${KeyType.keyup}`] &&
      this.pressingKeyMap[mapKey] < this.pressingConstant
    ) {
      e.preventDefault()
      this.configKeyMap[`${mapKey}+${KeyType.keyup}`]()
    } else {
      this.onKeyupFns.forEach((fn) => fn(e))
    }

    delete this.pressingKeyMap[mapKey]
  }
  // 这是给replacer模式监听的，keydown keyup已经被阻止了，通过一层代理转发和监听
  protected handleCustomKeyDown(e: KeyboardEvent) {
    const detail = e.detail
    this.handleKeyDown.bind(this)(detail as any)
  }
  protected handleCustomKeyUp(e: KeyboardEvent) {
    const detail = e.detail
    this.handleKeyUp.bind(this)(detail as any)
  }

  onKeydown(fn: (e: KeyboardEvent) => void) {
    this.onKeydownFns.add(fn)
    return () => {
      this.onKeydownFns.delete(fn)
    }
  }
  onKeyup(fn: (e: KeyboardEvent) => void) {
    this.onKeyupFns.add(fn)
    return () => {
      this.onKeyupFns.delete(fn)
    }
  }
}
