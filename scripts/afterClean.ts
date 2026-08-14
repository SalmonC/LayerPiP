import fs from 'fs-extra'
import { manifest } from '../src/manifest'
import { outDir } from './shared.tsup'
import { pr } from './utils.mjs'

fs.copyFileSync(pr('../LICENSE'), pr(outDir, './LICENSE'))
fs.copyFileSync(
  pr('../NETWORK_SUBTITLE_BUILD.md'),
  pr(outDir, './NETWORK_SUBTITLE_BUILD.md'),
)

manifest.web_accessible_resources = [
  {
    resources: fs.readdirSync(pr(outDir)),
    matches: ['<all_urls>'],
  },
  {
    resources: ['assets/icon.png'],
    matches: ['<all_urls>'],
  },
]
fs.writeJSONSync(pr(outDir, './manifest.json'), manifest, { spaces: 2 })
