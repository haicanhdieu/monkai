import localforage from 'localforage'

export interface StorageService {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T): Promise<void>
  removeItem(key: string): Promise<void>
}

export class LocalforageStorageService implements StorageService {
  async getItem<T>(key: string): Promise<T | null> {
    return localforage.getItem<T>(key)
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      await localforage.setItem(key, value)
    } catch (err) {
      console.error('[StorageService] setItem failed:', err)
      // Do NOT rethrow — UI must continue with in-memory state
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await localforage.removeItem(key)
    } catch (err) {
      console.error('[StorageService] removeItem failed:', err)
    }
  }
}

export const storageService = new LocalforageStorageService()
