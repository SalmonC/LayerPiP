import { deleteSubtitleAsset } from './assets'
import { resolveCurrentBilibiliIdentity } from './bilibili'
import {
  getSubtitleSourceBinding,
  saveSubtitleSourceBinding,
} from './repository'
import type { BilibiliVideoIdentity, SubtitleSourceDescriptor } from './types'

/** Only a newly created, unreferenced asset may be rolled back. */
export async function commitSubtitleSource(
  target: BilibiliVideoIdentity,
  source: SubtitleSourceDescriptor,
  createdAssetId?: string,
) {
  let attempted = false
  try {
    // Asset reads and hashing may have taken long enough for the page to change.
    const current = await resolveCurrentBilibiliIdentity()
    if (current.aid !== target.aid || current.cid !== target.cid)
      throw Error('视频已切换，请重新打开字幕设置')
    attempted = true
    await saveSubtitleSourceBinding(target, source)
  } catch (error) {
    if (!createdAssetId) throw error
    if (attempted) {
      // A rejected write may already have committed. Never delete its asset blindly.
      try {
        const binding = await getSubtitleSourceBinding(target)
        if (
          binding?.source.type === 'local-file' &&
          binding.source.assetId === createdAssetId
        )
          return
      } catch {
        throw Error('无法确认保存结果，已保留字幕文件；请重新打开设置检查')
      }
    }
    try {
      await deleteSubtitleAsset(createdAssetId)
    } catch {
      throw Error(
        `${error instanceof Error ? error.message : String(error)}；未能清理本次新建的字幕文件，原绑定保留`,
      )
    }
    throw error
  }
}
