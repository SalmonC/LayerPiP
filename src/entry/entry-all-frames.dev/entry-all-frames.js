;(function () {
  'use strict'
  ;(async () => {
    if (document.documentElement.getAttribute('layerpip-disable')) return

    await chrome.storage.local.get('LAYERPIP_LOCALE_V1').then((res) => {
      if (!res['LAYERPIP_LOCALE_V1']) return
      window.__LOCALE = res['LAYERPIP_LOCALE_V1']
    })
    await Promise.all([
      import('./react-refresh.js'),
      import('http://localhost:4196/@vite/client'),
      // fetch('http://localhost:4196/src/background/index.ts'),
      import(`http://localhost:4196/src/contents/main.ts`),
    ])
  })().catch(console.error)
})()
