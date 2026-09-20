import WebextEvent from '@root/shared/webextEvent'
import {
  WATCHED_RANGES_INDEX,
  WATCHED_RANGES_PREFIX,
  watchedRangesKey,
} from '@root/shared/storeKey'
import { mergeRanges } from '@root/utils/highEnergyBar/geometry'
import {
  getBrowserLocalStorage,
  setBrowserLocalStorage,
} from '@root/utils/storage'
import { onMessage } from 'webext-bridge/background'
import Browser from 'webextension-polyfill'

// One writer for every tab AND the shared eviction index. A read/merge/write in
// each content script is not atomic and loses concurrent updates.
let pending: Promise<unknown> = Promise.resolve()
onMessage(WebextEvent.mergeWatchedRanges, ({ data }) => {
  const operation = pending.then(async () => {
    if (!/^\d+$/.test(data.cid) || !Array.isArray(data.ranges))
      throw new Error('Invalid watched ranges')
    const key = watchedRangesKey(data.cid)
    const existing = await getBrowserLocalStorage(key)
    const ranges = mergeRanges(
      [...(existing?.ranges ?? []), ...data.ranges],
      1.5,
    )
    const updatedAt = Date.now()
    await setBrowserLocalStorage(key, { ranges, updatedAt })
    const index = (await getBrowserLocalStorage(WATCHED_RANGES_INDEX)) ?? []
    const next = index.filter((entry) => entry.cid !== data.cid)
    next.push({ cid: data.cid, updatedAt })
    next.sort((a, b) => a.updatedAt - b.updatedAt)
    const drop = next.splice(0, Math.max(0, next.length - 200))
    // Write the index before eviction; interruption can only leave extra records.
    await setBrowserLocalStorage(WATCHED_RANGES_INDEX, next)
    if (drop.length)
      await Browser.storage.local.remove(
        drop.map((entry) => WATCHED_RANGES_PREFIX + entry.cid),
      )
    return ranges
  })
  pending = operation.catch(() => {})
  return operation
})
