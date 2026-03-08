import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'

export type ReadingTheme = 'sepia' | 'light' | 'dark'

export interface UserSettings {
  fontSize: number
  theme: ReadingTheme
}

interface SettingsState {
  fontSize: number
  theme: ReadingTheme
  setFontSize: (value: number) => void
  setTheme: (theme: ReadingTheme) => void
  hydrate: (settings: UserSettings) => void
  reset: () => void
}

const DEFAULT_SETTINGS: UserSettings = {
  fontSize: 18,
  theme: 'sepia',
}

const VALID_THEMES: ReadingTheme[] = ['sepia', 'light', 'dark']
const FONT_SIZE_MIN = 14
const FONT_SIZE_MAX = 28

function sanitizeSettings(raw: Partial<UserSettings>): UserSettings {
  const fontSize =
    typeof raw.fontSize === 'number' &&
    raw.fontSize >= FONT_SIZE_MIN &&
    raw.fontSize <= FONT_SIZE_MAX
      ? raw.fontSize
      : DEFAULT_SETTINGS.fontSize
  const theme =
    raw.theme !== undefined && VALID_THEMES.includes(raw.theme)
      ? raw.theme
      : DEFAULT_SETTINGS.theme
  return { fontSize, theme }
}

export const useSettingsStore = create<SettingsState>()(
  immer((set, get) => ({
    ...DEFAULT_SETTINGS,
    setFontSize: (value) => {
      set((state) => {
        state.fontSize = value
      })
      void storageService.setItem(STORAGE_KEYS.USER_SETTINGS, {
        fontSize: value,
        theme: get().theme,
      })
    },
    setTheme: (theme) => {
      set((state) => {
        state.theme = theme
      })
      void storageService.setItem(STORAGE_KEYS.USER_SETTINGS, {
        fontSize: get().fontSize,
        theme,
      })
    },
    hydrate: (settings) => {
      const safe = sanitizeSettings(settings)
      set((state) => {
        state.fontSize = safe.fontSize
        state.theme = safe.theme
      })
    },
    reset: () =>
      set((state) => {
        state.fontSize = DEFAULT_SETTINGS.fontSize
        state.theme = DEFAULT_SETTINGS.theme
      }),
  }))
)
