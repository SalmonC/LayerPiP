import { isMultiVideoPane, restrictPane } from '@root/core/MultiVideo/pane'
import { run } from '../contents/inject-all-frames-top'
import { onExtLoaded } from './utils'

if (isMultiVideoPane()) restrictPane()
else
  onExtLoaded(() => {
    console.log(`⚡ run inject-all-frames-top script, url: ${location.href}`)
    run()
  })
