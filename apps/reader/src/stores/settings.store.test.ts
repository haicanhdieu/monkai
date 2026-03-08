import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSettingsStore } from './settings.store'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'

const { mockSetItem } = vi.hoisted(() => ({ mockSetItem: vi.fn() }))
vi.mock('@/shared/services/storage.service', () => ({
  storageService: { setItem: mockSetItem },
}))

describe('settings.store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ fontSize: 18, theme: 'sepia' })
  })

  describe('setFontSize', () => {
    it('updates fontSize in store', () => {
      useSettingsStore.getState().setFontSize(20)
      expect(useSettingsStore.getState().fontSize).toBe(20)
    })

    it('persists merged { fontSize, theme } to storage silently (AC 4)', () => {
      useSettingsStore.getState().setFontSize(22)
      expect(mockSetItem).toHaveBeenCalledWith(STORAGE_KEYS.USER_SETTINGS, {
        fontSize: 22,
        theme: 'sepia',
      })
    })

    it('reads current theme from store when persisting (not a stale closure)', () => {
      useSettingsStore.setState({ theme: 'dark' })
      useSettingsStore.getState().setFontSize(24)
      expect(mockSetItem).toHaveBeenCalledWith(STORAGE_KEYS.USER_SETTINGS, {
        fontSize: 24,
        theme: 'dark',
      })
    })
  })

  describe('setTheme', () => {
    it('updates theme in store', () => {
      useSettingsStore.getState().setTheme('dark')
      expect(useSettingsStore.getState().theme).toBe('dark')
    })

    it('persists merged { fontSize, theme } to storage silently', () => {
      useSettingsStore.getState().setTheme('light')
      expect(mockSetItem).toHaveBeenCalledWith(STORAGE_KEYS.USER_SETTINGS, {
        fontSize: 18,
        theme: 'light',
      })
    })

    it('reads current fontSize from store when persisting', () => {
      useSettingsStore.setState({ fontSize: 22 })
      useSettingsStore.getState().setTheme('dark')
      expect(mockSetItem).toHaveBeenCalledWith(STORAGE_KEYS.USER_SETTINGS, {
        fontSize: 22,
        theme: 'dark',
      })
    })
  })

  describe('hydrate', () => {
    it('restores fontSize and theme from persisted settings', () => {
      useSettingsStore.getState().hydrate({ fontSize: 24, theme: 'light' })
      const state = useSettingsStore.getState()
      expect(state.fontSize).toBe(24)
      expect(state.theme).toBe('light')
    })

    it('falls back to default fontSize when stored value is out of range', () => {
      useSettingsStore.getState().hydrate({ fontSize: -99 as number, theme: 'dark' })
      expect(useSettingsStore.getState().fontSize).toBe(18)
      expect(useSettingsStore.getState().theme).toBe('dark')
    })

    it('falls back to default theme when stored value is invalid', () => {
      useSettingsStore.getState().hydrate({ fontSize: 20, theme: 'blue' as never })
      expect(useSettingsStore.getState().fontSize).toBe(20)
      expect(useSettingsStore.getState().theme).toBe('sepia')
    })

    it('falls back to all defaults when stored values are completely invalid', () => {
      useSettingsStore.getState().hydrate({ fontSize: 9999 as number, theme: 'invalid' as never })
      const state = useSettingsStore.getState()
      expect(state.fontSize).toBe(18)
      expect(state.theme).toBe('sepia')
    })
  })
})
