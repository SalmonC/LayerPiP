import SubtitleManager from '@root/core/SubtitleManager'
import type {
  NetworkSubtitleProbe,
  SubtitleRow,
} from '@root/core/SubtitleManager/types'
import bgFetch from '@root/utils/bgFetch'
import { runInAction } from 'mobx'
import { getSubtitleAsset } from '@root/core/SubtitleSource/assets'
import {
  probeLinkedBilibiliSource,
  resolveBilibiliTrackByCid,
  resolveCurrentBilibiliIdentity,
  selectTrack,
} from '@root/core/SubtitleSource/bilibili'
import { getSubtitleSourceBinding } from '@root/core/SubtitleSource/repository'
import type { SubtitleSourceDescriptor } from '@root/core/SubtitleSource/types'
import { getSubtitle, getSubtitles } from '../utils'
import { probeBilibiliNetworkSubtitle } from './networkSubtitle'

export default class BilibiliSubtitleManager extends SubtitleManager {
  override async onInit() {
    const generation = this.getLifecycleGeneration()
    // A missing site track list must not block an explicitly bound local/linked source.
    const subtitleItems = await getSubtitles().catch(() => [])
    if (!this.isLifecycleCurrent(generation)) return
    runInAction(() => {
      this.subtitleItems.length = 0
      this.subtitleItems = subtitleItems
    })
    await this.loadNativeSubtitleSource(generation)
  }

  private async loadNativeSubtitleSource(generation: number) {
    const identity = await resolveCurrentBilibiliIdentity()
    if (!this.isLifecycleCurrent(generation)) return
    const binding = await getSubtitleSourceBinding(identity)
    if (!this.isLifecycleCurrent(generation)) return
    const source = binding?.source ?? ({ type: 'auto' } as const)
    if (source.type === 'none') return

    try {
      await this.loadSource(identity.cid, identity.page, source, generation)
      if (!this.isLifecycleCurrent(generation)) return
      this.showSubtitle = true
    } catch (error) {
      if (source.type === 'auto') return
      throw error
    }
  }

  private async loadSource(
    targetCid: string,
    targetPage: number,
    source: Exclude<SubtitleSourceDescriptor, { type: 'none' }>,
    generation: number,
  ) {
    if (source.type === 'linked-bilibili') {
      const track = await resolveBilibiliTrackByCid(source)
      if (!this.isLifecycleCurrent(generation)) return
      await this.addNetworkSubtitle(track, source.offset)
      return
    }
    if (source.type === 'direct-url') {
      if (!this.isLifecycleCurrent(generation)) return
      await this.addNetworkSubtitle(
        { label: '[网络] 已绑定字幕', value: source.url },
        source.offset,
      )
      return
    }
    if (source.type === 'local-file') {
      const asset = await getSubtitleAsset(source.assetId)
      if (!this.isLifecycleCurrent(generation)) return
      if (!asset || asset.contentHash !== source.contentHash) {
        throw new Error('本地字幕文件不存在或校验失败，请重新选择文件')
      }
      this.addSubtitleContent(
        `[本地] ${source.fileName}`,
        asset.content,
        source.fileName,
        source.offset,
      )
      return
    }

    const probe = await probeLinkedBilibiliSource(location.href, targetPage)
    if (!this.isLifecycleCurrent(generation)) return
    if (probe.selectedCid !== targetCid) {
      throw new Error('当前视频 CID 已变化，已停止加载字幕以避免抓错')
    }
    const language =
      source.type === 'current-bilibili' ? source.language : undefined
    const track = selectTrack(probe, language)
    const offset = source.type === 'current-bilibili' ? source.offset : 0
    await this.addNetworkSubtitle(track, offset)
  }
  override async loadSubtitle(value: string): Promise<SubtitleRow[]> {
    const subtitleRes = await getSubtitle(value)
    return subtitleRes.body.map((d, i) => {
      return {
        endTime: d.to,
        startTime: d.from,
        htmlText: d.content,
        id: i + '',
        text: d.content,
      }
    })
  }

  override async probeNetworkSubtitle(
    input: string,
    selectedPart?: number,
  ): Promise<NetworkSubtitleProbe> {
    const probe = await probeBilibiliNetworkSubtitle(
      input,
      selectedPart,
      (url, options) => bgFetch(url, { ...options, type: 'json' }),
    )
    return probe ?? super.probeNetworkSubtitle(input, selectedPart)
  }
}
