import {
  WebProvider,
  DocPIPWebProvider,
  CanvasPIPWebProvider,
  ReplacerWebProvider,
} from '@root/core/WebProvider'
import configStore from '@root/store/config'
import playerConfig from '@root/store/playerConfig'
import { PipMode, DocPIPRenderType } from '@root/types/config'
import { getProviderConfig } from '@root/shared/providerConfig'
import BilibiliLiveProvider from './bilibili/live'
import BilibiliVideoProvider from './bilibili/video'

export default function getWebProvider(): WebProvider {
  const providerKey = getProviderConfig(location.href)
  const mode =
    playerConfig.forceDocPIPRenderType || configStore.docPIP_renderType
  const player: WebProvider =
    mode === DocPIPRenderType.replaceWebVideoDom
      ? new ReplacerWebProvider()
      : configStore.pipMode === PipMode.document
        ? new DocPIPWebProvider()
        : new CanvasPIPWebProvider()

  switch (providerKey) {
    case 'bilibili-live':
      player.siteAdapter = new BilibiliLiveProvider(player)
      break
    case 'bilibili-video':
      player.siteAdapter = new BilibiliVideoProvider(player)
      break
    default:
      break
  }
  return player
}
