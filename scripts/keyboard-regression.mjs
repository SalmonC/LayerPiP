import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const fixtureSource = String.raw`
import configStore from './src/store/config'
import { eventBus, PlayerEvent } from './src/core/event'
import { KeyBinding } from './src/core/KeyBinding'
import { shouldReturnFocusToPlayer } from './src/components/VideoPlayerV2/playerFocus'

const waitForTurn = () => new Promise((resolve) => setTimeout(resolve, 0))
const watchedEvents = [
  PlayerEvent.command_playToggle,
  PlayerEvent.command_rewind,
  PlayerEvent.command_forward,
  PlayerEvent.command_pressSpeedMode,
  PlayerEvent.command_pressSpeedMode_release,
]
const keyboardEvent = (type, code) =>
  new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    code,
    key: code === 'Space' ? ' ' : code,
  })
const dispatchKey = (target, type, code) =>
  target.dispatchEvent(keyboardEvent(type, code))
const countEvent = (events, event) =>
  events.filter((current) => current === event).length
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

let state

async function setup() {
  const events = []
  const unlistenEvents = watchedEvents.map((event) =>
    eventBus.on2(event, () => events.push(event)),
  )
  const shortcutKeys = [
    'shortcut_playToggle',
    'shortcut_rewind',
    'shortcut_forward',
    'shortcut_pressSpeedMode',
  ]
  const originalShortcuts = Object.fromEntries(
    shortcutKeys.map((key) => [key, configStore[key]]),
  )
  const deterministicShortcuts = {
    shortcut_playToggle: ['Space'],
    shortcut_rewind: ['←'],
    shortcut_forward: ['→', '(keyup)'],
    shortcut_pressSpeedMode: ['→', '(press)'],
  }
  shortcutKeys.forEach((key) => {
    configStore[key] = deterministicShortcuts[key]
  })

  const binding = new KeyBinding()
  binding.updateKeydownWindow(window)
  await waitForTurn()

  // A malformed persisted shortcut must use its declared default at runtime.
  const savedPlayToggle = configStore.shortcut_playToggle
  configStore.shortcut_playToggle = null
  await waitForTurn()
  const malformedBefore = countEvent(events, PlayerEvent.command_playToggle)
  dispatchKey(document.body, 'keydown', 'Space')
  dispatchKey(document.body, 'keyup', 'Space')
  assert(
    countEvent(events, PlayerEvent.command_playToggle) === malformedBefore + 1,
    'malformed persisted Space shortcut was not replaced by its default',
  )
  configStore.shortcut_playToggle = savedPlayToggle
  await waitForTurn()

  const frame = document.createElement('iframe')
  frame.id = 'keyboard-regression-frame'
  frame.srcdoc =
    '<!doctype html>' +
    '<body>' +
    '<input id="text-input" />' +
    '<textarea id="text-area"></textarea>' +
    '<select id="select"><option>one</option><option>two</option></select>' +
    '<input id="range" type="range" />' +
    '<div id="editable" contenteditable="true"></div>' +
    '<div id="player-root" tabindex="-1">' +
    '<button id="player-button" type="button">Player button</button>' +
    '</div>' +
    '</body>'
  document.body.append(frame)
  await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
  const frameWindow = frame.contentWindow
  const frameDocument = frameWindow.document
  const migratedVideo = document.createElement('video')
  migratedVideo.id = 'migrated-video'
  migratedVideo.tabIndex = 0
  document.body.append(migratedVideo)
  frameDocument.body.append(migratedVideo)
  assert(
    migratedVideo.ownerDocument === frameDocument,
    'fixture failed to migrate the video into the second document',
  )
  let buttonClicks = 0
  const playerRoot = frameDocument.querySelector('#player-root')
  playerRoot.addEventListener('pointerup', (event) => {
    if (shouldReturnFocusToPlayer(event.target)) playerRoot.focus()
  })
  frameDocument
    .querySelector('#player-button')
    .addEventListener('click', () => buttonClicks++)

  // Adoption changes ownerDocument/defaultView; only the migrated window may respond.
  binding.updateKeydownWindow(migratedVideo.ownerDocument.defaultView)
  await waitForTurn()
  const oldWindowBefore = events.length
  dispatchKey(window, 'keydown', 'Space')
  dispatchKey(window, 'keyup', 'Space')
  assert(events.length === oldWindowBefore, 'old window still handled a shortcut')

  const editableSelectors = [
    '#text-input',
    '#text-area',
    '#select',
    '#range',
    '#editable',
  ]
  for (const selector of editableSelectors) {
    const target = frameDocument.querySelector(selector)
    const before = events.length
    dispatchKey(target, 'keydown', 'Space')
    dispatchKey(target, 'keyup', 'Space')
    dispatchKey(target, 'keydown', 'ArrowRight')
    dispatchKey(target, 'keyup', 'ArrowRight')
    assert(events.length === before, selector + ' was hijacked by the player')
  }

  state = {
    binding,
    buttonClicks: () => buttonClicks,
    countsBeforeButton: Object.fromEntries(
      watchedEvents.map((event) => [event, countEvent(events, event)]),
    ),
    events,
    eventsBeforeButton: events.length,
    frame,
    frameWindow,
    migratedVideo,
    playerRoot,
    originalShortcuts,
    unlistenEvents,
  }
  return {
    migratedOwnerWindow: true,
    editableControlsProtected: true,
    eventsBeforeButton: events.length,
  }
}

async function finish() {
  const {
    binding,
    buttonClicks,
    events,
    frame,
    frameWindow,
    migratedVideo,
    originalShortcuts,
    unlistenEvents,
  } = state
  const playToggle = PlayerEvent.command_playToggle
  const rewind = PlayerEvent.command_rewind
  const pressSpeedMode = PlayerEvent.command_pressSpeedMode
  const releaseSpeedMode = PlayerEvent.command_pressSpeedMode_release

  assert(
    buttonClicks() === 2,
    'focused player button did not receive native and pointer activation',
  )
  assert(
    events.length === state.eventsBeforeButton + 2,
    'focused player button caused a duplicate global Space command',
  )
  assert(
    countEvent(events, rewind) === state.countsBeforeButton[rewind] + 1,
    'ArrowLeft after a pointer button click did not reach the player',
  )
  assert(
    countEvent(events, playToggle) === state.countsBeforeButton[playToggle] + 1,
    'Space on the migrated video did not reach its owner window',
  )

  const beforePress = countEvent(events, pressSpeedMode)
  const beforeRelease = countEvent(events, releaseSpeedMode)
  for (let index = 0; index < 4; index++)
    dispatchKey(migratedVideo, 'keydown', 'ArrowRight')
  assert(
    countEvent(events, pressSpeedMode) === beforePress + 1,
    'long-press shortcut did not trigger after repeated keydown',
  )
  frameWindow.dispatchEvent(new Event('blur'))
  assert(
    countEvent(events, releaseSpeedMode) === beforeRelease + 1,
    'window blur did not release long-press state',
  )
  frameWindow.dispatchEvent(new Event('blur'))
  assert(
    countEvent(events, releaseSpeedMode) === beforeRelease + 1,
    'window blur released long-press state more than once',
  )
  const beforePostBlurPress = countEvent(events, pressSpeedMode)
  dispatchKey(migratedVideo, 'keydown', 'ArrowRight')
  assert(
    countEvent(events, pressSpeedMode) === beforePostBlurPress,
    'a single ArrowRight after blur reused the previous long-press count',
  )
  dispatchKey(migratedVideo, 'keyup', 'ArrowRight')

  const beforeResetRelease = countEvent(events, releaseSpeedMode)
  for (let index = 0; index < 4; index++)
    dispatchKey(migratedVideo, 'keydown', 'ArrowRight')
  binding.reset()
  assert(
    countEvent(events, releaseSpeedMode) === beforeResetRelease + 1,
    'reset cleared long-press state without emitting release',
  )

  // Rebinding the same migrated window must replace the old listener exactly once.
  binding.updateKeydownWindow(frameWindow)
  binding.updateKeydownWindow(frameWindow)
  await waitForTurn()
  const beforeReopen = countEvent(events, playToggle)
  dispatchKey(migratedVideo, 'keydown', 'Space')
  dispatchKey(migratedVideo, 'keyup', 'Space')
  assert(
    countEvent(events, playToggle) === beforeReopen + 1,
    'repeated open/close left duplicate or missing keyboard listeners',
  )

  binding.unload()
  unlistenEvents.forEach((unlisten) => unlisten())
  Object.entries(originalShortcuts).forEach(([key, value]) => {
    configStore[key] = value
  })
  frame.remove()
  return {
    focusedButtonNativeSpace: true,
    migratedVideoSpace: true,
    blurAndResetRelease: true,
    repeatedRebindSingleListener: true,
  }
}

window.keyboardRegressionSetup = setup
window.keyboardRegressionCheckPointer = () => {
  const { buttonClicks, events, eventsBeforeButton, frameWindow, playerRoot } = state
  assert(buttonClicks() === 2, 'pointer click did not activate player button')
  assert(
    frameWindow.document.activeElement === playerRoot,
    'pointer click did not return focus to the player root',
  )
  assert(
    events.length === eventsBeforeButton,
    'pointer focused button caused a duplicate global shortcut',
  )
  return { pointerFocusReturned: true, buttonShortcutSuppressed: true }
}
window.keyboardRegressionFinish = finish
`

const tempDir = await fs.mkdtemp(
  path.join(os.tmpdir(), 'layerpip-keyboard-regression-'),
)
const fixturePath = path.join(tempDir, 'keyboard-fixture.js')
let browser

try {
  await build({
    stdin: {
      contents: fixtureSource,
      loader: 'ts',
      resolveDir: projectRoot,
      sourcefile: 'keyboard-regression.fixture.ts',
    },
    bundle: true,
    format: 'iife',
    logLevel: 'silent',
    outfile: fixturePath,
    platform: 'browser',
    target: 'es2020',
    tsconfig: path.join(projectRoot, 'tsconfig.json'),
  })

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.route('**/*', async (route) => {
    const requestUrl = route.request().url()
    if (requestUrl.endsWith('/keyboard-fixture.js')) {
      await route.fulfill({
        body: await fs.readFile(fixturePath),
        contentType: 'application/javascript',
      })
      return
    }
    if (requestUrl === 'https://www.bilibili.com/') {
      await route.fulfill({
        body: `<!doctype html>
          <script>
            const storageArea = {
              onChanged: { addListener() {} },
              get(_key, callback) { callback({}) },
              set(_value, callback) { callback?.() },
            }
            window.chrome = {
              runtime: {
                id: 'keyboard-regression',
                getURL: (path) => path,
                connect: () => ({
                  onMessage: { addListener() {} },
                  onDisconnect: { addListener() {} },
                  postMessage() {},
                }),
              },
              storage: { local: storageArea, sync: storageArea },
            }
          </script>
          <script src="/keyboard-fixture.js"></script>`,
        contentType: 'text/html',
      })
      return
    }
    await route.fulfill({ status: 404, body: '' })
  })
  await page.goto('https://www.bilibili.com/')
  try {
    await page.waitForFunction(
      () => typeof window.keyboardRegressionSetup === 'function',
    )
  } catch (error) {
    console.error(JSON.stringify({ pageErrors, html: await page.content() }))
    throw error
  }
  const setupResult = await page.evaluate(() =>
    window.keyboardRegressionSetup(),
  )
  const frame = page
    .frames()
    .find((candidate) => candidate !== page.mainFrame())
  if (!frame) throw new Error('keyboard regression iframe was not created')
  await frame.locator('#player-button').focus()
  await page.keyboard.press('Space')
  await frame.locator('#player-button').click()
  await page.waitForTimeout(0)
  const pointerResult = await page.evaluate(() =>
    window.keyboardRegressionCheckPointer(),
  )
  await page.keyboard.press('ArrowLeft')
  await frame.locator('#migrated-video').focus()
  await page.keyboard.press('Space')
  const finishResult = await page.evaluate(() =>
    window.keyboardRegressionFinish(),
  )
  if (pageErrors.length) throw new Error(pageErrors.join('\n'))
  const result = { setupResult, pointerResult, finishResult }
  console.log(JSON.stringify(result))
} finally {
  await browser?.close()
  await fs.rm(tempDir, { recursive: true, force: true })
}
