import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ShoppingBasket,
  Car,
  House,
  BusFront,
  GraduationCap,
  UtensilsCrossed,
  HeartPulse,
  Shirt,
  Sparkles,
  ReceiptText,
  Tag,
  AlertTriangle,
  LogIn,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'
import { cn } from '@/lib/utils'

export const SETTLE_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export const eur = (cents: number, currency = 'EUR') =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)

export type ExpenseStatus = 'draft' | 'posted' | 'disputed' | 'resolved' | 'voided'

const statusMap: Record<ExpenseStatus, { label: string; cls: string; pulse?: boolean }> = {
  draft: { label: 'Not sent yet', cls: 'text-hearth-ink2 bg-hearth-surface2' },
  posted: { label: 'Paid ✓ Cleared', cls: 'text-hearth-accent bg-hearth-accentSoft' },
  disputed: { label: 'Needs changes', cls: 'text-hearth-rose bg-hearth-rose/10', pulse: true },
  resolved: { label: 'Approved — awaiting payment', cls: 'text-hearth-blue bg-hearth-blue/10' },
  voided: { label: 'Voided', cls: 'text-hearth-ink2 bg-hearth-surface2' },
}

export function ExpenseStatusChip({ status }: { status: string }) {
  const s = statusMap[(status as ExpenseStatus)] ?? statusMap.posted
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        s.cls,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', s.pulse && 'animate-pulse-dot')} />
      {s.label}
    </span>
  )
}

export function ReturnStatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    return_initiated: { label: 'Return in progress', cls: 'text-hearth-blue bg-hearth-blue/10' },
    partially_refunded: { label: 'Partially refunded', cls: 'text-hearth-accent bg-hearth-accentSoft' },
    fully_refunded: { label: 'Fully refunded', cls: 'text-hearth-accent bg-hearth-accentSoft' },
    return_rejected: { label: 'Return rejected', cls: 'text-hearth-rose bg-hearth-rose/10' },
  }
  const s = map[status]
  if (!s) return null
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', s.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  )
}

export function LedgerDivider({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="ledger-divider flex-1">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
          {label}
        </span>
        <span className="ledger-diamond" />
      </div>
      {action}
    </div>
  )
}

const categoryIcons: [RegExp, LucideIcon][] = [
  [/grocer|supermarket|food market/i, ShoppingBasket],
  [/restaurant|dining|food|cafe|coffee/i, UtensilsCrossed],
  [/transport|fuel|car|parking|taxi/i, Car],
  [/transit|bus|train|metro|travel/i, BusFront],
  [/home|rent|mortgage|utilit|electric|hardware/i, House],
  [/school|kids|education|child/i, GraduationCap],
  [/health|pharmacy|doctor|medical/i, HeartPulse],
  [/cloth|fashion|apparel/i, Shirt],
  [/fun|leisure|entertain|hobby/i, Sparkles],
]

export function categoryIcon(name?: string | null): LucideIcon {
  if (name) {
    for (const [re, icon] of categoryIcons) if (re.test(name)) return icon
  }
  return Tag
}

export function ReceiptIcon() {
  return ReceiptText
}

export function relTime(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })
}

export function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`)
  return d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function monthRangeFor(offset: number) {
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  return {
    from: `${base.getFullYear()}-${pad(base.getMonth() + 1)}-01`,
    to: `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(lastDay)}`,
    label: base.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' }),
    shortLabel: base.toLocaleDateString('en-IE', { month: 'short' }),
  }
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse px-4 py-8 sm:px-6">
      <div className="h-8 w-40 rounded-xl bg-hearth-surface2" />
      <div className="mt-6 h-40 rounded-2xl bg-hearth-surface2" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-hearth-surface2" />
        ))}
      </div>
    </div>
  )
}

export function QueryErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-hearth-rose/30 bg-hearth-rose/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-hearth-rose" />
        <h2 className="mt-3 font-display text-xl font-semibold text-hearth-ink">
          Something went wrong
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-hearth-ink2">
          {message ?? 'We could not load this data. Please try again.'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 rounded-xl bg-hearth-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** Gate a page on authentication per the auth graft contract. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <PageSkeleton />
  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        <div className="rounded-2xl bg-hearth-surface p-8 text-center shadow-card">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-hearth-ink">
            Sign in to continue
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-hearth-ink2">
            Your shared ledger lives behind your Hearth account.
          </p>
          <Link
            to={LOGIN_PATH}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-hearth-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
