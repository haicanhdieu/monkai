import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SettingsPage from './SettingsPage'

vi.mock('./FontSizeControl', () => ({
  FontSizeControl: () => <div data-testid="font-size-control">FontSizeControl</div>,
}))

vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}))

vi.mock('./OfflineStorageInfo', () => ({
  OfflineStorageInfo: () => <div data-testid="offline-storage-info">OfflineStorageInfo</div>,
}))

describe('SettingsPage', () => {
  it('renders page title', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Cài Đặt')).toBeInTheDocument()
  })

  it('renders FontSizeControl', () => {
    render(<SettingsPage />)
    expect(screen.getByTestId('font-size-control')).toBeInTheDocument()
  })

  it('renders ThemeToggle', () => {
    render(<SettingsPage />)
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument()
  })

  it('renders OfflineStorageInfo', () => {
    render(<SettingsPage />)
    expect(screen.getByTestId('offline-storage-info')).toBeInTheDocument()
  })
})
