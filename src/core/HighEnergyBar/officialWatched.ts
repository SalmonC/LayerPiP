/**
 * 读取 B 站自己的「已看」记录。
 *
 * B 站播放器把已看区间存在**页面源**的 IndexedDB 里（实测确认）：
 * - 库名 `pbp3`（官方代码是 `indexedDB.open("pbp" + version)`，version=3）
 * - 对象存储 `pbpZebraCache`，`keyPath: "cid"`
 * - 记录形如 `{cid, data: [[startRatio, endRatio], ...], expire}`
 *   —— `data` 里是**相对时长的比例（0–1）**，不是秒；
 * - 到期时间 30 天；字段名当前实现用 `expire`，历史库 pbp-3.6.2 用 `expireTime`。
 *
 * 内容脚本与页面同源，所以可以直接读；但**只读**：
 * - 不写入、不修改，避免污染用户数据或与官方逻辑打架；
 * - 库不存在时**不能创建**——`indexedDB.open()` 在库缺失时会顺手建一个空库，
 *   所以先用 `indexedDB.databases()` 探测，并在 `onupgradeneeded` 里中止升级兜底。
 */

const DB_NAME = 'pbp3'
const STORE_NAME = 'pbpZebraCache'

interface OfficialRecord {
  cid?: number | string
  data?: unknown
  expire?: number
  expireTime?: number
}

/** 探测库是否存在；返回 undefined 表示当前环境不支持探测（此时直接尝试打开）。 */
async function probeDatabase(name: string): Promise<boolean | undefined> {
  try {
    if (typeof indexedDB.databases !== 'function') return undefined
    const list = await indexedDB.databases()
    if (!Array.isArray(list)) return undefined
    return list.some((entry) => entry?.name === name)
  } catch {
    return undefined
  }
}

/** 以只读方式打开已存在的库；库不存在时返回 null 且**不留下空库**。 */
function openExistingDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (db: IDBDatabase | null) => {
      if (settled) {
        db?.close()
        return
      }
      settled = true
      resolve(db)
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME)
    } catch {
      finish(null)
      return
    }
    request.onupgradeneeded = () => {
      // 只有库不存在时才会走到这里：中止升级，避免创建副作用空库。
      try {
        request.transaction?.abort()
      } catch {
        /* 中止失败也不影响：下面的 onerror/onblocked 会兜底 */
      }
      finish(null)
    }
    request.onsuccess = () => finish(request.result)
    request.onerror = () => finish(null)
    request.onblocked = () => finish(null)
  })
}

function getRecord(
  db: IDBDatabase,
  key: number | string,
): Promise<OfficialRecord | undefined> {
  return new Promise((resolve) => {
    try {
      const store = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
      const request = store.get(key)
      request.onsuccess = () =>
        resolve(request.result as OfficialRecord | undefined)
      request.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

/**
 * 把官方记录转成**秒**级区间。
 * 会校验：到期时间、数值有限、`0 <= start < end <= 1`。
 * 官方缓存里存在未合并的重叠区间，这里只做校验不做合并——合并由调用方统一处理。
 */
export function parseOfficialRecord(
  record: OfficialRecord | undefined,
  duration: number,
): [number, number][] {
  if (!record || !Array.isArray(record.data)) return []
  if (!Number.isFinite(duration) || duration <= 0) return []

  const expire = record.expire ?? record.expireTime
  if (typeof expire === 'number' && expire > 0 && expire < Date.now()) return []

  const out: [number, number][] = []
  for (const item of record.data as unknown[]) {
    if (!Array.isArray(item) || item.length < 2) continue
    const start = Number(item[0])
    const end = Number(item[1])
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (start < 0 || end <= start || end > 1.001) continue
    out.push([start * duration, Math.min(end, 1) * duration])
  }
  return out
}

/**
 * 读取某个 cid 的官方已看区间（秒）。
 * 任何异常、库缺失、记录缺失都返回空数组，调用方据此回退到自己的记录。
 *
 * @param duration 必须已知且有效：官方存的是比例，需要用它换算成秒。
 */
export async function readOfficialWatchedRanges(
  cid: string,
  duration: number,
): Promise<[number, number][]> {
  if (!cid || !Number.isFinite(duration) || duration <= 0) return []

  const exists = await probeDatabase(DB_NAME)
  if (exists === false) return []

  const db = await openExistingDatabase()
  if (!db) return []

  try {
    if (!db.objectStoreNames.contains(STORE_NAME)) return []
    // keyPath 是 cid，官方写入的是数字；这里两种形式都试一次。
    const numeric = /^\d+$/.test(cid) ? Number(cid) : null
    let record = numeric === null ? undefined : await getRecord(db, numeric)
    if (!record) record = await getRecord(db, cid)
    return parseOfficialRecord(record, duration)
  } catch {
    return []
  } finally {
    db.close()
  }
}
