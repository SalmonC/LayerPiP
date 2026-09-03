import { createHash } from 'node:crypto'
import fs from 'fs-extra'
import { manifest } from '../src/manifest'
import { outDir } from './shared.tsup'
import { pr } from './utils.mjs'

const EXPECTED_EXTENSION_ID = 'jnonlboihmjeahenhlbkjdijicakfnjj'

function getExtensionId(publicKey: string) {
  return createHash('sha256')
    .update(Buffer.from(publicKey, 'base64'))
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (char) =>
      String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(char, 16)),
    )
}

if (!manifest.key || getExtensionId(manifest.key) !== EXPECTED_EXTENSION_ID) {
  throw new Error('LayerPiP manifest key does not match its fixed extension ID')
}

fs.copyFileSync(pr('../LICENSE'), pr(outDir, './LICENSE'))
fs.copyFileSync(pr('../LAYERPIP.md'), pr(outDir, './LAYERPIP.md'))

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
