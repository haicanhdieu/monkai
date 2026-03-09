import { useState, useEffect } from 'react'

function getInitialOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(getInitialOnline)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
