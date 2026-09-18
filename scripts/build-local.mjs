import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'dist')
const delivery = path.join(root, '.delivery')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version
const expectedId = 'jnonlboihmjeahenhlbkjdijicakfnjj'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
fs.mkdirSync(delivery, { recursive: true })
const lock = path.join(delivery, 'build.lock')
fs.mkdirSync(lock) // Concurrent builds must not replace each other's output.

// `dist 2`, `dist 3`, … are retained rollback artifacts (tens of MB each), not development
// source. Match them by pattern: a fixed list silently stops covering newly kept copies
// (`dist 4`, `dist 5`, …) and then every build copies and hashes them.
const excluded = new Set(['.git', '.delivery', 'dist', 'node_modules', '.DS_Store'])
const isExcluded = (name) => excluded.has(name) || /^dist \d+$/.test(name)
function inputs(dir = root, prefix = '') {
  const result = {}
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (isExcluded(item.name) || item.name.startsWith('metafile-')) continue
    const relative = path.join(prefix, item.name)
    const full = path.join(dir, item.name)
    if (item.isDirectory()) Object.assign(result, inputs(full, relative))
    else if (item.isFile()) result[relative] = createHash('sha256').update(fs.readFileSync(full)).digest('hex')
  }
  return result
}
function digest(dir) {
  const hash = createHash('sha256')
  function visit(folder, prefix = '') {
    for (const name of fs.readdirSync(folder).sort()) {
      const full = path.join(folder, name), relative = path.join(prefix, name)
      if (fs.statSync(full).isDirectory()) visit(full, relative)
      else hash.update(relative).update('\0').update(fs.readFileSync(full))
    }
  }
  visit(dir)
  return hash.digest('hex')
}

try {
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
    throw Error('dist must be a real directory, not a symlink')
  const baseline = inputs()
  const stage = path.join(delivery, `build-${version}-${stamp}`)
  fs.mkdirSync(stage)
  for (const item of fs.readdirSync(root)) {
    if (isExcluded(item)) continue
    fs.cpSync(path.join(root, item), path.join(stage, item), {
      recursive: true,
      filter: (source) => !isExcluded(path.basename(source)),
    })
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'dir')
  const run = (tool, args) => execFileSync(path.join(root, 'node_modules', '.bin', tool), args, {
    cwd: stage, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'inherit',
  })
  run('tsup', ['--config', 'scripts/prod.tsup.esm-chunks.ts', '--metafile'])
  run('tsup', ['--config', 'scripts/prod.tsup.iife.ts', '--metafile'])
  execFileSync(process.execPath, ['scripts/build-ai.mjs'], { cwd: stage, stdio: 'inherit' })
  run('tsx', ['scripts/afterClean.ts'])
  const output = path.join(stage, 'dist')
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')))
  const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + parseInt(char, 16)))
  if (id !== expectedId || manifest.version !== version) throw Error('Artifact identity/version mismatch')
  const required = [manifest.background.service_worker, manifest.action.default_popup,
    ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap((script) => script.js ?? []),
    `_locales/${manifest.default_locale}/messages.json`, 'main.js', 'popup.js', 'LICENSE',
    'ai-frame.html', 'ai-frame.js', 'ai-worker.js', 'assets/ai-runtime/ort-wasm-simd-threaded.wasm',
    'assets/ai-runtime/ort-wasm-simd-threaded.mjs', 'assets/ai-models/manifest.json']
  for (const file of required) {
    if (!fs.statSync(path.join(output, file)).isFile()) throw Error(`Missing artifact: ${file}`)
  }
  const { verifyModel } = await import('./prepare-ai-model.mjs')
  await verifyModel(path.join(output, 'assets/ai-models/whisper-base'))
  if (JSON.stringify(baseline) !== JSON.stringify(inputs())) throw Error('Source changed during build; dist was not replaced')
  const sha256 = digest(output)
  let rollback
  let rollbackSafetyCopy
  let rollbackSha256
  if (fs.existsSync(target)) {
    const previous = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json')))
    rollbackSha256 = digest(target)
    if (previous.version === version && rollbackSha256 !== sha256)
      throw Error('Changed artifact needs a new package.json version before delivery')
    // Preserve an independently verified copy before removing the canonical path.
    rollbackSafetyCopy = `safety-${previous.version}-${stamp}`
    fs.cpSync(target, path.join(delivery, rollbackSafetyCopy), { recursive: true, errorOnExist: true, force: false })
    if (digest(path.join(delivery, rollbackSafetyCopy)) !== rollbackSha256)
      throw Error('Pre-delivery rollback copy verification failed; dist was not replaced')
    rollback = `rollback-${previous.version}-${stamp}`
    fs.renameSync(target, path.join(delivery, rollback))
  }
  try {
    fs.renameSync(output, target)
    if (digest(target) !== sha256) throw Error('Delivered artifact hash mismatch')
    if (rollbackSafetyCopy && digest(path.join(delivery, rollbackSafetyCopy)) !== rollbackSha256)
      throw Error('Rollback safety copy no longer matches')
  } catch (error) {
    const recovery = [rollback, rollbackSafetyCopy].find((name) =>
      name && fs.existsSync(path.join(delivery, name)) && digest(path.join(delivery, name)) === rollbackSha256)
    if (rollback && !recovery)
      throw Error('Rollback copies unavailable; retained current dist for inspection instead of removing it', { cause: error })
    if (fs.existsSync(target)) fs.renameSync(target, path.join(delivery, `failed-${stamp}`))
    if (recovery) fs.cpSync(path.join(delivery, recovery), target, { recursive: true })
    throw error
  }
  const receipt = { version, extensionId: id, sha256, target: 'dist', rollback, rollbackSafetyCopy, rollbackSha256,
    builtAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceInputs: baseline, browserReloaded: false }
  fs.writeFileSync(path.join(delivery, `receipt-${version}-${stamp}.json`), JSON.stringify(receipt, null, 2))
  console.log(`LayerPiP ${version} verified and delivered to dist; ID ${id}; SHA256 ${sha256}`)
} finally {
  fs.rmdirSync(lock) // Only this invocation's empty lock directory.
}
