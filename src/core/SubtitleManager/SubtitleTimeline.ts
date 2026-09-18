import type { SubtitleRow } from './types'

export type SubtitleSnapshot = {
  current: SubtitleRow[]
  history: SubtitleRow[]
}

/** Time is the input, not previously played events. Safe for arbitrary seeks. */
export class SubtitleTimeline {
  readonly rows: SubtitleRow[]
  private readonly maximumEnd: number[] = []
  private readonly endedRows: SubtitleRow[]

  constructor(rows: SubtitleRow[]) {
    this.rows = rows
      .filter(
        (row) =>
          row &&
          typeof row.text === 'string' &&
          Number.isFinite(row.startTime) &&
          Number.isFinite(row.endTime) &&
          row.endTime > row.startTime &&
          row.text.trim(),
      )
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
    this.endedRows = this.rows.slice().sort((a, b) => a.endTime - b.endTime)
    let end = -Infinity
    this.rows.forEach((row) => {
      end = Math.max(end, row.endTime)
      this.maximumEnd.push(end)
    })
  }

  at(time: number, historyLimit = 5): SubtitleSnapshot {
    historyLimit = Number.isFinite(historyLimit)
      ? Math.min(5, Math.max(0, Math.floor(historyLimit)))
      : 5
    const current: SubtitleRow[] = [],
      history: SubtitleRow[] = []
    if (!Number.isFinite(time)) return { current, history }
    let low = 0,
      high = this.rows.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (this.rows[mid].startTime <= time) low = mid + 1
      else high = mid
    }
    for (let i = low - 1; i >= 0; i--) {
      const row = this.rows[i]
      if (row.endTime > time) current.unshift(row)
      if (i === 0 || this.maximumEnd[i - 1] <= time) break
    }
    low = 0
    high = this.endedRows.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (this.endedRows[mid].endTime <= time) low = mid + 1
      else high = mid
    }
    history.push(...this.endedRows.slice(Math.max(0, low - historyLimit), low))
    return { current, history }
  }
}
