import type { WebProvider } from '@root/core/WebProvider'
import onRouteChange from '@root/inject/csUtils/onRouteChange'
import DanmakuSender from '@root/core/danmaku/DanmakuSender'
import { dq, dq1, switchLatest, tryCatch } from '@root/utils'
import { SideSwitcher } from '@root/core/SideSwitcher'
import { VideoItem } from '@root/components/VideoPlayer/Side'
import API_bilibili from '@root/api/bilibili'
import { t } from '@root/utils/i18n'
import { getVideoInfoFromUrl } from '@pkgs/danmakuGetter/apiDanmaku/bilibili/BilibiliVideo'
import toast from 'react-hot-toast'
import { createElement } from 'react'
import { addonRecovery } from '@root/core/AddonRecovery'
import { sendMessage } from '@root/inject/contentSender'
import { onSubtitleSourceChange } from '@root/core/SubtitleSource/repository'
import highEnergyBar from '@root/core/HighEnergyBar/controller'
import type { BilibiliVideoIdentity } from '@root/core/SubtitleSource/types'
import { getDanmakus } from '../utils'
import BiliBiliPreviewManager from './PreviewManager'
import BilibiliSubtitleManager from './SubtitleManager'

type RecommendVideo = {
  el: HTMLElement
  linkEl: HTMLElement
  link: string
  cover: string
  title: string
  user: string
  played: number
  duration: number
  bvid: string
  danmaku: number
}

export default class BilibiliVideoProvider {
  constructor(private player: WebProvider) {}
  onInit(): void {
    this.player.subtitleManager = new BilibiliSubtitleManager()
    this.player.addOnUnloadFn(
      onSubtitleSourceChange(() => {
        if (this.player.active)
          void this.player.subtitleManager.init(this.player.webVideo)
      }),
    )
    // danmakuSender
    this.player.danmakuSender = new DanmakuSender()
    this.player.danmakuSender.setData({
      webTextInput: dq1<HTMLInputElement>('.bpx-player-dm-input'),
      webSendButton: dq1<HTMLElement>('.bpx-player-dm-btn-send'),
    })
    // sideSwitcher
    this.player.sideSwitcher = new SideSwitcher()
    this.player.videoPreviewManager = new BiliBiliPreviewManager()

    sendMessage('event-hacker:disable', {
      qs: 'document',
      event: 'visibilitychange',
    })
  }

  private lastAid = ''
  private lastCid = ''
  private updateGeneration = 0

  async onPlayerInitd() {
    this.update(false)

    this.player.addOnUnloadFn(
      onRouteChange(() => {
        this.update()
      }),
    )
  }

  onUnload(): void {
    this.updateGeneration++
    // 卸载前把已看区间落盘（`played` 不持久化，且换源会重置）。
    void highEnergyBar.release()
    sendMessage('event-hacker:enable', {
      qs: 'document',
      event: 'visibilitychange',
    })
  }

  update(resetRecovery = true) {
    this.updateGeneration++
    if (resetRecovery) this.player.refreshRecovery()
    // Invalidate already displayed data as well as late network responses.
    this.player.danmakuEngine?.resetState()
    void this.initDanmakus()
    void this.player.subtitleManager.init(this.player.webVideo)
    void this.initHighEnergyBar()
    void this.initSideSwitcherData().catch(console.warn)
    this.player.videoPreviewManager?.init(this.player.webVideo)
  }

  /**
   * 绑定高能进度条：解析当前 aid/cid，交给 controller 做已看区间采集与曲线取数。
   * 这里只负责「拿到身份」，采集/存储/取数都在 core/HighEnergyBar 里，
   * 避免把网络与持久化混进 provider 或组件。
   */
  async initHighEnergyBar() {
    const generation = this.updateGeneration
    let identity: BilibiliVideoIdentity | null = null
    try {
      const info = await getVideoInfoFromUrl(location.href)
      if (info?.aid && info?.cid) {
        identity = {
          aid: String(info.aid),
          cid: String(info.cid),
          page: Number(new URL(location.href).searchParams.get('p') ?? 1) || 1,
        }
      }
    } catch (error) {
      console.warn('[highEnergyBar] 解析视频身份失败', error)
    }
    if (generation !== this.updateGeneration) return
    // 即使身份解析失败也要 bind：让 controller 知道视频元素换了，
    // 并挂起采集，避免把上一支视频的区间算到新视频上。
    await highEnergyBar.bind(this.player.webVideo ?? null, identity)
  }

  getDanmakus = switchLatest(async () => {
    const { aid, cid } = await getVideoInfoFromUrl(location.href)

    const danmakus = await getDanmakus(aid, cid)
    return danmakus
  })
  retryDanmaku() {
    return this.initDanmakus()
  }

  async initDanmakus() {
    const generation = this.updateGeneration
    addonRecovery.report(this.player.webVideo, 'danmaku', '')
    const [err] = await tryCatch(async () => {
      const danmakus = await this.getDanmakus()
      if (!this.player.active || generation !== this.updateGeneration) return
      const engine = this.player.danmakuEngine
      if (!engine) throw new Error('弹幕引擎不可用')
      // React commits the Document PiP renderer asynchronously. A cached
      // response can arrive first; retain it until the renderer is ready.
      await engine.initLock.waiting()
      if (
        !this.player.active ||
        generation !== this.updateGeneration ||
        engine !== this.player.danmakuEngine
      )
        return
      await engine.setDanmakus(danmakus)
    })
    if (!this.player.active || generation !== this.updateGeneration) return

    if (err) {
      addonRecovery.report(this.player.webVideo, 'danmaku', err)
      toast(
        (notification) =>
          createElement(
            'button',
            {
              type: 'button',
              style: {
                color: 'inherit',
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
              },
              onClick: () => {
                toast.dismiss(notification.id)
                if (this.player.active && generation === this.updateGeneration)
                  void this.initDanmakus()
              },
            },
            `${t('error.danmakuLoad')} · 点击重试弹幕`,
          ),
        { duration: 8000 },
      )
    }
  }

  // ! 已知他用的top，目前没有iframe跳转方案了；需要切换成video url方案了https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/video/videostream_url.md
  async initSideSwitcherData() {
    if (!this.player.sideSwitcher) {
      console.error('已经被unload了', this)
      throw Error('已经被unload了')
    }

    const getCtxDocument = () => document
    /**获取视频分p列表 */
    const getVideoPElList = () => {
      const list = [
        () => dq('.video-episode-card', getCtxDocument()),
        // https://www.bilibili.com/video/BV1Yh4y1j7ko 用的这个，是不是瓦比赛那套改了不得而知
        () => dq('.list-box li .clickitem', getCtxDocument()),
        // 新网页的选择器
        () =>
          dq('.video-pod__item .simple-base-item:not(.head)', getCtxDocument()),
        // 还有这种😅
        () =>
          dq('.video-pod__item.simple-base-item:not(.head)', getCtxDocument()),
        // 目前看到瓦的比赛视频分p用的这个
        () => dq('.list-box li a', getCtxDocument()),
        // /list/*用的这个
        () => dq('.action-list-item .actionlist-item-inner', getCtxDocument()),
      ]

      return list.find((fn) => fn().length)?.() || []
    }

    /**分p视频active */
    const isVideoPActive = (el: HTMLElement) =>
      !!(
        el.querySelector('.video-episode-card__info-playing') ||
        el.querySelector('.video-episode-card__info-title-playing') ||
        el.classList.contains('on') ||
        el.classList.contains('active') ||
        el.classList.contains('siglep-active')
      )

    // 视频分p
    const videoPElList = getVideoPElList()
    const videoPItems: VideoItem[] = videoPElList.map((el) => {
      return {
        el,
        link: '',
        linkEl: el,
        title:
          el.querySelector('.video-episode-card__info-title')?.textContent ??
          el.querySelector('.title')?.textContent ??
          el.textContent?.trim() ??
          '',
        isActive: isVideoPActive(el),
        cover: dq1<HTMLImageElement>('.cover img', el)?.src,
      }
    })

    async function getRecommendVideos() {
      const relateVideos = await API_bilibili.getRelateVideos(
        (await getVideoInfoFromUrl(location.href)).aid,
      )
      const recommendElList = dq('.video-page-card-small')

      if (!relateVideos) throw Error('没法获取关联视频')
      const recommendVideos: RecommendVideo[] = []

      recommendElList.forEach((el) => {
        const elAEl = el.querySelector<HTMLAnchorElement>('.info a')
        if (!elAEl) return

        const linkEl = elAEl.children[0] as HTMLElement,
          elBvid = elAEl.href.match(/\/video\/(BV.*)\//)?.[1]

        if (!linkEl || !elBvid) return

        const i = relateVideos.findIndex((v: any) => v.bvid == elBvid)
        const relate = relateVideos.splice(i, 1)[0]

        recommendVideos.push({
          cover: relate.pic,
          duration: relate.duration,
          // 下面3个对应在网站上的
          el,
          link: `/video/${elBvid}`,
          linkEl,
          played: relate.stat.view,
          title: relate.title,
          user: relate.owner.name,
          bvid: elBvid,
          danmaku: relate.stat.danmaku,
        })
      })

      return recommendVideos
    }

    const recommendations = await getRecommendVideos().catch(
      () => [] as RecommendVideo[],
    )
    if (!this.player.active) return
    this.player.sideSwitcher.init([
      {
        category: t('vp.playList'),
        items: videoPItems,
        mainList: true,
      },
      {
        category: t('vp.recommendedList'),
        items: recommendations.map((v) => ({ ...v, id: v.bvid })),
      },
    ])
  }
}
