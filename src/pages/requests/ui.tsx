import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ---------- Money formatting ---------- */

export function fmtMoney(cents: number, currency = 'EUR') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

export function MoneyFigure({
  cents,
  currency,
  className,
}: {
  cents: number
  currency?: string
  className?: string
}) {
  return (
    <span className={cn('font-mono font-medium tabular-nums', className)}>
      {fmtMoney(cents, currency)}
    </span>
  )
}

/* ---------- Status chips (Status color law, design.md §2) ---------- */

export type ChipTone = 'pending' | 'approved' | 'cleared' | 'rose' | 'muted' | 'gold' | 'blue'

const toneClasses: Record<ChipTone, string> = {
  pending: 'bg-hearth-amber/10 text-hearth-amber',
  approved: 'bg-hearth-blue/10 text-hearth-blue',
  blue: 'bg-hearth-blue/10 text-hearth-blue',
  cleared: 'bg-hearth-accentSoft text-hearth-accent',
  rose: 'bg-hearth-rose/10 text-hearth-rose',
  muted: 'bg-hearth-surface2 text-hearth-ink2',
  gold: 'bg-hearth-gold/10 text-hearth-gold',
}

const reimbTone: Record<string, ChipTone> = {
  submitted: 'pending',
  approved: 'approved',
  paid: 'blue',
  confirmed: 'cleared',
  rejected: 'rose',
  cancelled: 'muted',
}

const advTone: Record<string, ChipTone> = {
  submitted: 'pending',
  approved: 'approved',
  disbursed: 'gold',
  reconciling: 'gold',
  reconciled: 'cleared',
  rejected: 'rose',
  cancelled: 'muted',
}

export const reimbLabel: Record<string, string> = {
  submitted: 'Waiting for review',
  approved: 'Approved — awaiting payment',
  paid: 'Paid — awaiting confirmation',
  confirmed: 'Paid ✓ Cleared',
  rejected: 'Needs changes',
  cancelled: 'Cancelled',
}

export const advLabel: Record<string, string> = {
  submitted: 'Waiting for review',
  approved: 'Approved — awaiting money',
  disbursed: 'Money given',
  reconciling: 'Reconciling',
  reconciled: 'Cleared & closed',
  rejected: 'Needs changes',
  cancelled: 'Cancelled',
}

export function StatusChip({
  status,
  kind = 'reimbursement',
  className,
}: {
  status: string
  kind?: 'reimbursement' | 'advance'
  className?: string
}) {
  const tone = (kind === 'advance' ? advTone : reimbTone)[status] ?? 'muted'
  const label = (kind === 'advance' ? advLabel : reimbLabel)[status] ?? status
  const pulse = status === 'submitted' || status === 'reconciling'
  return (
    <motion.span
      key={status}
      initial={{ rotateX: -90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide',
        toneClasses[tone],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', pulse && 'animate-pulse')} />
      {label}
    </motion.span>
  )
}

/* ---------- Avatar ---------- */

export function Avatar({
  name,
  src,
  size = 8,
  className,
}: {
  name?: string | null
  src?: string | null
  size?: number
  className?: string
}) {
  const cls = cn(
    'inline-flex items-center justify-center overflow-hidden rounded-full border border-hearth-line bg-hearth-accentSoft font-semibold text-hearth-accent',
    size === 10 ? 'h-10 w-10 text-sm' : size === 6 ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
    className,
  )
  if (src) return <img src={src} alt={name ?? ''} className={cls} />
  return <span className={cls}>{(name ?? 'H').slice(0, 1).toUpperCase()}</span>
}

/* ---------- Ledger divider with caption ---------- */

export function LedgerDivider({ children, tone }: { children: ReactNode; tone?: 'amber' | 'gray' }) {
  return (
    <div className="ledger-divider mt-8 mb-4">
      <span
        className={cn(
          'text-xs font-medium uppercase tracking-wider',
          tone === 'amber' ? 'text-hearth-amber' : 'text-hearth-ink2',
        )}
      >
        {children}
      </span>
      <span className="ledger-diamond" />
    </div>
  )
}

/* ---------- State blocks ---------- */

export function LoadingRows({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-hearth-surface2" />
      ))}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-hearth-rose/30 bg-hearth-rose/5 p-5 text-center">
      <p className="text-sm font-medium text-hearth-rose">{message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-xl border border-hearth-line bg-hearth-surface px-4 py-2 text-sm font-semibold text-hearth-ink"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({
  image,
  title,
  caption,
  children,
}: {
  image: string
  title: string
  caption?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-hearth-line bg-hearth-surface px-6 py-10 text-center shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]">
      <img src={image} alt="" className="h-36 w-48 object-contain" />
      <h3 className="mt-4 font-display text-xl font-medium text-hearth-ink">{title}</h3>
      {caption && <p className="mt-1.5 max-w-xs text-sm text-hearth-ink2">{caption}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

/* ---------- Buttons ---------- */

export function PrimaryButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-xl bg-hearth-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  tone = 'neutral',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'neutral' | 'rose' | 'gold' }) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'neutral' &&
          'border-hearth-line bg-hearth-surface text-hearth-ink2 hover:text-hearth-ink',
        tone === 'rose' && 'border-hearth-rose/40 bg-transparent text-hearth-rose hover:bg-hearth-rose/5',
        tone === 'gold' && 'border-hearth-gold/40 bg-transparent text-hearth-gold hover:bg-hearth-gold/5',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ---------- Aging helper ---------- */

export function daysSince(d: Date | string | null | undefined) {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400_000)
}
