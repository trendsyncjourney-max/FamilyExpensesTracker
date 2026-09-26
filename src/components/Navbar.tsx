import { Link, NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'

const links = [
  { to: '/', label: 'Home' },
  { to: '/records', label: 'Records' },
  { to: '/requests', label: 'Requests' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/personal', label: 'Personal' },
  { to: '/more', label: 'More' },
]

export default function Navbar() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-hearth-line bg-hearth-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2" aria-label="Hearth home">
          <img src="/logo.svg" alt="Hearth" className="h-7 w-7" />
          <span className="font-display text-xl font-semibold tracking-tight text-hearth-ink">
            Hearth
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                  isActive
                    ? 'bg-hearth-accentSoft text-hearth-accent'
                    : 'text-hearth-ink2 hover:text-hearth-ink',
                  l.label === 'Personal' && !isActive && 'hover:text-hearth-personal',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* AUTH-SLOT: wired to useAuth() per the backend graft contract */}
        {isLoading ? (
          <div className="h-9 w-24 animate-pulse rounded-xl bg-hearth-surface2" aria-hidden />
        ) : isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            <span className="hidden max-w-32 truncate text-sm font-medium text-hearth-ink sm:inline">
              {user.name ?? user.email ?? 'Member'}
            </span>
            {user.avatar ? (
              <img
                src={user.avatar}
                alt=""
                className="h-8 w-8 rounded-full border border-hearth-line object-cover"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hearth-accentSoft text-sm font-semibold text-hearth-accent">
                {(user.name ?? 'H').slice(0, 1).toUpperCase()}
              </span>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-xl border border-hearth-line px-3 py-2 text-sm font-semibold text-hearth-ink2 transition-colors hover:text-hearth-ink"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            to={LOGIN_PATH}
            className="rounded-xl bg-hearth-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
