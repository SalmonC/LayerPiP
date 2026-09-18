import { makeObservable, observable, runInAction } from 'mobx'

export type AddonKind = 'subtitle' | 'danmaku'

/** Runtime-only recovery for the active player; never writes configuration. */
class AddonRecovery {
  available = false
  errors: Record<AddonKind, string> = { subtitle: '', danmaku: '' }
  busy: Record<AddonKind, boolean> = { subtitle: false, danmaku: false }
  revision: Record<AddonKind, number> = { subtitle: 0, danmaku: 0 }
  private source?: HTMLVideoElement
  private handlers?: Record<AddonKind, () => void | Promise<void>>
  private generation = 0

  constructor() {
    makeObservable(this, {
      available: observable,
      errors: observable,
      busy: observable,
      revision: observable,
    })
  }
  bind(
    source: HTMLVideoElement,
    handlers: Record<AddonKind, () => void | Promise<void>>,
  ) {
    const generation = ++this.generation
    this.source = source
    this.handlers = handlers
    runInAction(() => {
      this.available = true
      this.revision.subtitle++
      this.revision.danmaku++
      this.errors = { subtitle: '', danmaku: '' }
      this.busy = { subtitle: false, danmaku: false }
    })
    return () => {
      if (generation !== this.generation) return
      this.generation++
      this.source = undefined
      this.handlers = undefined
      runInAction(() => {
        this.available = false
        this.errors = { subtitle: '', danmaku: '' }
        this.busy = { subtitle: false, danmaku: false }
      })
    }
  }
  report(
    source: HTMLVideoElement | undefined,
    kind: AddonKind,
    error: unknown,
  ) {
    if (!this.available || source !== this.source) return
    runInAction(() => {
      this.errors[kind] = error instanceof Error ? error.message : String(error)
    })
  }
  async retry(kind: AddonKind) {
    if (!this.handlers || this.busy[kind]) return
    const generation = this.generation
    const handler = this.handlers[kind]
    runInAction(() => {
      this.busy[kind] = true
      this.errors[kind] = ''
    })
    try {
      await handler()
    } catch (error) {
      if (generation === this.generation) this.report(this.source, kind, error)
    } finally {
      if (generation === this.generation)
        runInAction(() => {
          this.busy[kind] = false
          this.revision[kind]++
        })
    }
  }
}
export const addonRecovery = new AddonRecovery()
