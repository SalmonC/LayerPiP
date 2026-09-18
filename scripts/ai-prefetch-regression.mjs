import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'esbuild'

const root = process.cwd()
const fixture = path.join(root, '.delivery/prefetch-smoke')
const output = path.join(fixture, 'ai-prefetch-regression.js')
const required = ['source-stubs.ts', 'init.mp4', 'index.bin', 'segment-48.m4s']
const missing = required.filter(
  (name) => !fs.existsSync(path.join(fixture, name)),
)
if (missing.length)
  throw Error(
    `缺少预取回归 fixture：${missing.join(', ')}；请先准备 .delivery/prefetch-smoke 的本地样本`,
  )

await build({
  entryPoints: [path.join(root, 'scripts/ai-prefetch-regression.ts')],
  outfile: output,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  logLevel: 'silent',
  alias: {
    '@root/utils/bgFetch': path.join(fixture, 'source-stubs.ts'),
    '@root/core/SubtitleSource/bilibili': path.join(fixture, 'source-stubs.ts'),
  },
})

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html')
    response.end(
      '<script type="module" src="/ai-prefetch-regression.js"></script>',
    )
    return
  }
  const file = path.join(fixture, path.basename(url.pathname))
  try {
    response.setHeader(
      'Content-Type',
      url.pathname.endsWith('.js')
        ? 'application/javascript'
        : 'application/octet-stream',
    )
    response.end(fs.readFileSync(file))
  } catch {
    response.statusCode = 404
    response.end()
  }
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw Error('回归 server 未启动')
const origin = `http://127.0.0.1:${address.port}`
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  const errors = []
  const external = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) external.push(request.url())
  })
  await page.goto(origin)
  await page.waitForFunction(
    () => typeof window.runAiPrefetchRegression === 'function',
  )
  const result = await page.evaluate(() => window.runAiPrefetchRegression())
  console.log(JSON.stringify({ result, errors, external }, null, 2))
  if (
    errors.length ||
    external.length ||
    result.checks.some((check) => !check.ok)
  )
    process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
