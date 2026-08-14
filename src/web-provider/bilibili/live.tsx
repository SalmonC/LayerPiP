import DanmakuSender from '@root/core/danmaku/DanmakuSender'
import { WebProvider } from '@root/core/WebProvider'
import BilibiliLiveBarrageClient from '@root/danmaku/bilibili/liveBarrageClient'
import { dq1Adv } from '@root/utils'
import { parseBilibiliLiveRoomId } from './liveRoom'

export default class BilibiliLiveProvider extends WebProvider {
  override isLive = true
  override onInit(): void {
    this.danmakuSender = new DanmakuSender()
    this.danmakuSender.setData({
      webSendButton:
        dq1Adv<HTMLElement>('.right-actions button') ||
        dq1Adv<HTMLElement>('#chat-control-panel-vm .bottom-actions button'),
      webTextInput:
        dq1Adv<HTMLInputElement>('.chat-input-new textarea') ||
        dq1Adv<HTMLInputElement>('#chat-control-panel-vm textarea'),
    })
  }

  override async onPlayerInitd() {
    this.connectDanmakuWs()
  }

  danmakuWs?: BilibiliLiveBarrageClient
  connectDanmakuWs() {
    const id = parseBilibiliLiveRoomId(location.pathname)

    this.danmakuWs = new BilibiliLiveBarrageClient(id)

    this.addOnUnloadFn(
      this.danmakuWs.on2('danmu', (danmaku) => {
        // console.log('danmu', danmaku)
        this.danmakuEngine?.addDanmakus([
          {
            ...danmaku,
            type: 'right',
          },
        ])
      }),
    )
  }

  override onUnload(): void {
    this.danmakuWs?.close()
  }
}
