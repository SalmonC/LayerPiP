import { SUBTITLE_SOURCE_BINDINGS } from '@root/shared/storeKey'
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
  return bindings[getSubtitleTargetKey(identity)]
}

export async function saveSubtitleSourceBinding(
  target: BilibiliVideoIdentity,
  source: SubtitleSourceDescriptor,
) {
  const bindings = await readBindings()
  bindings[getSubtitleTargetKey(target)] = {
    target,
    source,
    updatedAt: Date.now(),
  }
  await setBrowserLocalStorage(SUBTITLE_SOURCE_BINDINGS, bindings)
}

export async function removeSubtitleSourceBinding(
  target: BilibiliVideoIdentity,
) {
  const bindings = await readBindings()
  delete bindings[getSubtitleTargetKey(target)]
  await setBrowserLocalStorage(SUBTITLE_SOURCE_BINDINGS, bindings)
}
