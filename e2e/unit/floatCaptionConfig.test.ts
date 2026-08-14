import assert from 'node:assert/strict'
import test from 'node:test'
import { DocPIPRenderType } from '../../src/types/config'
import {
  FLOAT_CAPTION_CORE_CONFIG,
  normalizeFloatCaptionConfig,
} from '../../src/store/config/floatCaption'

test('normalizes hidden core settings while preserving visible preferences', () => {
  const normalized = normalizeFloatCaptionConfig({
    docPIP_renderType: DocPIPRenderType.capture_captureStream,
    useDocPIP: false,
    bp_subtitle: false,
    bp_danmaku: false,
    bp_danmakuInput: true,
    autoPIP_inScrollToInvisible: true,
    htmlDanmakuEngine: 'IronKinoko',
    subtitle_fontSize: 27,
    opacity: 0.42,
    shortcut_forward: ['custom'],
  })

  assert.equal(normalized.docPIP_renderType, DocPIPRenderType.replaceVideoEl)
  assert.equal(normalized.useDocPIP, true)
  assert.equal(normalized.bp_subtitle, true)
  assert.equal(normalized.bp_danmaku, true)
  assert.equal(normalized.bp_danmakuInput, false)
  assert.equal(normalized.autoPIP_inScrollToInvisible, false)
  assert.equal(normalized.htmlDanmakuEngine, 'Apades')
  assert.equal(normalized.subtitle_fontSize, 27)
  assert.equal(normalized.opacity, 0.42)
  assert.deepEqual(normalized.shortcut_forward, ['custom'])
})

test('defines every control required by the focused player as a core invariant', () => {
  for (const key of [
    'bp_playToggle',
    'bp_subtitle',
    'bp_danmaku',
    'bp_playbackRate',
    'bp_volume',
  ] as const) {
    assert.equal(FLOAT_CAPTION_CORE_CONFIG[key], true, key)
  }
})
