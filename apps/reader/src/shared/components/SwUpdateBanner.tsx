import { useRegisterSW } from 'virtual:pwa-register/react'

export function SwUpdateBanner() {
    const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()

    if (!needRefresh) return null

    return (
        <div
            role="alert"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 50,
                backgroundColor: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.875rem',
            }}
        >
            <span style={{ color: 'var(--color-text)' }}>Có phiên bản mới.</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                    onClick={() => updateServiceWorker(true)}
                    style={{
                        backgroundColor: 'var(--color-accent)',
                        color: '#F5EDD6',
                        border: 'none',
                        padding: '0.375rem 0.75rem',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                    }}
                >
                    Tải lại
                </button>
                <button
                    onClick={() => setNeedRefresh(false)}
                    style={{
                        background: 'none',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-muted)',
                        padding: '0.375rem 0.5rem',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                    }}
                >
                    ✕
                </button>
            </div>
        </div>
    )
}
