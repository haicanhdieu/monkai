import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import type { ReadingTheme } from '@/stores/settings.store'

const THEME_CLASSES: ReadingTheme[] = ['sepia', 'light', 'dark']

export function useTheme() {
  const theme = useSettingsStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    THEME_CLASSES.forEach((t) => root.classList.remove(`theme-${t}`))
    root.classList.add(`theme-${theme}`)
  }, [theme])
}
