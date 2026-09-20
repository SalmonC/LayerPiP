import { isMultiVideoPane, restrictPane } from '@root/core/MultiVideo/pane'
import { onExtLoaded } from './utils'

if (isMultiVideoPane()) restrictPane()
else
  onExtLoaded(({ extBaseUrl }) => {
    console.log(`⚡ run inject-all-frames-top script, url: ${location.href}`)
    ;(async () => {
      await import(extBaseUrl + 'inject-all-frames-top.js').then((m) => m.run())
    })().catch(console.error)
  })
