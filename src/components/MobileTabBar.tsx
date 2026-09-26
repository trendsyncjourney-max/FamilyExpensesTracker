import { Link, NavLink } from 'react-router'
import { CalendarDays, HandCoins, Home, Plus, ReceiptText, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/providers/trpc'

/**
 * Mobile bottom tab bar (design.md §6): 5 destinations with a center-raised
 * Add action linking to /records/new. Desktop keeps the top Navbar pills.
 */
const tabs = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/records', label: 'Records', icon: ReceiptText },
  { to: '/requests', label: 'Requests', icon: HandCoins, badge: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/personal', label: 'Personal', icon: UserRound },
] as const

function useRequestsBadge() {
  const { isAuthenticated } = useAuth()
  const opts = { enabled: isAuthenticated, retry: false } as const
  const unread = trpc.notification.unreadCount.useQuery(undefined, opts)
  const reimbInbox = trpc.reimbursement.inbox.useQuery(undefined, opts)
  const advInbox = trpc.advance.inbox.useQuery(undefined, opts)

  if (!isAuthenticated) return 0
  const pendingReimb = (reimbInbox.data ?? []).filter((r) => r.status === 'submitted').length
  const pendingAdv = (advInbox.data ?? []).filter((a) => a.status === 'submitted').length
  return (unread.data ?? 0) + pendingReimb + pendingAdv
}

export default function MobileTabBar() {
  const badge = useRequestsBadge()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-hearth-line bg-hearth-bg/95 backdrop-blur-md md:hidden"
      aria-label="Primary mobile"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* 6 positions: 2 tabs + center Add + 3 tabs — one column each, no wrapping */}
      <div className="relative grid grid-cols-6">
        {tabs.slice(0, 2).map((t) => (
          <TabItem key={t.to} tab={t} badge={0} />
        ))}
        {/* Center-raised Add action */}
        <div className="relative flex items-start justify-center">
          <Link
            to="/records/new"
            aria-label="Add record"
            className="absolute -top-5 flex h-12 w-12 items-center justify-center rounded-full bg-hearth-accent text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </Link>
          <span className="mt-8 pb-1 text-[11px] font-semibold tracking-wide text-hearth-ink2">
            Add
          </span>
        </div>
        {tabs.slice(2).map((t) => (
          <TabItem key={t.to} tab={t} badge={'badge' in t ? badge : 0} />
        ))}
      </div>
    </nav>
  )
}

function TabItem({
  tab,
  badge,
}: {
  tab: (typeof tabs)[number]
  badge: number
}) {
  const Icon = tab.icon
  return (
    <NavLink
      to={tab.to}
      end={'end' in tab ? tab.end : false}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-0.5 px-1 pb-1 pt-2 text-[11px] font-semibold tracking-wide transition-colors',
          isActive ? 'text-hearth-accent' : 'text-hearth-ink2 hover:text-hearth-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <Icon className="h-5 w-5" />
            {badge > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-hearth-rose px-1 text-[10px] font-bold leading-none text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </span>
          {tab.label}
          <span
            className={cn(
              'h-0.5 w-6 rounded-full transition-colors',
              isActive ? 'bg-hearth-accent' : 'bg-transparent',
            )}
            aria-hidden
          />
        </>
      )}
    </NavLink>
  )
}
