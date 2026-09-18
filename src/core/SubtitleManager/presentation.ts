import type { SubtitleSnapshot } from './SubtitleTimeline'

export function subtitleParagraphs(
  snapshot: SubtitleSnapshot,
  enabled: boolean,
  count: number,
) {
  const limit = Number.isFinite(count)
    ? Math.max(1, Math.min(5, Math.round(count)))
    : 2
  return [
    ...(enabled
      ? snapshot.history.slice(-limit).map((row) => ({ row, history: true }))
      : []),
    ...snapshot.current.map((row) => ({ row, history: false })),
  ]
}
