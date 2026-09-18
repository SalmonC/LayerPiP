import { addEventListener, readTextFromFile, tryCatch } from '@root/utils'
import Events2 from '@root/utils/Events2'
import { autorun, makeObservable, observable, runInAction } from 'mobx'
import { ERROR_MSG } from '@root/shared/errorMsg'
import toast from 'react-hot-toast'
import { createElement as reactElement } from 'react'
import { getNowLang, t } from '@root/utils/i18n'
import { googleTranslate } from '@root/utils/translate'
import bgFetch from '@root/utils/bgFetch'
import { addonRecovery } from '../AddonRecovery'
import { SubtitleTimeline, type SubtitleSnapshot } from './SubtitleTimeline'
import {
  applyNetworkSubtitleOffset,
  createDirectSubtitleProbe,
  parseNetworkSubtitleContent,
  parseSubtitleContent,
} from './networkSubtitle'
import assParser from './subtitleParser/ass'
import srtParser from './subtitleParser/srt'
import type {
  NetworkSubtitleProbe,
  NetworkSubtitleTrack,
  SubtitleItem,
  SubtitleManagerEvents,
  SubtitleRow,
} from './types'

export const translateMode = {
  double: t('subtitleTranslate.double'),
  single: t('subtitleTranslate.single'),
  none: t('subtitleTranslate.none'),
} as const
export const AI_SUBTITLE_LABEL = 'AI 本地字幕'
const AI_SUBTITLE_VALUE = 'layerpip-generated-ai'
class SubtitleManager extends Events2<SubtitleManagerEvents> {
  initd = false
  subtitleItems: SubtitleItem[] = []

  video?: HTMLVideoElement
  private subtitleCache = new Map<string, { rows: SubtitleRow[] }>()
  /**正在使用的字幕rows */
  rows: SubtitleRow[] = []
  snapshot: SubtitleSnapshot = { current: [], history: [] }
  private timeline = new SubtitleTimeline([])
  private trackGeneration = 0
  rowIndex = 0
  activeRows = new Set<SubtitleRow>()
  activeSubtitleLabel: string = ''
  showSubtitle = false
  translateMode: keyof typeof translateMode = 'none'
  private customSubtitleId = 0
  private lifecycleGeneration = 0
  private generatedSession = 0

  protected getLifecycleGeneration() {
    return this.lifecycleGeneration
  }

  protected isLifecycleCurrent(generation: number) {
    return generation === this.lifecycleGeneration
  }

  nowSubtitleItemsLabel: string = ''

  protected onUnloadFn: (() => void)[] = []
  protected addOnUnloadFn(fn: () => void) {
    this.onUnloadFn.push(fn)
  }

  /**停止监听所有video事件 */
  private videoUnListen = () => {}
  constructor() {
    super()
    // makover(this, { video: false, activeRows: false })
    makeObservable(this, {
      subtitleItems: observable,
      rowIndex: observable,
      snapshot: observable.ref,
      // activeRows: observable,
      activeSubtitleLabel: observable,
      showSubtitle: true,
      translateMode: true,
      nowSubtitleItemsLabel: true,
    })

    this.addOnUnloadFn(
      autorun(() => {
        this.autoloadSubtitle()
      }),
    )
  }

  protected initing = false
  async init(video: HTMLVideoElement) {
    this.reset()
    const generation = this.lifecycleGeneration
    this.video = video
    addonRecovery.report(video, 'subtitle', '')

    this.initing = true
    const [err] = await tryCatch(async () => this.onInit())
    if (!this.isLifecycleCurrent(generation)) return
    this.initing = false
    if (err) {
      addonRecovery.report(this.video, 'subtitle', err)
      const message =
        err instanceof Error ? err.message : t('error.subtitleLoad')
      toast(
        (notification) =>
          reactElement(
            'button',
            {
              type: 'button',
              style: {
                color: 'inherit',
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
              },
              onClick: () => {
                toast.dismiss(notification.id)
                if (this.isLifecycleCurrent(generation) && this.video)
                  void this.init(this.video)
              },
            },
            `${message} · 点击重试字幕`,
          ),
        { duration: 8000 },
      )
    }
    this.initd = true
  }
  onInit() {}
  unload() {
    this.reset()
    this.onUnload()
    this.onUnloadFn.forEach((fn) => fn())
    this.offAll()
  }
  onUnload() {}

  // addSubtitle(label: string, rows: SubtitleRow[]) {
  //   this.subtitleItems.push({ label, value: label })
  //   this.subtitleCache.set(label, { rows })
  // }

  async addFileSubtitle(file: File) {
    const label = file.name
    const cacheKey = `custom-${label}`

    // 如果已緩存，直接重新掛載
    if (this.subtitleCache.has(cacheKey)) {
      if (!this.subtitleItems.find((item) => item.label === label)) {
        this.subtitleItems.push({ label, value: label })
      }
      this.useSubtitle(label)
      return
    }

    const fileType = (label.split('.').pop() ?? '').toLowerCase()
    let rows: SubtitleRow[] = []
    switch (fileType) {
      case 'srt': {
        const text = await readTextFromFile(file)
        rows = srtParser(text)
        break
      }
      case 'ass': {
        const text = await readTextFromFile(file)
        rows = assParser(text)
        break
      }
      default: {
        toast.error('Unsupported subtitle file. Only support .srt .ass')
        return
      }
    }
    console.log('解析后的rows', rows)

    this.subtitleItems.push({ label, value: label })
    this.subtitleCache.set(cacheKey, { rows })
    this.useSubtitle(label)
  }

  async probeNetworkSubtitle(
    input: string,
    _selectedPart?: number,
  ): Promise<NetworkSubtitleProbe> {
    return createDirectSubtitleProbe(input)
  }

  async addNetworkSubtitle(track: NetworkSubtitleTrack, offset = 0) {
    const generation = this.lifecycleGeneration
    const content = await bgFetch(track.value, { type: 'text' })
    if (generation !== this.lifecycleGeneration) {
      throw new Error('页面已切换，请重新加载网络字幕')
    }
    if (typeof content !== 'string') {
      throw new Error('网络字幕返回了无法识别的内容')
    }
    const rows = applyNetworkSubtitleOffset(
      parseNetworkSubtitleContent(content, track.value),
      offset,
    )
    if (!rows.length) {
      throw new Error('应用时间偏移后没有可显示的字幕')
    }
    return this.addCustomSubtitleRows(track.label, rows)
  }

  addSubtitleContent(
    label: string,
    content: string,
    sourceName: string,
    offset = 0,
  ) {
    const rows = applyNetworkSubtitleOffset(
      parseSubtitleContent(content, sourceName),
      offset,
    )
    if (!rows.length) throw new Error('字幕文件没有可显示的内容')
    return this.addCustomSubtitleRows(label, rows)
  }

  protected addCustomSubtitleRows(label: string, rows: SubtitleRow[]) {
    let uniqueLabel = label
    let suffix = 2
    while (this.subtitleItems.some((item) => item.label === uniqueLabel)) {
      uniqueLabel = `${label} (${suffix++})`
    }

    const value = `network-${Date.now()}-${++this.customSubtitleId}`
    this.subtitleItems.push({ label: uniqueLabel, value })
    this.subtitleCache.set(`custom-${value}`, { rows })
    this.useSubtitle(uniqueLabel)
    return uniqueLabel
  }

  /** A live track bypasses online translation and cannot publish into another source. */
  beginGeneratedSubtitle() {
    const session = ++this.generatedSession
    const generation = this.lifecycleGeneration
    const key = `custom-${AI_SUBTITLE_VALUE}`
    if (!this.subtitleItems.some((item) => item.value === AI_SUBTITLE_VALUE))
      this.subtitleItems.push({ label: AI_SUBTITLE_LABEL, value: AI_SUBTITLE_VALUE })
    if (!this.subtitleCache.has(key)) this.subtitleCache.set(key, { rows: [] })
    const same = this.nowSubtitleItemsLabel === AI_SUBTITLE_LABEL
    void this.useSubtitle(AI_SUBTITLE_LABEL)
    if (same) void this.autoloadSubtitle()
    return {
      append: (incoming: SubtitleRow[]) => {
        if (session !== this.generatedSession || generation !== this.lifecycleGeneration || this.nowSubtitleItemsLabel !== AI_SUBTITLE_LABEL) return false
        const previous = this.subtitleCache.get(key)?.rows ?? []
        const rows = [...previous.filter((row) => !incoming.some((next) => next.startTime < row.endTime && next.endTime > row.startTime)), ...incoming]
          .sort((a, b) => a.startTime - b.startTime).slice(-6000)
        this.subtitleCache.set(key, { rows })
        this.rows = [...rows]
        this.listenVideoEvents()
        runInAction(() => { this.showSubtitle = rows.length > 0 })
        return true
      },
      close: () => { if (session === this.generatedSession) this.generatedSession++ },
    }
  }

  protected listenVideoEvents(video = this.video) {
    if (!video) throw Error(ERROR_MSG.unInitVideoEl)

    // 先清理旧监听，防重复绑定
    this.videoUnListen()

    this.timeline = new SubtitleTimeline(this.rows)
    const update = () => {
      const next = this.timeline.at(video.currentTime)
      const same = (a: SubtitleRow[], b: SubtitleRow[]) =>
        a.length === b.length && a.every((row, i) => row === b[i])
      for (const row of this.activeRows) {
        if (!next.current.includes(row)) this.emit('row-leave', row)
      }
      for (const row of next.current) {
        if (!this.activeRows.has(row)) this.emit('row-enter', row)
      }
      this.activeRows = new Set(next.current)
      if (
        !same(next.current, this.snapshot.current) ||
        !same(next.history, this.snapshot.history)
      ) {
        runInAction(() => {
          this.snapshot = next
        })
      }
    }
    const stop = addEventListener(video, (el) => {
      el.addEventListener('timeupdate', update)
      el.addEventListener('seeking', update)
      el.addEventListener('seeked', update)
    })
    this.videoUnListen = () => {
      stop()
      for (const row of this.activeRows) this.emit('row-leave', row)
      this.activeRows.clear()
    }
    update()
  }

  updateVideo(video: HTMLVideoElement) {
    this.videoUnListen()
    this.video = video
    this.listenVideoEvents(video)
  }

  async useSubtitle(subtitleItemsLabel: string) {
    runInAction(() => {
      this.nowSubtitleItemsLabel = subtitleItemsLabel
    })
  }

  protected async autoloadSubtitle() {
    const subtitleItemsLabel = this.nowSubtitleItemsLabel
    const translateMode = this.translateMode
    if (!subtitleItemsLabel) return
    this.resetSubtitleState()
    const generation = this.trackGeneration
    this.activeSubtitleLabel = subtitleItemsLabel
    // let subtitleData = this.subtitleCache.get(
    //   `${subtitleItemsLabel}-${translateMode}`,
    // )
    let subtitleData = null as { rows: SubtitleRow[] } | null
    const subtitleItemsValue = this.subtitleItems.find(
      (item) => item.label === subtitleItemsLabel,
    )?.value

    // Generated speech stays local even if another track enabled translation.
    if (subtitleItemsValue === AI_SUBTITLE_VALUE) {
      this.rows = [...(this.subtitleCache.get(`custom-${AI_SUBTITLE_VALUE}`)?.rows ?? [])]
      this.listenVideoEvents()
      this.showSubtitle = this.rows.length > 0
      return
    }

    await (async () => {
      if (!subtitleData && subtitleItemsValue) {
        const [err, subtitleRows] = await tryCatch(() => {
          const cache = this.subtitleCache.get(`custom-${subtitleItemsValue}`)
          if (cache) return cache.rows
          return this.loadSubtitle(subtitleItemsValue)
        })

        if (err || !subtitleRows || !subtitleRows.length) {
          toast.error(t('error.subtitleLoad'))
          return
        }

        if (this.translateMode !== 'none') {
          const [err, translatedTexts] = await tryCatch(() =>
            googleTranslate(
              subtitleRows.map((row) => row.text),
              getNowLang(),
            ),
          )
          if (!err) {
            switch (this.translateMode) {
              case 'single':
                subtitleData = {
                  rows: subtitleRows.map((d, i) => {
                    return {
                      ...d,
                      text: translatedTexts[i],
                      htmlText: translatedTexts[i],
                    }
                  }),
                }
                return
              case 'double':
                subtitleData = {
                  rows: subtitleRows.map((d, i) => {
                    return {
                      ...d,
                      text: `${d.text}\n${translatedTexts[i]}`,
                      htmlText: `${d.text}\n${translatedTexts[i]}`,
                    }
                  }),
                }
                return
            }
          } else {
            toast.error(t('error.translateFail'))
          }
        }

        subtitleData = { rows: subtitleRows }
      }
    })()

    if (generation !== this.trackGeneration) return
    if (subtitleData) {
      this.rows = [...subtitleData.rows]

      this.subtitleCache.set(
        `${subtitleItemsLabel}-${translateMode}`,
        subtitleData,
      )
    }

    this.listenVideoEvents()
    this.showSubtitle = this.rows.length > 0
  }

  async loadSubtitle(value: string): Promise<SubtitleRow[]> {
    return []
  }

  reset() {
    this.lifecycleGeneration++
    this.initd = false
    this.nowSubtitleItemsLabel = ''
    this.subtitleItems.length = 0
    this.subtitleCache.clear()
    this.resetSubtitleState()
    this.emit('reset')
  }

  resetSubtitleState() {
    this.trackGeneration++
    runInAction(() => {
      this.snapshot = { current: [], history: [] }
    })
    // this.unListenRows()
    this.videoUnListen()
    this.rows.length = 0
    this.rowIndex = 0
    this.activeRows.clear()
    this.activeSubtitleLabel = ''
    this.showSubtitle = false
  }
}

export class CommonSubtitleManager extends SubtitleManager {
  constructor() {
    super()
  }
  override async loadSubtitle(value: string): Promise<SubtitleRow[]> {
    return []
  }
}

export default SubtitleManager
