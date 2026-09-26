import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  Plus,
  X,
  AlertTriangle,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  AuthGate,
  ExpenseStatusChip,
  ReturnStatusChip,
  PageSkeleton,
  QueryErrorState,
  SETTLE_EASE,
  categoryIcon,
  eur,
  fmtDate,
  monthRangeFor,
} from './shared'

type ExpenseRow = {
  id: number
  amountCents: number
  currency: string
  merchant: string | null
  date: string
  status: string
  returnStatus: string
  receiptUrl: string | null
  payerId: number
  categoryId: number | null
  payer?: { id: number; name: string | null; avatar: string | null } | null
  category?: { id: number; name: string } | null
}

type Filters = {
  status: string | null
  categoryIds: number[]
  payer: 'me' | 'partner' | 'both'
  returnableOnly: boolean
}

const emptyFilters: Filters = { status: null, categoryIds: [], payer: 'both', returnableOnly: false }

const statusOptions = [
  { value: 'draft', label: 'Not sent yet' },
  { value: 'posted', label: 'Cleared' },
  { value: 'disputed', label: 'Needs changes' },
  { value: 'resolved', label: 'Approved' },
  { value: 'voided', label: 'Voided' },
]

function applyFilters(rows: ExpenseRow[], f: Filters, search: string, myId?: number) {
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false
    if (f.categoryIds.length > 0 && (!r.categoryId || !f.categoryIds.includes(r.categoryId)))
      return false
    if (f.payer !== 'both' && myId != null) {
      if (f.payer === 'me' && r.payerId !== myId) return false
      if (f.payer === 'partner' && r.payerId === myId) return false
    }
    if (f.returnableOnly) {
      if (r.status === 'voided') return false
      const age = Date.now() - new Date(`${r.date}T12:00:00`).getTime()
      if (age > 30 * 86400_000) return false
    }
    if (search) {
      const q = search.toLowerCase()
      const hay = `${r.merchant ?? ''} ${r.category?.name ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export default function Records() {
  return (
    <AuthGate>
      <RecordsInner />
    </AuthGate>
  )
}

function RecordsInner() {
  const { user } = useAuth()
  const utils = trpc.useUtils()
  const [monthOffset, setMonthOffset] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Filters>(emptyFilters)
  const [filters, setFilters] = useState<Filters>(emptyFilters)

  const range = useMemo(() => monthRangeFor(monthOffset), [monthOffset])
  const listQuery = trpc.expense.list.useQuery({ from: range.from, to: range.to })
  const categoriesQuery = trpc.category.list.useQuery()

  const rows = (listQuery.data ?? []) as unknown as ExpenseRow[]
  const filtered = useMemo(
    () => applyFilters(rows, filters, search, user?.id),
    [rows, filters, search, user?.id],
  )
  const previewCount = useMemo(
    () => applyFilters(rows, draft, search, user?.id).length,
    [rows, draft, search, user?.id],
  )

  const filtersActive =
    filters.status !== null ||
    filters.categoryIds.length > 0 ||
    filters.payer !== 'both' ||
    filters.returnableOnly

  // Duplicate detection: same amount + date + merchant.
  const dupKeys = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of filtered) {
      if (!r.merchant) continue
      const k = `${r.amountCents}|${r.date}|${r.merchant.toLowerCase()}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return counts
  }, [filtered])

  // Group by day (list comes sorted desc by date).
  const groups = useMemo(() => {
    const g = new Map<string, ExpenseRow[]>()
    for (const r of filtered) {
      const arr = g.get(r.date) ?? []
      arr.push(r)
      g.set(r.date, arr)
    }
    return [...g.entries()]
  }, [filtered])

  const totalCents = filtered.reduce((acc, r) => (r.status === 'voided' ? acc : acc + r.amountCents), 0)
  const withReceipts = filtered.filter((r) => r.receiptUrl).length

  if (listQuery.isLoading) return <PageSkeleton />
  if (listQuery.error)
    return <QueryErrorState message={listQuery.error.message} onRetry={() => listQuery.refetch()} />

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-hearth-ink lg:text-[40px] lg:leading-[48px]">
          Records
        </h1>
        <div className="flex items-center gap-1">
          <button
            aria-label="Search records"
            onClick={() => setSearchOpen((v) => !v)}
            className={cn(
              'rounded-full p-2 text-hearth-ink2 transition-colors hover:bg-hearth-surface2',
              searchOpen && 'bg-hearth-surface2 text-hearth-ink',
            )}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            aria-label="Open filters"
            onClick={() => {
              setDraft(filters)
              setSheetOpen(true)
            }}
            className="relative rounded-full p-2 text-hearth-ink2 transition-colors hover:bg-hearth-surface2"
          >
            <SlidersHorizontal className="h-5 w-5" />
            {filtersActive && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-hearth-accent" />
            )}
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-hearth-ink2">
        Shared ledger only — personal rows live in Personal.
      </p>

      {searchOpen && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-hearth-ink2" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchant or category…"
            className="w-full bg-transparent text-sm text-hearth-ink outline-none placeholder:text-hearth-ink2"
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch('')}>
              <X className="h-4 w-4 text-hearth-ink2" />
            </button>
          )}
        </div>
      )}

      {/* Sticky summary strip + month switcher */}
      <div className="sticky top-[104px] z-10 -mx-4 mt-4 border-y border-hearth-line bg-hearth-bg/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 md:top-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-hearth-ink2">
            <button
              aria-label="Previous month"
              onClick={() => setMonthOffset((o) => o - 1)}
              className="rounded-full p-1 hover:bg-hearth-surface2"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-hearth-ink">{range.shortLabel}</span>
            <button
              aria-label="Next month"
              onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
              disabled={monthOffset === 0}
              className="rounded-full p-1 hover:bg-hearth-surface2 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="font-mono text-xs text-hearth-ink2">
            {range.shortLabel} · {filtered.length} records · {eur(totalCents)} total ·{' '}
            {withReceipts} with receipts
          </p>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <img src="/empty-receipts.svg" alt="" className="w-56 opacity-90" />
          <h2 className="mt-6 font-display text-2xl font-semibold text-hearth-ink">
            {rows.length === 0 ? 'No receipts yet' : 'Nothing matches these filters'}
          </h2>
          <p className="mt-2 max-w-xs text-sm text-hearth-ink2">
            {rows.length === 0
              ? 'Snap your first receipt — it takes five seconds.'
              : 'Try widening the date range or clearing a filter.'}
          </p>
          {rows.length === 0 ? (
            <Link
              to="/records/new"
              className="mt-5 rounded-xl bg-hearth-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Add a receipt
            </Link>
          ) : (
            <button
              onClick={() => {
                setFilters(emptyFilters)
                setSearch('')
              }}
              className="mt-5 rounded-xl border border-hearth-line px-5 py-2.5 text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map(([date, items]) => {
            const dayTotal = items.reduce(
              (acc, r) => (r.status === 'voided' ? acc : acc + r.amountCents),
              0,
            )
            return (
              <section key={date}>
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                    {fmtDate(date)}
                  </h2>
                  <span className="font-mono text-xs text-hearth-ink2">{eur(dayTotal)}</span>
                </div>
                <div className="mt-2 divide-y divide-hearth-line overflow-hidden rounded-2xl bg-hearth-surface shadow-card">
                  {items.map((r, i) => {
                    const Icon = categoryIcon(r.category?.name ?? r.merchant)
                    const dupKey = r.merchant
                      ? `${r.amountCents}|${r.date}|${r.merchant.toLowerCase()}`
                      : null
                    const isDup = dupKey != null && (dupKeys.get(dupKey) ?? 0) > 1
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
                          {r.receiptUrl ? (
                            <img
                              src={r.receiptUrl}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-xl border border-hearth-line object-cover"
                            />
                          ) : (
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-hearth-surface2 text-hearth-ink2">
                              <Icon className="h-5 w-5" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium text-hearth-ink">
                              {r.merchant ?? r.category?.name ?? 'Expense'}
                            </span>
                            <span className="block text-xs text-hearth-ink2">
                              {r.category?.name ?? 'Uncategorised'} ·{' '}
                              {r.payer?.name ?? (r.payerId === user?.id ? 'You' : 'Partner')}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <ExpenseStatusChip status={r.status} />
                              <ReturnStatusChip status={r.returnStatus} />
                            </span>
                            {isDup && (
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-hearth-amber/10 px-2 py-0.5 text-[11px] font-semibold text-hearth-amber">
                                <AlertTriangle className="h-3 w-3" />
                                Possible duplicate
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[15px] leading-5 text-hearth-ink',
                              r.status === 'voided' && 'text-hearth-ink2 line-through',
                            )}
                          >
                            {eur(r.amountCents, r.currency)}
                          </span>
                        </Link>
                      </motion.div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Add FAB */}
      <Link
        to="/records/new"
        aria-label="Add a receipt"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-hearth-accent text-white shadow-card transition-transform active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </Link>

      {/* Filters bottom sheet */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-hearth-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-card"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-hearth-ink">Filters</h2>
                <button
                  aria-label="Close filters"
                  onClick={() => setSheetOpen(false)}
                  className="rounded-full p-1.5 text-hearth-ink2 hover:bg-hearth-surface2"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                  Status
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {statusOptions.map((s) => (
                    <button
                      key={s.value}
                      onClick={() =>
                        setDraft((d) => ({ ...d, status: d.status === s.value ? null : s.value }))
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                        draft.status === s.value
                          ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                          : 'border-hearth-line text-hearth-ink2 hover:text-hearth-ink',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                  Category
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(categoriesQuery.data ?? [])
                    .filter((c) => c.scope !== 'personal')
                    .map((c) => {
                      const active = draft.categoryIds.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              categoryIds: active
                                ? d.categoryIds.filter((id) => id !== c.id)
                                : [...d.categoryIds, c.id],
                            }))
                          }
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                            active
                              ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                              : 'border-hearth-line text-hearth-ink2 hover:text-hearth-ink',
                          )}
                        >
                          {c.name}
                        </button>
                      )
                    })}
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                  Payer
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['me', 'partner', 'both'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setDraft((d) => ({ ...d, payer: p }))}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-xs font-semibold capitalize transition-all',
                        draft.payer === p
                          ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                          : 'border-hearth-line text-hearth-ink2 hover:text-hearth-ink',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mt-5 flex items-center justify-between rounded-xl border border-hearth-line px-4 py-3">
                <span className="text-sm font-medium text-hearth-ink">
                  Returnable items only
                  <span className="block text-xs font-normal text-hearth-ink2">
                    Bought within the last 30 days
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={draft.returnableOnly}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, returnableOnly: e.target.checked }))
                  }
                  className="h-5 w-5 accent-hearth-accent"
                />
              </label>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setDraft(emptyFilters)}
                  className="flex-1 rounded-xl border border-hearth-line px-4 py-2.5 text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    setFilters(draft)
                    setSheetOpen(false)
                    utils.expense.list.invalidate()
                  }}
                  className="flex-1 rounded-xl bg-hearth-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Show {previewCount} records
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

