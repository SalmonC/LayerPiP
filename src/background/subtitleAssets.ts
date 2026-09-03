import type { SubtitleAsset } from '@root/core/SubtitleSource/types'
import WebextEvent from '@root/shared/webextEvent'
import { onMessage } from 'webext-bridge/background'

const DATABASE_NAME = 'floatcaption'
const DATABASE_VERSION = 1
const STORE_NAME = 'subtitle-assets'

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = operation(transaction.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

onMessage(WebextEvent.putSubtitleAsset, async ({ data }) => {
  const asset = data as SubtitleAsset
  await runRequest('readwrite', (store) => store.put(asset))
  return { id: asset.id }
})

onMessage(WebextEvent.getSubtitleAsset, async ({ data }) => {
  const asset = await runRequest<SubtitleAsset | undefined>(
    'readonly',
    (store) => store.get(data.id),
  )
  return asset ?? null
})

onMessage(WebextEvent.deleteSubtitleAsset, async ({ data }) => {
  const { id } = data as { id: string }
  await runRequest('readwrite', (store) => store.delete(id))
  return { id }
})
