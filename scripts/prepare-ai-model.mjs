// Developer/build preparation only. Installed extensions never run this downloader.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const modelManifest = JSON.parse(await fs.readFile(path.join(root, 'scripts/ai-model-manifest.json'), 'utf8'))
export const modelDirectory = path.join(root, 'assets/ai-models/whisper-base')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function verifyModel(directory = modelDirectory) {
  for (const file of modelManifest.files) {
    const bytes = await fs.readFile(path.join(directory, file.path)).catch(() => null)
    if (!bytes || bytes.length !== file.bytes || hash(bytes) !== file.sha256)
      throw Error(`AI model missing or changed: ${file.path}. Run node scripts/prepare-ai-model.mjs before building.`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const file of modelManifest.files) {
    const target = path.join(modelDirectory, file.path)
    const existing = await fs.readFile(target).catch(() => null)
    if (existing) {
      if (existing.length === file.bytes && hash(existing) === file.sha256) continue
      throw Error(`Refusing to overwrite unexpected model file: ${file.path}; preserve it before retrying.`)
    }
    const url = `https://huggingface.co/${modelManifest.repository}/resolve/${modelManifest.revision}/${file.path}`
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
    if (!response.ok) throw Error(`Model download failed (${response.status}): ${file.path}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw Error(`Model integrity mismatch: ${file.path}`)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes, { flag: 'wx' })
    console.log(`Verified ${file.path}`)
  }
  await verifyModel()
  console.log('Bundled Whisper Base q8 model verified; no end-user download is required.')
}
