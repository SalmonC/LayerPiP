import { installNativeMediaSession } from '../inject/nativeMediaSession'
import { onExtLoaded } from './utils'

if (
  location.hostname === 'www.bilibili.com' ||
  location.hostname === 'live.bilibili.com'
) {
  installNativeMediaSession(window)
}

onExtLoaded(({ extBaseUrl }) => {
  console.log(`⚡ run inject-top script, url: ${location.href}`)
  ;(async () => {
    await import(extBaseUrl + 'inject-top.js').then((m) => m.run())
  })().catch(console.error)
})
