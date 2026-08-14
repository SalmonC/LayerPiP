import assert from 'node:assert/strict'
import test from 'node:test'
import { getProviderConfig } from '../../src/shared/providerConfig'

test('routes Bilibili video pages to the dedicated video provider', () => {
  assert.equal(
    getProviderConfig('https://www.bilibili.com/video/BV1h54y1L7oe/'),
    'bilibili-video',
  )
  assert.equal(
    getProviderConfig('https://www.bilibili.com/list/123456'),
    'bilibili-video',
  )
  assert.equal(
    getProviderConfig('https://www.bilibili.com/bangumi/play/ep123456'),
    'bilibili-video',
  )
})

test('routes Bilibili live pages to the dedicated live provider', () => {
  assert.equal(
    getProviderConfig('https://live.bilibili.com/123456'),
    'bilibili-live',
  )
})

test('routes ordinary and formerly dedicated sites to CommonProvider', () => {
  const commonUrls = [
    'https://example.com/video',
    'https://www.youtube.com/watch?v=test',
    'https://www.netflix.com/watch/123456',
    'https://www.twitch.tv/example',
    'https://www.douyu.com/123456',
    'https://www.huya.com/123456',
    'https://live.douyin.com/123456',
    'https://ani.gamer.com.tw/animeVideo.php?sn=123456',
    'https://ddys.art/example',
  ]

  for (const url of commonUrls) {
    assert.equal(getProviderConfig(url), 'common', url)
  }
})
