// import Events from 'events'
import mitt, { WildcardHandler, Handler } from 'mitt'

export default class Events2<Events extends Record<string, unknown>> {
  mitt = mitt<Events>()
  private owned = new Map<any, Set<any>>()

  on<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>): void
  on(type: '*', handler: WildcardHandler<Events>): void
  on(type: any, handler: any) {
    if (!this.owned.has(type)) this.owned.set(type, new Set())
    this.owned.get(type)!.add(handler)
    return this.mitt.on(type, handler)
  }
  on2<Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>,
  ): () => void {
    this.on(type as any, handler as any)
    return () => {
      this.off(type as any, handler as any)
    }
  }

  addEventListener<Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>,
  ): () => void {
    this.on(type as any, handler as any)
    return () => {
      this.off(type as any, handler as any)
    }
  }
  removeEventListener<Key extends keyof Events>(
    type: Key,
    handler?: Handler<Events[Key]>,
  ) {
    return this.off(type, handler)
  }

  emit<Key extends keyof Events>(type: Key, event: Events[Key]): void
  emit<Key extends keyof Events>(
    type: undefined extends Events[Key] ? Key : never,
  ): void
  emit(type: any, event?: any) {
    return this.mitt.emit(type, event)
  }

  off<Key extends keyof Events>(type: Key, handler?: Handler<Events[Key]>): void
  off(type: '*', handler: WildcardHandler<Events>): void
  off(type: any, handler: any) {
    if (handler) {
      this.owned.get(type)?.delete(handler)
      this.mitt.off(type, handler)
    } else {
      this.owned.get(type)?.forEach((fn) => this.mitt.off(type, fn))
      this.owned.delete(type)
    }
  }
  offAll() {
    for (const [type, handlers] of this.owned) {
      for (const handler of handlers) this.mitt.off(type, handler)
    }
    this.owned.clear()
  }
}
