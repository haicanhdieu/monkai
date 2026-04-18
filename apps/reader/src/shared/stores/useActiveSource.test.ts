import { describe, it, expect, beforeEach } from 'vitest'
import { useActiveSource } from '@/shared/stores/useActiveSource'

beforeEach(() => {
  useActiveSource.setState({ activeSource: 'vbeta' })
})

describe('useActiveSource store', () => {
  it('has default active source of vbeta', () => {
    expect(useActiveSource.getState().activeSource).toBe('vbeta')
  })

  it('setActiveSource updates to vnthuquan', () => {
    useActiveSource.getState().setActiveSource('vnthuquan')
    expect(useActiveSource.getState().activeSource).toBe('vnthuquan')
  })

  it('setActiveSource can switch back to vbeta', () => {
    useActiveSource.getState().setActiveSource('vnthuquan')
    useActiveSource.getState().setActiveSource('vbeta')
    expect(useActiveSource.getState().activeSource).toBe('vbeta')
  })
})
