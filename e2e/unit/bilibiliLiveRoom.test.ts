import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBilibiliLiveRoomId } from '../../src/web-provider/bilibili/liveRoom'

test('parses Bilibili live room paths with or without a trailing slash', () => {
  assert.equal(parseBilibiliLiveRoomId('/6'), 6)
  assert.equal(parseBilibiliLiveRoomId('/6/'), 6)
})

test('rejects malformed and non-positive Bilibili live room paths', () => {
  for (const pathname of ['/', '/abc/', '/0/', '/6/extra']) {
    assert.throws(() => parseBilibiliLiveRoomId(pathname))
  }
})
