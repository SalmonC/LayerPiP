/** Site behavior is attached to a surface, never inserted into its prototype. */
export interface SiteAdapter {
  onInit(): void
  onPlayerInitd(): void | Promise<void>
  retryDanmaku?(): void | Promise<void>
  onUnload(): void
}
