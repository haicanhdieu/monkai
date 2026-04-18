import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SourceId } from '@/shared/constants/sources'
import { DEFAULT_SOURCE, SOURCES } from '@/shared/constants/sources'

const VALID_SOURCE_IDS = new Set<string>(SOURCES.map((s) => s.id))

function isValidSourceId(value: unknown): value is SourceId {
  return typeof value === 'string' && VALID_SOURCE_IDS.has(value)
}

interface ActiveSourceState {
  activeSource: SourceId
  setActiveSource: (source: SourceId) => void
}

export const useActiveSource = create<ActiveSourceState>()(
  persist(
    (set) => ({
      activeSource: DEFAULT_SOURCE,
      setActiveSource: (source) => set({ activeSource: source }),
    }),
    {
      name: 'active-source',
      merge: (persisted, current) => ({
        ...current,
        activeSource: isValidSourceId((persisted as Partial<ActiveSourceState>)?.activeSource)
          ? (persisted as ActiveSourceState).activeSource
          : DEFAULT_SOURCE,
      }),
    }
  )
)
