import assert from 'node:assert/strict'
import test from 'node:test'
import playerConfig from '../../src/store/playerConfig'

test('clear removes every temporary player field and preserves itself', () => {
  const clear = playerConfig.clear

  Object.assign(playerConfig, {
    cropTarget: { marker: 'crop' },
    restrictionTarget: { marker: 'restriction' },
    forceDocPIPRenderType: 'replaceVideoEl',
    posData: { marker: 'position' },
    webRTCMediaStream: { marker: 'stream' },
    topContainerEl: { marker: 'container' },
    isFixedPos: true,
  })

  playerConfig.clear()

  assert.deepEqual(Object.keys(playerConfig), ['clear'])
  assert.equal(playerConfig.clear, clear)
})
