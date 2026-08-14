export type SubtitleItem = {
  label: string
  value: string
}

export type SubtitleRow = {
  id: string

  startTime: number
  endTime: number

  text: string
  /**给Html用的 */
  htmlText: string

  x?: number
  y?: number
}

export type SubtitleManagerEvents = {
  'row-enter': SubtitleRow
  'row-leave': SubtitleRow
  reset: void
}

export type NetworkSubtitlePart = {
  page: number
  cid: string
  label: string
}

export type NetworkSubtitleTrack = {
  /**展示在轨道选择器以及导入后的字幕名称 */
  label: string
  /**实际字幕文件或 B 站字幕 JSON 地址 */
  value: string
}

export type NetworkSubtitleProbe = {
  sourceLabel: string
  parts: NetworkSubtitlePart[]
  selectedPart?: number
  needsPartSelection: boolean
  tracks: NetworkSubtitleTrack[]
}
