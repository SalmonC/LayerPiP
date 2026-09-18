import DanmakuSender from '@root/core/danmaku/DanmakuSender'
import type { WebProvider } from '@root/core/WebProvider'
import BilibiliLiveBarrageClient from '@root/danmaku/bilibili/liveBarrageClient'
import { dq1Adv } from '@root/utils'
import { parseBilibiliLiveRoomId } from './liveRoom'

export default class BilibiliLiveProvider {
  constructor(private player: WebProvider) {}
  // Live behavior belongs to this adapter; surface remains mode-independent.
  onInit(): void {
    this.player.isLive = true
    this.player.danmakuSender = new DanmakuSender()
    this.player.danmakuSender.setData({
      webSendButton:
        dq1Adv<HTMLElement>('.right-actions button') ||
        dq1Adv<HTMLElement>('#chat-control-panel-vm .bottom-actions button'),
      webTextInput:
        dq1Adv<HTMLInputElement>('.chat-input-new textarea') ||
        dq1Adv<HTMLInputElement>('#chat-control-panel-vm textarea'),
    })
  }

  async onPlayerInitd() {
    this.connectDanmakuWs()
  }

  danmakuWs?: BilibiliLiveBarrageClient
  connectDanmakuWs() {
    const id = parseBilibiliLiveRoomId(location.pathname)

    this.danmakuWs = new BilibiliLiveBarrageClient(id)

    this.player.addOnUnloadFn(
      this.danmakuWs.on2('danmu', (danmaku) => {
        // console.log('danmu', danmaku)
        this.player.danmakuEngine?.addDanmakus([
          {
            ...danmaku,
            type: 'right',
          },
        ])
      }),
    )
  }

  onUnload(): void {
    this.danmakuWs?.close()
  }
}
