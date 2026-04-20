const DB_NAME = 'evilquest-thumb-cache'
const STORE = 'thumbs'

let _dbPromise = null

function openDb() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB not available'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((err) => {
    _dbPromise = null
    throw err
  })
  return _dbPromise
}

export async function getCachedThumb(path, version) {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(path)
      req.onsuccess = () => {
        const val = req.result
        resolve(val && val.v === version ? val.dataUrl : null)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function putCachedThumb(path, dataUrl, version) {
  try {
    const db = await openDb()
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ dataUrl, v: version }, path)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    // ignore
  }
}

export async function clearThumbCache() {
  try {
    const db = await openDb()
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    // ignore
  }
}
