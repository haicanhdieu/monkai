import { NavLink } from 'react-router-dom'
import { ROUTES } from '@/shared/constants/routes'
import { HomeIcon, ReaderIcon, BookmarkIcon, GearIcon } from '@radix-ui/react-icons'

const tabs = [
    { label: 'Trang Chủ', to: ROUTES.HOME, icon: <HomeIcon className="w-5 h-5" /> },
    { label: 'Thư Viện', to: ROUTES.LIBRARY, icon: <ReaderIcon className="w-5 h-5" /> },
    { label: 'Đánh Dấu', to: ROUTES.BOOKMARKS, icon: <BookmarkIcon className="w-5 h-5" /> },
    { label: 'Cài Đặt', to: ROUTES.SETTINGS, icon: <GearIcon className="w-5 h-5" /> },
]

export function BottomNav() {
    return (
        <nav
            className="fixed bottom-0 left-0 right-0 border-t flex z-40 bg-[var(--color-surface)] border-[var(--color-border)]"
            aria-label="Bottom navigation"
        >
            {tabs.map(({ label, to, icon }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={to === ROUTES.HOME}
                    className={({ isActive }) =>
                        `flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs transition-colors ${isActive
                            ? 'text-[var(--color-accent)]'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`
                    }
                    aria-label={label}
                >
                    <div className="mb-1" aria-hidden="true">{icon}</div>
                    <span>{label}</span>
                </NavLink>
            ))}
        </nav>
    )
}
