import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion, useInView, animate } from 'framer-motion'
import {
  ReceiptText,
  HandCoins,
  CloudOff,
  Undo2,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Lock,
  CalendarPlus,
  Check,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  AuthGate,
  ExpenseStatusChip,
  LedgerDivider,
  PageSkeleton,
  QueryErrorState,
  SETTLE_EASE,
  categoryIcon,
  eur,
  monthRangeFor,
  relTime,
} from './records/shared'

/* ------------------------------- primitives ------------------------------ */

function MoneyFigure({ cents, className }: { cents: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const controls = animate(0, cents, {
      duration: 0.6,
      ease: SETTLE_EASE,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = eur(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [cents])
  return (
    <span ref={ref} className={cn('font-display tabular-nums', className)}>
      {eur(0)}
    </span>
  )
}

const toneClasses = {
  amber: 'border-l-hearth-amber text-hearth-amber',
  gold: 'border-l-hearth-gold text-hearth-gold',
  blue: 'border-l-hearth-blue text-hearth-blue',
  rose: 'border-l-hearth-rose text-hearth-rose',
} as const

function Avatar({ name, ring }: { name?: string | null; ring?: boolean }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold',
        ring
          ? 'bg-hearth-accentSoft text-hearth-accent ring-2 ring-hearth-accent/40'
          : 'bg-hearth-surface2 text-hearth-ink2 ring-2 ring-hearth-line',
      )}
    >
      {(name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/* --------------------------------- page ---------------------------------- */

export default function Home() {
  return (
    <AuthGate>
      <HomeInner />
    </AuthGate>
  )
}

function HomeInner() {
  const { user } = useAuth()
  const utils = trpc.useUtils()
  const [updated, setUpdated] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const monthBarsRef = useRef<HTMLDivElement>(null)
  const barsInView = useInView(monthBarsRef, { once: true, amount: 0.2 })

  const summaryQuery = trpc.dashboard.summary.useQuery()
  const monthRange = useMemo(() => monthRangeFor(monthOffset), [monthOffset])
  const prevRange = useMemo(() => monthRangeFor(monthOffset - 1), [monthOffset])
  const monthExpensesQuery = trpc.expense.list.useQuery({
    from: monthRange.from,
    to: monthRange.to,
  })
  const prevMonthExpensesQuery = trpc.expense.list.useQuery({
    from: prevRange.from,
    to: prevRange.to,
  })
  const recentQuery = trpc.expense.list.useQuery({})
  const personalQuery = trpc.expense.listPersonal.useQuery({
    from: monthRange.from,
    to: monthRange.to,
  })
  const returnsQuery = trpc.expense.list.useQuery({})

  // Pull-to-refresh (simple touch implementation) — ledger-diamond spinner.
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const touchStart = useRef<number | null>(null)

  const onTouchStart = (ev: React.TouchEvent) => {
    if (window.scrollY === 0) touchStart.current = ev.touches[0].clientY
  }
  const onTouchMove = (ev: React.TouchEvent) => {
    if (touchStart.current === null) return
    const dY = ev.touches[0].clientY - touchStart.current
    if (dY > 0) setPull(Math.min(dY, 96))
  }
  const onTouchEnd = async () => {
    if (pull > 64) {
      setRefreshing(true)
      await utils.invalidate()
      setRefreshing(false)
      setUpdated(true)
      window.setTimeout(() => setUpdated(false), 4000)
    }
    setPull(0)
    touchStart.current = null
  }

  const summary = summaryQuery.data
  const me = summary?.members.find((m) => m.userId === user?.id)
  const partner = summary?.members.find((m) => m.userId !== user?.id)
  const partnerName = partner?.name ?? 'Partner'

  const monthRows = useMemo(() => monthExpensesQuery.data ?? [], [monthExpensesQuery.data])
  const monthPosted = useMemo(
    () => monthRows.filter((r) => r.status !== 'voided'),
    [monthRows],
  )
  const monthSpentCents = monthPosted.reduce((acc, r) => acc + r.amountCents, 0)
  const prevSpentCents = useMemo(
    () =>
      (prevMonthExpensesQuery.data ?? [])
        .filter((r) => r.status !== 'voided')
        .reduce((acc, r) => acc + r.amountCents, 0),
    [prevMonthExpensesQuery.data],
  )
  const deltaPct =
    prevSpentCents > 0
      ? Math.round(((monthSpentCents - prevSpentCents) / prevSpentCents) * 1000) / 10
      : null
  const withReceipts = monthPosted.filter((r) => r.receiptUrl).length
  const receiptsPct =
    monthPosted.length > 0 ? Math.round((withReceipts / monthPosted.length) * 100) : 0

  const topCategories = useMemo(() => {
    const map = new Map<string, { name: string; cents: number }>()
    for (const r of monthPosted) {
      const name = r.category?.name ?? 'Uncategorised'
      const cur = map.get(name) ?? { name, cents: 0 }
      cur.cents += r.amountCents
      map.set(name, cur)
    }
    const sorted = [...map.values()].sort((a, b) => b.cents - a.cents).slice(0, 3)
    const max = sorted[0]?.cents ?? 1
    return sorted.map((c) => ({ ...c, pct: Math.max(6, Math.round((c.cents / max) * 100)) }))
  }, [monthPosted])

  const recent = useMemo(() => (recentQuery.data ?? []).slice(0, 5), [recentQuery.data])

  const upcoming = useMemo(() => {
    const now = new Date()
    const in7 = new Date(now.getTime() + 7 * 86400_000)
    return (summary?.upcomingProjections ?? [])
      .filter((p) => {
        const d = new Date(`${p.dueDate}T12:00:00`)
        return d >= new Date(now.toDateString()) && d <= in7
      })
      .slice(0, 5)
  }, [summary])

  const projectedTotal = upcoming.reduce((acc, p) => acc + p.amountCents, 0)

  const returnsInProgress = useMemo(
    () => (returnsQuery.data ?? []).filter((r) => r.returnStatus === 'return_initiated'),
    [returnsQuery.data],
  )

  const personalCents = (personalQuery.data ?? [])
    .filter((r) => r.status !== 'voided')
    .reduce((acc, r) => acc + r.amountCents, 0)

  if (summaryQuery.isLoading) return <PageSkeleton />
  if (summaryQuery.error || !summary)
    return (
      <QueryErrorState
        message={summaryQuery.error?.message ?? 'Could not load your dashboard'}
        onRetry={() => summaryQuery.refetch()}
      />
    )

  const netCents = summary.netOwedCents
  const settled = summary.netDirection === 'settled'
  const owedToMe = summary.netDirection === 'owed_to_me'
  const myPaid = summary.mySharedSpentCents
  const totalPaid = summary.totalSharedSpentCents
  const partnerPaid = Math.max(0, totalPaid - myPaid)
  const youShare = totalPaid > 0 ? myPaid / totalPaid : 0.5

  const attention: {
    key: string
    icon: typeof ReceiptText
    tone: keyof typeof toneClasses
    text: string
    to: string
  }[] = []
  const reviewCount =
    summary.pending.reimbursementsToReview + summary.pending.advancesToReview
  if (reviewCount > 0) {
    attention.push({
      key: 'review',
      icon: ReceiptText,
      tone: 'amber',
      text: `${reviewCount} ${reviewCount === 1 ? 'request' : 'requests'} waiting for your review`,
      to: '/requests',
    })
  }
  for (const a of summary.advanceOutstanding) {
    if (a.outstandingCents > 0) {
      attention.push({
        key: `advance-${a.advanceId}`,
        icon: HandCoins,
        tone: 'gold',
        text: `Advance open — ${eur(a.outstandingCents, summary.currency)} to return or receipt`,
        to: '/requests',
      })
    }
  }
  if (returnsInProgress.length > 0) {
    const expected = returnsInProgress.reduce((acc, r) => acc + r.amountCents, 0)
    attention.push({
      key: 'returns',
      icon: Undo2,
      tone: 'blue',
      text: `${returnsInProgress.length} ${returnsInProgress.length === 1 ? 'return' : 'returns'} awaiting refund — ${eur(expected)} expected`,
      to: '/records',
    })
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    attention.push({
      key: 'offline',
      icon: CloudOff,
      tone: 'amber',
      text: 'You are offline — changes will sync when online',
      to: '/records',
    })
  }

  const isNewFamily = totalPaid === 0 && recent.length === 0
  const today = new Date()
  const greeting =
    today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6"
    >
      {/* pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-settle"
        style={{ height: refreshing ? 48 : pull > 8 ? pull / 2 : 0 }}
      >
        <span
          className={cn(
            'h-3 w-3 rotate-45 bg-hearth-accent',
            (refreshing || pull > 64) && 'animate-spin',
          )}
          style={{ animationDuration: '1.2s' }}
        />
      </div>

      {/* Header greeting */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="pt-6"
      >
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] text-hearth-ink2">
            {greeting},{' '}
            <span className="font-medium text-hearth-ink">
              {user?.name?.split(' ')[0] ?? 'there'}
            </span>
          </p>
          <p className="font-mono text-xs text-hearth-ink2">
            {today.toISOString().slice(0, 10)}
          </p>
        </div>
        {updated && <p className="mt-1 text-xs text-hearth-accent">Updated just now</p>}
      </motion.div>

      {/* Section 1 — Net Position Card */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: SETTLE_EASE }}
        className="mt-4 rounded-2xl bg-hearth-surface p-6 shadow-card"
      >
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
          Family balance
        </p>
        {isNewFamily ? (
          <div className="mt-4 flex flex-col items-center py-2 text-center">
            <img src="/empty-receipts.svg" alt="" className="w-44 opacity-90" />
            <h1 className="mt-4 font-display text-[22px] leading-7 text-hearth-ink">
              Start your shared ledger
            </h1>
            <p className="mt-1 max-w-xs text-sm text-hearth-ink2">
              Add your first receipt and the balance math appears here.
            </p>
            <Link
              to="/records/new"
              className="mt-4 rounded-xl bg-hearth-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Add your first receipt
            </Link>
          </div>
        ) : settled ? (
          <div className="mt-4 flex flex-col items-center py-2 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-hearth-accentSoft">
              <Check className="h-7 w-7 text-hearth-accent" />
            </span>
            <h1 className="mt-4 font-display text-[22px] leading-7 text-hearth-ink">
              All settled ✓
            </h1>
            <p className="mt-1 text-sm text-hearth-ink2">Neither of you owes anything.</p>
            <Link
              to="/records"
              className="mt-4 rounded-xl bg-hearth-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              See this month
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-3 font-display text-[22px] leading-7 text-hearth-ink">
              {owedToMe ? `${partnerName} owes you` : `You owe ${partnerName}`}
            </h1>
            <MoneyFigure
              cents={Math.abs(netCents)}
              className={cn(
                'mt-1 block text-[44px] leading-[48px] tracking-[-0.02em] lg:text-[64px] lg:leading-[68px]',
                owedToMe ? 'text-hearth-accent' : 'text-hearth-ink',
              )}
            />

            {/* NetBalanceBar */}
            <div className="mt-5">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-hearth-surface2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${youShare * 100}%` }}
                  transition={{ duration: 0.9, ease: SETTLE_EASE }}
                  className="absolute inset-y-0 left-0 rounded-full bg-hearth-accent"
                />
                <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-hearth-ink/25" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Avatar name={me?.name ?? user?.name} ring />
                <Avatar name={partner?.name} />
              </div>
            </div>

            <p className="mt-3 text-xs text-hearth-ink2">
              You paid {eur(myPaid, summary.currency)} · {partnerName} paid{' '}
              {eur(partnerPaid, summary.currency)} · Fair share{' '}
              {eur(Math.round(totalPaid / 2), summary.currency)} each
            </p>

            <div className="mt-5 flex gap-3">
              <Link
                to="/requests"
                className="flex-1 rounded-xl bg-hearth-accent px-4 py-2.5 text-center text-sm font-semibold text-white transition-transform active:scale-[0.98]"
              >
                Settle up
              </Link>
              <Link
                to="/records"
                className="flex-1 rounded-xl border border-hearth-line px-4 py-2.5 text-center text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
              >
                History
              </Link>
            </div>
          </>
        )}
      </motion.section>

      {/* Section 2 — Needs Attention */}
      {attention.length > 0 && (
        <section className="mt-10">
          <LedgerDivider label="Needs attention" />
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            {attention.map((a, i) => (
              <motion.div
                key={a.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: SETTLE_EASE }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'w-[280px] shrink-0 snap-start rounded-2xl border-l-4 bg-hearth-surface p-4 shadow-card',
                  toneClasses[a.tone],
                )}
              >
                <Link to={a.to} className="block">
                  <a.icon className="h-5 w-5" />
                  <p className="mt-3 text-sm font-medium leading-5 text-hearth-ink">{a.text}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Section 3 — This Month */}
      <section className="mt-10">
        <LedgerDivider
          label="This month"
          action={
            <div className="flex items-center gap-2 text-hearth-ink2">
              <button
                aria-label="Previous month"
                onClick={() => setMonthOffset((o) => o - 1)}
                className="rounded-full p-1 hover:bg-hearth-surface2"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-hearth-ink">
                {monthRange.label}
              </span>
              <button
                aria-label="Next month"
                onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
                disabled={monthOffset === 0}
                className="rounded-full p-1 hover:bg-hearth-surface2 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          }
        />
        <div className="rounded-2xl bg-hearth-surface p-5 shadow-card">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-hearth-ink2">Spent</p>
              <p className="mt-1 font-display text-[22px] leading-7 text-hearth-ink">
                {eur(monthSpentCents, summary.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-hearth-ink2">vs last month</p>
              {deltaPct === null ? (
                <p className="mt-1.5 text-xs text-hearth-ink2">—</p>
              ) : (
                <span
                  className={cn(
                    'mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                    deltaPct < 0
                      ? 'bg-hearth-accentSoft text-hearth-accent'
                      : 'bg-hearth-rose/10 text-hearth-rose',
                  )}
                >
                  <TrendingDown className={cn('h-3.5 w-3.5', deltaPct > 0 && 'rotate-180')} />
                  {Math.abs(deltaPct)}%
                </span>
              )}
            </div>
            <div>
              <p className="text-xs text-hearth-ink2">Receipts logged</p>
              <p className="mt-1 font-mono text-[15px] leading-5 text-hearth-ink">
                {monthPosted.length}
              </p>
              <p className="text-[11px] text-hearth-ink2">{receiptsPct}% with receipts</p>
            </div>
          </div>

          <div ref={monthBarsRef} className="mt-5 space-y-3">
            {topCategories.length === 0 && (
              <p className="text-sm text-hearth-ink2">No spending in {monthRange.label} yet.</p>
            )}
            {topCategories.map((c, i) => {
              const CatIcon = categoryIcon(c.name)
              return (
                <Link
                  key={c.name}
                  to="/records"
                  className="block transition-transform active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <CatIcon className="h-4 w-4 text-hearth-ink2" />
                    <span className="flex-1 text-sm font-medium text-hearth-ink">{c.name}</span>
                    <span className="font-mono text-sm text-hearth-ink">
                      {eur(c.cents, summary.currency)}
                    </span>
                  </div>
                  <div className="ml-7 mt-1.5 h-1.5 overflow-hidden rounded-full bg-hearth-surface2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={barsInView ? { width: `${c.pct}%` } : {}}
                      transition={{ duration: 0.6, delay: i * 0.1, ease: SETTLE_EASE }}
                      className="h-full rounded-full bg-hearth-accent"
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Section 4 — Recent Activity */}
      <section className="mt-10">
        <LedgerDivider
          label="Recent"
          action={
            <Link to="/records" className="text-xs font-semibold text-hearth-accent">
              See all
            </Link>
          }
        />
        {recent.length === 0 ? (
          <div className="rounded-2xl bg-hearth-surface p-6 text-center shadow-card">
            <p className="text-sm text-hearth-ink2">No activity yet — add your first receipt.</p>
          </div>
        ) : (
          <div className="divide-y divide-hearth-line overflow-hidden rounded-2xl bg-hearth-surface shadow-card">
            {recent.map((r, i) => {
              const RowIcon = categoryIcon(r.category?.name ?? r.merchant)
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.35, ease: SETTLE_EASE }}
                >
                  <Link
                    to={`/records/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-hearth-surface2/60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hearth-surface2 text-hearth-ink2">
                      <RowIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-hearth-ink">
                        {r.merchant ?? r.category?.name ?? 'Expense'}
                      </span>
                      <span className="block text-xs text-hearth-ink2">
                        Added by{' '}
                        {r.payer?.name ?? (r.payerId === user?.id ? 'you' : partnerName)} ·{' '}
                        {relTime(r.createdAt)}
                      </span>
                      <span className="mt-1 block sm:hidden">
                        <ExpenseStatusChip status={r.status} />
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <ExpenseStatusChip status={r.status} />
                    </span>
                    <span className="font-mono text-[15px] leading-5 text-hearth-ink">
                      {eur(r.amountCents, r.currency)}
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 5 — Coming Up */}
      <section className="mt-10">
        <LedgerDivider label="Next 7 days" />
        <div className="overflow-hidden rounded-2xl bg-hearth-surface shadow-card">
          {upcoming.length === 0 && (
            <p className="px-4 py-4 text-sm text-hearth-ink2">
              Nothing planned for the next week.
            </p>
          )}
          {upcoming.map((u, i) => {
            const UIcon = categoryIcon(u.category?.name ?? u.title)
            const due = new Date(`${u.dueDate}T12:00:00`)
            return (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: SETTLE_EASE }}
              >
                <Link
                  to="/calendar"
                  className="flex items-center gap-3 border-b border-hearth-line px-4 py-3.5 transition-colors hover:bg-hearth-surface2/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-hearth-blue/50 bg-hearth-blue/5 text-hearth-blue">
                    <UIcon className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-medium text-hearth-ink">
                      {u.title}
                    </span>
                    <span className="text-xs text-hearth-ink2">
                      Due {due.toLocaleDateString('en-IE', { weekday: 'short' })} · projected
                    </span>
                  </span>
                  <span className="font-mono text-[15px] text-hearth-blue">
                    {eur(u.amountCents, u.currency)}
                  </span>
                </Link>
              </motion.div>
            )
          })}
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs text-hearth-ink2">
              Projected total:{' '}
              <span className="font-mono text-hearth-ink">
                {eur(projectedTotal, summary.currency)}
              </span>
            </p>
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1.5 rounded-xl border border-hearth-line px-3 py-1.5 text-xs font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Plan something
            </Link>
          </div>
        </div>
      </section>

      {/* Personal preview card */}
      <section className="mt-10">
        <motion.div
          initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.45, ease: SETTLE_EASE }}
        >
          <Link
            to="/personal"
            className="block rounded-2xl border-l-4 border-l-hearth-personal bg-hearth-personal/5 p-5 shadow-card transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center gap-2 text-hearth-personal">
              <Lock className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.08em]">
                Your personal spending
              </p>
            </div>
            <p className="mt-3 font-display text-[22px] leading-7 text-hearth-ink">
              {eur(personalCents, summary.currency)}
              <span className="ml-2 text-sm font-normal text-hearth-ink2">this month</span>
            </p>
            <p className="mt-1 text-xs text-hearth-ink2">Only you can see this</p>
          </Link>
        </motion.div>
      </section>
    </div>
  )
}
