import SubtitleManager from '@root/core/SubtitleManager'
import type {
  NetworkSubtitleProbe,
  SubtitleRow,
} from '@root/core/SubtitleManager/types'
import bgFetch from '@root/utils/bgFetch'
import { runInAction } from 'mobx'
import { getSubtitle, getSubtitles } from '../utils'
import { probeBilibiliNetworkSubtitle } from './networkSubtitle'

export default class BilibiliSubtitleManager extends SubtitleManager {
  override async onInit() {
    await runInAction(async () => {
      this.subtitleItems.length = 0
      this.subtitleItems = await getSubtitles()
    })
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
