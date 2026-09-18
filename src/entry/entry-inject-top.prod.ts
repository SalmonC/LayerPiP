import { installNativeMediaSession } from '../inject/nativeMediaSession'
import { run } from '../contents/inject-top'
import { onExtLoaded } from './utils'

if (
  location.hostname === 'www.bilibili.com' ||
  location.hostname === 'live.bilibili.com'
) {
  installNativeMediaSession(window)
}

onExtLoaded(() => {
  console.log(`⚡ run inject-top script, url: ${location.href}`)
  run()
})
