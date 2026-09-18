import Browser from 'webextension-polyfill'
// const Browser = chrome

Browser.storage.local.onChanged.addListener((changes: any) => {
  Object.keys(changes).forEach((key) => {
    localCallbacksMap[key]?.slice().forEach((cb) => cb(changes[key].newValue))
  })
})
const localCallbacksMap: Record<string, ((v: any) => void)[]> = {}
export function useBrowserLocalStorage<
  T extends (string & { __key: any }) | string,
>(
  key: T,
  callback: (
    val: (T extends string & { __key: any } ? T['__key'] : any) | undefined,
  ) => void,
) {
  if (!localCallbacksMap[key]) {
    localCallbacksMap[key] = []
  }
  let active = true
  let changed = false
  const listener = (value: any) => {
    if (!active) return
    changed = true
    callback(value)
  }
  localCallbacksMap[key].push(listener)
  Browser.storage.local
    .get(key)
    .then(({ [key as any]: val }) => {
      if (active && !changed) callback(val)
    })
    .catch(console.warn)
  return () => {
    active = false
    const index = localCallbacksMap[key].indexOf(listener)
    if (index >= 0) localCallbacksMap[key].splice(index, 1)
  }
}

export function setBrowserLocalStorage<
  T extends (string & { __key: any }) | string,
>(key: T, value: T extends string & { __key: any } ? T['__key'] : any) {
  return Browser.storage.local.set({ [key]: value })
}

export function getBrowserLocalStorage<
  T extends (string & { __key: any }) | string,
>(key: T) {
  return Browser.storage.local
    .get(key)
    .then(
      ({ [key as any]: val }) =>
        val as
          | (T extends string & { __key: any } ? T['__key'] : any)
          | undefined,
    )
}

Browser.storage.sync.onChanged.addListener((changes: any) => {
  Object.keys(changes).forEach((key) => {
    syncCallbacksMap[key]?.slice().forEach((cb) => cb(changes[key].newValue))
  })
})
const syncCallbacksMap: Record<string, ((v: any) => void)[]> = {}
export function useBrowserSyncStorage<
  T extends (string & { __key: any }) | string,
>(
  key: T,
  callback: (
    val: (T extends string & { __key: any } ? T['__key'] : any) | undefined,
  ) => void,
) {
  if (!syncCallbacksMap[key]) {
    syncCallbacksMap[key] = []
  }
  let active = true
  let changed = false
  const listener = (value: any) => {
    if (!active) return
    changed = true
    callback(value)
  }
  syncCallbacksMap[key].push(listener)
  Browser.storage.sync
    .get(key)
    .then(({ [key as any]: val }) => {
      if (active && !changed) callback(val)
    })
    .catch(console.warn)
  return () => {
    active = false
    const index = syncCallbacksMap[key].indexOf(listener)
    if (index >= 0) syncCallbacksMap[key].splice(index, 1)
  }
}

export function setBrowserSyncStorage<
  T extends (string & { __key: any }) | string,
>(key: T, value: T extends string & { __key: any } ? T['__key'] : any) {
  return Browser.storage.sync.set({ [key]: value })
}

export function getBrowserSyncStorage<
  T extends (string & { __key: any }) | string,
>(key: T) {
  return Browser.storage.sync
    .get(key)
    .then(
      ({ [key as any]: val }) =>
        val as
          | (T extends string & { __key: any } ? T['__key'] : any)
          | undefined,
    )
}
