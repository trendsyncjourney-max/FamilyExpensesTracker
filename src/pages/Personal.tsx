import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Lock,
  EyeOff,
  Eye,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Share2,
  X,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Pencil,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'

const SETTLE_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const EUR = (cents: number) =>
  `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const MONTH_FMT = new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' })
const DAY_FMT = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })

type PersonalExpense = {
  id: number
  amountCents: number
  merchant: string | null
  date: string
  notes: string | null
  status: string
  categoryId: number | null
  category?: { id: number; name: string } | null
}

/* --------------------------------- sheet --------------------------------- */

function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-hearth-personal/30 bg-hearth-surface shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-hearth-personal/30" />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ---------------------------------- row ---------------------------------- */

function Money({ cents, blurred, className }: { cents: number; blurred: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono transition-all duration-300',
        blurred && 'select-none blur-md',
        className,
      )}
      aria-hidden={blurred}
    >
      {blurred ? '€••••' : EUR(cents)}
    </span>
  )
}

/* ---------------------------------- page ---------------------------------- */

export default function Personal() {
  const { user, isLoading } = useAuth()
  const utils = trpc.useUtils()

  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<number | null>(null)
  const [blurred, setBlurred] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PersonalExpense | null>(null)
  const [shareTarget, setShareTarget] = useState<PersonalExpense | null>(null)
  const [sharedIds, setSharedIds] = useState<Set<number>>(new Set())
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('hearth-personal-banner') === '1',
  )
  const [flashId, setFlashId] = useState<number | null>(null)

  const [form, setForm] = useState({ amount: '', merchant: '', categoryId: null as number | null, date: toISO(new Date()), notes: '' })

  const monthFrom = toISO(new Date(ym.y, ym.m, 1))
  const monthTo = toISO(new Date(ym.y, ym.m + 1, 0))
  const statsFrom = toISO(new Date(ym.y, ym.m - 5, 1))

  const monthQ = trpc.expense.listPersonal.useQuery({ from: monthFrom, to: monthTo }, { enabled: !!user })
  const statsQ = trpc.expense.listPersonal.useQuery({ from: statsFrom, to: monthTo }, { enabled: !!user })
  const prevMonthQ = trpc.expense.listPersonal.useQuery(
    { from: toISO(new Date(ym.y, ym.m - 1, 1)), to: toISO(new Date(ym.y, ym.m, 0)) },
    { enabled: !!user },
  )
  const categoriesQ = trpc.category.list.useQuery(undefined, { enabled: !!user })

  const invalidate = () => utils.expense.listPersonal.invalidate()
  const createMut = trpc.expense.create.useMutation({
    onSuccess: (e) => {
      invalidate()
      setFormOpen(false)
      if (e?.id) {
        setFlashId(e.id)
        setTimeout(() => setFlashId(null), 700)
      }
    },
  })
  const updateMut = trpc.expense.update.useMutation({
    onSuccess: () => {
      invalidate()
      setFormOpen(false)
      setEditing(null)
    },
  })
  const shareMut = trpc.expense.create.useMutation({
    onSuccess: (_e, v) => {
      utils.expense.invalidate()
      if (shareTarget) setSharedIds((s) => new Set(s).add(shareTarget.id))
      setShareTarget(null)
      void v
    },
  })

  const items = (monthQ.data ?? []) as PersonalExpense[]
  const categories = (categoriesQ.data ?? []).filter((c) => c.scope !== 'shared')

  const filtered = useMemo(
    () =>
      items.filter(
        (e) =>
          (catFilter === null || e.categoryId === catFilter) &&
          (search.trim() === '' ||
            (e.merchant ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (e.notes ?? '').toLowerCase().includes(search.toLowerCase())),
      ),
    [items, catFilter, search],
  )

  const groups = useMemo(() => {
    const map = new Map<string, PersonalExpense[]>()
    for (const e of filtered) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const monthTotal = items.reduce((s, e) => s + e.amountCents, 0)
  const prevTotal = (prevMonthQ.data ?? []).reduce((s, e) => s + e.amountCents, 0)
  const daysElapsed = Math.max(1, Math.min(new Date(ym.y, ym.m + 1, 0).getDate(), ym.y === now.getFullYear() && ym.m === now.getMonth() ? now.getDate() : new Date(ym.y, ym.m + 1, 0).getDate()))
  const dailyAvg = monthTotal / daysElapsed
  const delta = prevTotal > 0 ? (monthTotal - prevTotal) / prevTotal : null

  const topCategories = useMemo(() => {
    const byCat = new Map<string, number>()
    for (const e of items) byCat.set(e.category?.name ?? 'Uncategorized', (byCat.get(e.category?.name ?? 'Uncategorized') ?? 0) + e.amountCents)
    return [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [items])
  const topCatMax = topCategories[0]?.[1] ?? 1

  /* ------------------------------- insights ------------------------------- */
  const insights = useMemo(() => {
    const stats = (statsQ.data ?? []) as PersonalExpense[]
    const months: { label: string; total: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ym.y, ym.m - i, 1)
      const f = toISO(d)
      const t = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
      months.push({
        label: new Intl.DateTimeFormat('en-IE', { month: 'short' }).format(d),
        total: stats.filter((e) => e.date >= f && e.date <= t).reduce((s, e) => s + e.amountCents, 0),
      })
    }
    const byDow = new Map<number, number>()
    const byMerchant = new Map<string, number>()
    for (const e of stats) {
      byDow.set(fromISO(e.date).getDay(), (byDow.get(fromISO(e.date).getDay()) ?? 0) + e.amountCents)
      if (e.merchant) byMerchant.set(e.merchant, (byMerchant.get(e.merchant) ?? 0) + e.amountCents)
    }
    const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const sortedDow = [...byDow.entries()].sort((a, b) => b[1] - a[1])
    return {
      months,
      max: Math.max(1, ...months.map((m) => m.total)),
      heaviest: sortedDow[0] ? dowNames[sortedDow[0][0]] : null,
      lightest: sortedDow.length > 1 ? dowNames[sortedDow[sortedDow.length - 1][0]] : null,
      merchants: [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }
  }, [statsQ.data, ym])

  const openForm = (existing?: PersonalExpense) => {
    if (existing) {
      setEditing(existing)
      setForm({
        amount: (existing.amountCents / 100).toFixed(2),
        merchant: existing.merchant ?? '',
        categoryId: existing.categoryId,
        date: existing.date,
        notes: existing.notes ?? '',
      })
    } else {
      setEditing(null)
      setForm({ amount: '', merchant: '', categoryId: null, date: toISO(new Date()), notes: '' })
    }
    setFormOpen(true)
  }

  const submitForm = () => {
    const amountCents = Math.round(parseFloat(form.amount || '0') * 100)
    if (amountCents <= 0) return
    if (editing) {
      updateMut.mutate({
        id: editing.id,
        amountCents,
        merchant: form.merchant || null,
        categoryId: form.categoryId,
        date: form.date,
        notes: form.notes || null,
      })
    } else {
      createMut.mutate({
        scope: 'personal',
        amountCents,
        merchant: form.merchant || undefined,
        categoryId: form.categoryId ?? undefined,
        date: form.date,
        notes: form.notes || undefined,
      })
    }
  }

  if (isLoading) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6"><div className="h-64 animate-pulse rounded-2xl bg-hearth-personal/10" /></div>
  }
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-6">
        <Lock className="mx-auto h-8 w-8 text-hearth-personal" />
        <h1 className="mt-3 font-display text-3xl font-semibold text-hearth-ink">Personal</h1>
        <p className="mt-3 text-sm text-hearth-ink2">Sign in to open your private space.</p>
        <Link to={LOGIN_PATH} className="mt-6 inline-block rounded-xl bg-hearth-personal px-5 py-2.5 text-sm font-semibold text-white">Sign in</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-3xl font-semibold tracking-tight text-hearth-personal">
          Personal <Lock className="h-5 w-5" />
        </h1>
        <button
          type="button"
          onClick={() => setBlurred((b) => !b)}
          aria-label={blurred ? 'Show amounts' : 'Hide amounts'}
          className={cn(
            'rounded-xl border p-2.5 transition-colors',
            blurred
              ? 'border-hearth-personal bg-hearth-personal text-white'
              : 'border-hearth-personal/40 text-hearth-personal hover:bg-hearth-personal/5',
          )}
        >
          {blurred ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>

      {/* privacy assurance strip */}
      <AnimatePresence>
        {!bannerDismissed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="mt-4 flex items-start gap-3 rounded-2xl border border-hearth-personal/30 bg-hearth-personal/5 p-3.5"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-hearth-personal" />
            <p className="flex-1 text-xs leading-relaxed text-hearth-ink2">
              <span className="font-semibold text-hearth-personal">This space is just for you.</span>{' '}
              Your partner cannot see anything here — it is enforced on the server, not just hidden in the app.
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                sessionStorage.setItem('hearth-personal-banner', '1')
                setBannerDismissed(true)
              }}
              className="text-hearth-ink2 hover:text-hearth-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* summary card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: SETTLE_EASE }}
        className="mt-4 rounded-2xl border border-hearth-personal/25 bg-hearth-personal/5 p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-personal">This month</p>
            <p className={cn('mt-1 font-display text-[44px] font-semibold leading-none text-hearth-personal transition-all duration-300', blurred && 'select-none blur-md')}>
              {blurred ? '€•••' : EUR(monthTotal)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-ink2">Daily average</p>
              <Money cents={Math.round(dailyAvg)} blurred={blurred} className="text-sm text-hearth-ink" />
            </div>
            {delta !== null && (
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                  delta > 0 ? 'bg-hearth-rose/10 text-hearth-rose' : 'bg-hearth-personal/10 text-hearth-personal',
                )}
              >
                {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {blurred ? '••%' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}% vs last month`}
              </span>
            )}
          </div>
        </div>
        {topCategories.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-hearth-personal/15 pt-4">
            {topCategories.map(([name, cents], i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-28 truncate text-xs font-medium text-hearth-ink2">{name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hearth-personal/10">
                  <motion.div
                    className="h-full rounded-full bg-hearth-personal"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, (cents / topCatMax) * 100)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.1, ease: SETTLE_EASE }}
                  />
                </div>
                <Money cents={cents} blurred={blurred} className="text-xs text-hearth-ink" />
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* controls */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => setYm((p) => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })} className="rounded-full p-1.5 text-hearth-ink2 hover:bg-hearth-surface2">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-32 text-center text-sm font-semibold text-hearth-ink">{MONTH_FMT.format(new Date(ym.y, ym.m, 1))}</span>
          <button type="button" aria-label="Next month" onClick={() => setYm((p) => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })} className="rounded-full p-1.5 text-hearth-ink2 hover:bg-hearth-surface2">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hearth-ink2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search personal expenses"
            className="w-full rounded-xl border border-hearth-line bg-hearth-surface py-2 pl-9 pr-3 text-sm text-hearth-ink outline-none focus:border-hearth-personal"
          />
        </div>
        <select
          value={catFilter ?? ''}
          onChange={(e) => setCatFilter(e.target.value ? Number(e.target.value) : null)}
          className="rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2 text-sm text-hearth-ink outline-none focus:border-hearth-personal"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* list */}
      {items.length === 0 && !monthQ.isLoading ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <img src="/empty-personal.svg" alt="" className="w-56" />
          <h2 className="mt-4 font-display text-2xl font-medium text-hearth-ink">This space is just for you.</h2>
          <p className="mt-2 max-w-sm text-sm text-hearth-ink2">
            Track personal spending privately — gifts, hobbies, coffee. It never touches the family balance.
          </p>
          <button type="button" onClick={() => openForm()} className="mt-5 rounded-xl bg-hearth-personal px-5 py-2.5 text-sm font-semibold text-white">
            Add a personal expense
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map(([day, rows]) => (
            <div key={day}>
              <div className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between bg-hearth-bg/90 px-1 py-1.5 backdrop-blur-sm">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-hearth-ink2">{DAY_FMT.format(fromISO(day))}</h3>
                <Money cents={rows.reduce((s, r) => s + r.amountCents, 0)} blurred={blurred} className="text-xs text-hearth-personal" />
              </div>
              <div className="mt-1.5 space-y-1.5">
                {rows.map((e, i) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.3, ease: SETTLE_EASE }}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl border border-hearth-line border-l-[3px] border-l-hearth-personal bg-hearth-surface px-3 py-2.5 transition-colors',
                      flashId === e.id && 'bg-hearth-personal/15',
                    )}
                  >
                    <button type="button" onClick={() => openForm(e)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-hearth-ink">{e.merchant ?? 'Personal expense'}</span>
                          {sharedIds.has(e.id) && (
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-hearth-personal/10 px-2 py-0.5 text-[10px] font-semibold text-hearth-personal">
                              Shared <Share2 className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-hearth-ink2">{e.category?.name ?? 'Uncategorized'}</span>
                      </span>
                      <Money cents={e.amountCents} blurred={blurred} className="text-sm text-hearth-ink" />
                    </button>
                    <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button type="button" aria-label="Edit" onClick={() => openForm(e)} className="rounded-lg p-1.5 text-hearth-ink2 hover:bg-hearth-personal/10 hover:text-hearth-personal">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!sharedIds.has(e.id) && (
                        <button type="button" aria-label="Copy to family ledger" onClick={() => setShareTarget(e)} className="rounded-lg p-1.5 text-hearth-ink2 hover:bg-hearth-personal/10 hover:text-hearth-personal">
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && items.length > 0 && (
            <p className="py-8 text-center text-sm text-hearth-ink2">No personal expenses match your filters.</p>
          )}
        </div>
      )}

      {/* insights */}
      <div className="mt-8 rounded-2xl border border-hearth-personal/25 bg-hearth-surface">
        <button
          type="button"
          onClick={() => setInsightsOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-4"
        >
          <span className="flex items-center gap-2 font-display text-lg font-medium text-hearth-personal">
            <BarChart3 className="h-4 w-4" /> Insights
          </span>
          <motion.span animate={{ rotate: insightsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronLeft className="h-4 w-4 -rotate-90 text-hearth-ink2" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {insightsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="overflow-hidden"
            >
              <div className="border-t border-hearth-personal/15 px-5 pb-5 pt-4">
                <div className="flex h-32 items-end gap-2">
                  {insights.months.map((m, i) => (
                    <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                      <motion.div
                        className="w-full rounded-t-md bg-hearth-personal/80"
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(3, (m.total / insights.max) * 100)}%` }}
                        transition={{ delay: i * 0.04, duration: 0.4, ease: SETTLE_EASE }}
                      />
                      <span className="text-[10px] font-semibold uppercase text-hearth-ink2">{m.label}</span>
                    </div>
                  ))}
                </div>
                {insights.heaviest && (
                  <p className="mt-4 text-xs text-hearth-ink2">
                    Heaviest spending day: <span className="font-semibold text-hearth-personal">{insights.heaviest}</span>
                    {insights.lightest ? <> · lightest: <span className="font-semibold text-hearth-personal">{insights.lightest}</span></> : null}
                  </p>
                )}
                {insights.merchants.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-ink2">Top merchants</p>
                    <div className="mt-2 space-y-1.5">
                      {insights.merchants.map(([name, cents]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="truncate text-hearth-ink">{name}</span>
                          <Money cents={cents} blurred={blurred} className="text-xs text-hearth-personal" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* purple FAB */}
      <motion.button
        type="button"
        onClick={() => openForm()}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-8 right-6 z-30 flex items-center gap-2 rounded-full bg-hearth-personal px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-hearth-personal/30"
      >
        <Plus className="h-4 w-4" /> Add personal
      </motion.button>

      {/* add / edit form sheet */}
      <Sheet open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }}>
        <h2 className="flex items-center gap-2 font-display text-xl font-medium text-hearth-personal">
          <Lock className="h-4 w-4" /> {editing ? 'Edit personal expense' : 'Add a personal expense'}
        </h2>
        <p className="mt-1 text-xs text-hearth-ink2">Personal expenses skip review entirely — no approvals, no shared visibility.</p>
        <div className="mt-4 space-y-3">
          {(
            [
              <label key="amount" className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Amount (€)</span>
                <input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })}
                  inputMode="decimal"
                  placeholder="0.00"
                  autoFocus
                  className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 font-mono text-sm text-hearth-ink outline-none focus:border-hearth-personal"
                />
              </label>,
              <label key="merchant" className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Note / merchant</span>
                <input
                  value={form.merchant}
                  onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                  placeholder="Coffee, book, gift…"
                  className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 text-sm text-hearth-ink outline-none focus:border-hearth-personal"
                />
              </label>,
              <div key="catdate" className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Category</span>
                  <select
                    value={form.categoryId ?? ''}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : null })}
                    className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 text-sm text-hearth-ink outline-none focus:border-hearth-personal"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Date</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 text-sm text-hearth-ink outline-none focus:border-hearth-personal"
                  />
                </label>
              </div>,
            ] as const
          ).map((field, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25, ease: SETTLE_EASE }}
            >
              {field}
            </motion.div>
          ))}
          <button
            type="button"
            disabled={Math.round(parseFloat(form.amount || '0') * 100) <= 0 || createMut.isPending || updateMut.isPending}
            onClick={submitForm}
            className="w-full rounded-xl bg-hearth-personal px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {createMut.isPending || updateMut.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save privately'}
          </button>
        </div>
      </Sheet>

      {/* share-to-family confirmation */}
      <Sheet open={!!shareTarget} onClose={() => setShareTarget(null)}>
        {shareTarget && (
          <>
            <h2 className="font-display text-xl font-medium text-hearth-ink">Copy to family ledger?</h2>
            <p className="mt-2 text-sm text-hearth-ink2">
              A shared copy will be created for <span className="font-mono font-semibold">{EUR(shareTarget.amountCents)}</span>.
              Your partner will see the shared copy, not this page. The personal original stays private.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShareTarget(null)}
                className="flex-1 rounded-xl border border-hearth-line px-4 py-3 text-sm font-semibold text-hearth-ink2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={shareMut.isPending}
                onClick={() =>
                  shareMut.mutate({
                    scope: 'shared',
                    amountCents: shareTarget.amountCents,
                    merchant: shareTarget.merchant ?? undefined,
                    categoryId: shareTarget.categoryId ?? undefined,
                    date: shareTarget.date,
                    notes: shareTarget.notes ?? undefined,
                  })
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-hearth-personal px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {shareMut.isPending ? 'Copying…' : (<><Check className="h-4 w-4" /> Create shared copy</>)}
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  )
}
