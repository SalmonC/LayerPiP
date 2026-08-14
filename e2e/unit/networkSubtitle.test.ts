import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyNetworkSubtitleOffset,
  createDirectSubtitleProbe,
  parseNetworkSubtitleContent,
} from '../../src/core/SubtitleManager/networkSubtitle'
import {
  parseBilibiliVideoUrl,
  probeBilibiliNetworkSubtitle,
} from '../../src/web-provider/bilibili/video/networkSubtitle'

const pages = [
  { page: 57, cid: 28804517781, part: '57-AlexNet' },
  { page: 1, cid: 10001, part: '01-Introduction' },
]

function createFetch(options?: { needLogin?: boolean }) {
  const urls: string[] = []
  const fetchJson = async (url: string) => {
    urls.push(url)
    if (url.includes('/x/web-interface/view')) {
      return {
        code: 0,
        data: {
          aid: 12345,
          bvid: 'BV15UREYsEN8',
          title: '动手学深度学习',
          pages,
        },
      }
    }
    if (url.includes('/x/player/wbi/v2')) {
      return {
        code: 0,
        data: options?.needLogin
          ? { need_login_subtitle: true, subtitle: { subtitles: [] } }
          : {
              subtitle: {
                subtitles: [
                  {
                    lan_doc: '中文（自动生成）',
                    subtitle_url: '//i0.hdslb.com/bfs/subtitle/test.json',
                  },
                ],
              },
            },
      }
    }
    throw new Error(`unexpected URL: ${url}`)
  }
  return { fetchJson, urls }
}

test('parses an explicit Bilibili part without being confused by trailing &', () => {
  assert.deepEqual(
    parseBilibiliVideoUrl('https://www.bilibili.com/video/BV15UREYsEN8/?p=57&'),
    { bvid: 'BV15UREYsEN8', explicitPart: 57 },
  )
})

test('rejects ambiguous or invalid explicit p values', () => {
  assert.throws(
    () =>
      parseBilibiliVideoUrl(
        'https://www.bilibili.com/video/BV15UREYsEN8?p=57&p=1',
      ),
    /重复/,
  )
  assert.throws(
    () =>
      parseBilibiliVideoUrl('https://www.bilibili.com/video/BV15UREYsEN8?p=0'),
    /正整数/,
  )
})

test('a Bilibili URL without p requires an explicit part selection', async () => {
  const { fetchJson, urls } = createFetch()
  const result = await probeBilibiliNetworkSubtitle(
    'https://www.bilibili.com/video/BV15UREYsEN8',
    undefined,
    fetchJson,
  )
  assert.equal(result?.needsPartSelection, true)
  assert.deepEqual(
    result?.parts.map((part) => part.page),
    [57, 1],
  )
  assert.equal(urls.length, 1)
})

test('matches selected p by pages[].page instead of array index', async () => {
  const { fetchJson, urls } = createFetch()
  const result = await probeBilibiliNetworkSubtitle(
    'https://www.bilibili.com/video/BV15UREYsEN8?p=57',
    undefined,
    fetchJson,
  )
  assert.equal(result?.selectedPart, 57)
  assert.equal(result?.tracks.length, 1)
  assert.match(urls[1], /cid=28804517781/)
  assert.equal(
    result?.tracks[0].value,
    'https://i0.hdslb.com/bfs/subtitle/test.json',
  )
})

test('fails closed when the requested part does not exist', async () => {
  const { fetchJson, urls } = createFetch()
  await assert.rejects(
    probeBilibiliNetworkSubtitle(
      'https://www.bilibili.com/video/BV15UREYsEN8?p=58',
      undefined,
      fetchJson,
    ),
    /不存在 P58/,
  )
  assert.equal(urls.length, 1)
})

test('reports Bilibili login-required subtitles clearly', async () => {
  const { fetchJson } = createFetch({ needLogin: true })
  await assert.rejects(
    probeBilibiliNetworkSubtitle(
      'https://www.bilibili.com/video/BV15UREYsEN8?p=57',
      undefined,
      fetchJson,
    ),
    /登录 B 站/,
  )
})

test('probes a direct subtitle URL as one selectable track', () => {
  const result = createDirectSubtitleProbe('https://example.com/a.srt?token=1')
  assert.equal(result.needsPartSelection, false)
  assert.equal(result.tracks[0].label, '[网络] a.srt')
})

test('parses SRT and Bilibili JSON content', () => {
  const srt = `1\n00:00:01,000 --> 00:00:02,500\nhello\n`
  assert.equal(
    parseNetworkSubtitleContent(srt, 'https://example.com/subtitle').at(0)
      ?.text,
    'hello',
  )

  const json = JSON.stringify({
    body: [{ from: 2, to: 3.5, content: '你好' }],
  })
  const rows = parseNetworkSubtitleContent(
    json,
    'https://i0.hdslb.com/bfs/subtitle/test.json',
  )
  assert.deepEqual(
    rows.map(({ startTime, endTime, text }) => ({ startTime, endTime, text })),
    [{ startTime: 2, endTime: 3.5, text: '你好' }],
  )
})

test('rejects subtitle rows with non-finite or reversed times', () => {
  const invalidSrt = `1\naa:bb:cc,ddd --> 00:00:02,500\ninvalid\n`
  assert.throws(
    () =>
      parseNetworkSubtitleContent(
        invalidSrt,
        'https://example.com/invalid.srt',
      ),
    /无法识别字幕格式/,
  )

  const reversedJson = JSON.stringify({
    body: [{ from: 3, to: 2, content: 'invalid' }],
  })
  assert.throws(
    () =>
      parseNetworkSubtitleContent(
        reversedJson,
        'https://example.com/invalid.json',
      ),
    /无法识别字幕格式/,
  )
})

test('applies positive and negative offsets on the A timeline', () => {
  const rows = [
    {
      id: '1',
      startTime: 2,
      endTime: 4,
      text: 'a',
      htmlText: 'a',
    },
  ]
  assert.deepEqual(
    applyNetworkSubtitleOffset(rows, 1).map((row) => [
      row.startTime,
      row.endTime,
    ]),
    [[1, 3]],
  )
  assert.deepEqual(
    applyNetworkSubtitleOffset(rows, -1).map((row) => [
      row.startTime,
      row.endTime,
    ]),
    [[3, 5]],
  )
})
