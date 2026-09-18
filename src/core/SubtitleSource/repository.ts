import { SUBTITLE_SOURCE_BINDINGS } from '@root/shared/storeKey'
import Browser from 'webextension-polyfill'
import {
  getBrowserLocalStorage,
  setBrowserLocalStorage,
} from '@root/utils/storage'
import type {
  BilibiliVideoIdentity,
  SubtitleSourceBinding,
  SubtitleSourceBindings,
  SubtitleSourceDescriptor,
} from './types'

export function getSubtitleTargetKey(identity: BilibiliVideoIdentity) {
  return `bilibili:${identity.aid}:${identity.cid}`
}

async function readBindings(): Promise<SubtitleSourceBindings> {
  const bindings = await getBrowserLocalStorage(SUBTITLE_SOURCE_BINDINGS)
  return bindings && typeof bindings === 'object' ? bindings : {}
}

export async function getSubtitleSourceBinding(
  identity: BilibiliVideoIdentity,
): Promise<SubtitleSourceBinding | undefined> {
  const bindings = await readBindings()
  const key = 'LAYERPIP_BINDING:' + getSubtitleTargetKey(identity)
  const entry = await Browser.storage.local.get(key)
  return entry[key] ?? bindings[getSubtitleTargetKey(identity)]
}

export async function saveSubtitleSourceBinding(
  target: BilibiliVideoIdentity,
  source: SubtitleSourceDescriptor,
) {
  const binding = {
    target,
    source,
    updatedAt: Date.now(),
  }
  await Browser.storage.local.set({
    ['LAYERPIP_BINDING:' + getSubtitleTargetKey(target)]: binding,
  })
}

export async function removeSubtitleSourceBinding(
  target: BilibiliVideoIdentity,
) {
  const bindings = await readBindings()
  delete bindings[getSubtitleTargetKey(target)]
  await setBrowserLocalStorage(SUBTITLE_SOURCE_BINDINGS, bindings)
  await Browser.storage.local.remove(
    'LAYERPIP_BINDING:' + getSubtitleTargetKey(target),
  )
}

export function onSubtitleSourceChange(callback: () => void) {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (
      area === 'local' &&
      Object.keys(changes).some((key) => key.startsWith('LAYERPIP_BINDING:'))
    )
      callback()
  }
  Browser.storage.onChanged.addListener(listener)
  return () => Browser.storage.onChanged.removeListener(listener)
}
