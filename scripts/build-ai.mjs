import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { verifyModel, modelManifest } from './prepare-ai-model.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const hfDist = path.dirname(require.resolve('@huggingface/transformers'))
const hfRequire = createRequire(path.join(hfDist, 'transformers.node.cjs'))
const ortDist = path.dirname(hfRequire.resolve('onnxruntime-web'))
const out = path.join(root, 'dist')
await verifyModel()
await build({
  absWorkingDir: root,
  entryPoints: { 'ai-frame': 'src/ai/frame.ts', 'ai-worker': 'src/ai/worker.ts' },
  outdir: out,
  bundle: true, format: 'esm', platform: 'browser', target: 'chrome120',
  minify: true, splitting: true,
  alias: { 'onnxruntime-web': path.join(ortDist, 'ort.wasm.min.mjs') },
  logLevel: 'warning',
})
await fs.copyFile(path.join(root, 'src/ai/frame.html'), path.join(out, 'ai-frame.html'))
const runtime = path.join(out, 'assets/ai-runtime')
await fs.mkdir(runtime, { recursive: true })
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'])
  await fs.copyFile(path.join(ortDist, name), path.join(runtime, name))
await fs.copyFile(path.join(hfDist, '../LICENSE'), path.join(runtime, 'TRANSFORMERS-LICENSE'))
await fs.writeFile(path.join(out, 'assets/ai-models/manifest.json'), JSON.stringify(modelManifest, null, 2))
console.log('Local AI worker, model and WASM resources packaged.')
