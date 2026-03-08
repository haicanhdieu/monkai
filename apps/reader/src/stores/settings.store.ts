import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

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

export const useSettingsStore = create<SettingsState>()(
  immer((set) => ({
    ...DEFAULT_SETTINGS,
    setFontSize: (value) =>
      set((state) => {
        state.fontSize = value
      }),
    setTheme: (theme) =>
      set((state) => {
        state.theme = theme
      }),
    hydrate: (settings) =>
      set((state) => {
        state.fontSize = settings.fontSize
        state.theme = settings.theme
      }),
    reset: () =>
      set((state) => {
        state.fontSize = DEFAULT_SETTINGS.fontSize
        state.theme = DEFAULT_SETTINGS.theme
      }),
  }))
)
