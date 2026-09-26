import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  List,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat,
  Link2,
  SkipForward,
  Pencil,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  AlarmClock,
} from 'lucide-react'
import { RRule } from 'rrule'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'

const SETTLE_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const EUR = (cents: number) =>
  `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/* ------------------------------- date utils ------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const todayISO = () => toISO(new Date())
const MONTH_FMT = new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' })
const DAY_FMT = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })

type Projection = {
  id: number
  title: string
  amountCents: number
  currency: string
  categoryId: number | null
  dueDate: string
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly'
  recurrenceUntil: string | null
  status: 'planned' | 'realized' | 'skipped'
  realizedExpenseId: number | null
  category?: { id: number; name: string } | null
}

function occurrences(p: Pick<Projection, 'dueDate' | 'recurrence' | 'recurrenceUntil'>, from: string, to: string): string[] {
  if (p.recurrence === 'none') return p.dueDate >= from && p.dueDate <= to ? [p.dueDate] : []
  const freq = { weekly: RRule.WEEKLY, monthly: RRule.MONTHLY, yearly: RRule.YEARLY }[p.recurrence]
  const rule = new RRule({
    freq,
    dtstart: fromISO(p.dueDate),
    until: p.recurrenceUntil ? fromISO(p.recurrenceUntil) : undefined,
  })
  return rule.between(fromISO(from), fromISO(to), true).map(toISO)
}

/* --------------------------------- sheet --------------------------------- */

function Sheet({ open, onClose, children, tall }: { open: boolean; onClose: () => void; children: React.ReactNode; tall?: boolean }) {
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
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-hearth-line bg-hearth-surface shadow-2xl',
              tall ? 'h-[80vh]' : 'max-h-[70vh]',
            )}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-hearth-line" />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ---------------------------- plan / edit sheet --------------------------- */

type Draft = {
  id?: number
  title: string
  amount: string
  categoryId: number | null
  dueDate: string
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly'
  remind: boolean
}

function PlanSheet({
  open,
  onClose,
  draft,
  setDraft,
  categories,
  isEditingSeries,
  onSubmit,
  saving,
}: {
  open: boolean
  onClose: () => void
  draft: Draft
  setDraft: (d: Draft) => void
  categories: { id: number; name: string; scope: string }[]
  isEditingSeries: boolean
  onSubmit: (scope: 'one' | 'future' | 'series') => void
  saving: boolean
}) {
  const [scope, setScope] = useState<'one' | 'future' | 'series'>('series')
  const amountCents = Math.round(parseFloat(draft.amount || '0') * 100)
  const valid = draft.title.trim().length > 0 && amountCents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)

  const preview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) return []
    const horizon = toISO(new Date(Date.now() + 1000 * 60 * 60 * 24 * 400))
    return occurrences(
      { dueDate: draft.dueDate, recurrence: draft.recurrence, recurrenceUntil: null },
      draft.dueDate,
      horizon,
    ).slice(0, 4)
  }, [draft.dueDate, draft.recurrence])

  return (
    <Sheet open={open} onClose={onClose} tall>
      <h2 className="font-display text-xl font-medium text-hearth-ink">
        {draft.id ? 'Edit projected expense' : 'Plan an expense'}
      </h2>
      <p className="mt-1 text-xs text-hearth-ink2">
        Projections never change your balance — only linked receipts do.
      </p>

      {/* live preview of next occurrences */}
      <div className="mt-4 rounded-2xl border border-dashed border-hearth-blue/50 bg-hearth-blue/5 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-blue">
          Next occurrences
        </p>
        <div className="mt-2 flex gap-2">
          <AnimatePresence mode="popLayout">
            {preview.map((d) => (
              <motion.span
                layout
                key={d}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.25, ease: SETTLE_EASE }}
                className="rounded-full border border-hearth-blue/40 bg-hearth-surface px-2.5 py-1 text-xs font-medium text-hearth-blue"
              >
                {DAY_FMT.format(fromISO(d))}
              </motion.span>
            ))}
          </AnimatePresence>
          {preview.length === 0 && <span className="text-xs text-hearth-ink2">Pick a first due date</span>}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Title</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Rent, Electricity, Streaming…"
            className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 text-sm text-hearth-ink outline-none focus:border-hearth-blue"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Amount (€)</span>
            <input
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^0-9.]/g, '') })}
              inputMode="decimal"
              placeholder="0.00"
              className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 font-mono text-sm text-hearth-ink outline-none focus:border-hearth-blue"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">First due date</span>
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 text-sm text-hearth-ink outline-none focus:border-hearth-blue"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Category</span>
          <select
            value={draft.categoryId ?? ''}
            onChange={(e) => setDraft({ ...draft, categoryId: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 text-sm text-hearth-ink outline-none focus:border-hearth-blue"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Recurrence</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(['none', 'weekly', 'monthly', 'yearly'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft({ ...draft, recurrence: r })}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors',
                  draft.recurrence === r
                    ? 'border-hearth-blue bg-hearth-blue text-white'
                    : 'border-hearth-line text-hearth-ink2 hover:text-hearth-ink',
                )}
              >
                {r === 'none' ? 'Once' : r}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2.5 rounded-xl border border-hearth-line px-3 py-2.5">
          <input
            type="checkbox"
            checked={draft.remind}
            onChange={(e) => setDraft({ ...draft, remind: e.target.checked })}
            className="h-4 w-4 accent-[#2F5FA8]"
          />
          <AlarmClock className="h-4 w-4 text-hearth-ink2" />
          <span className="text-sm text-hearth-ink">Remind us the day before</span>
        </label>

        {isEditingSeries && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-hearth-ink2">Apply changes to</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(
                [
                  ['one', 'This one'],
                  ['future', 'This & future'],
                  ['series', 'Whole series'],
                ] as const
              ).map(([v, label]) => (
                <motion.button
                  layout
                  key={v}
                  type="button"
                  onClick={() => setScope(v)}
                  className={cn(
                    'rounded-xl border px-2 py-2 text-xs font-semibold transition-colors',
                    scope === v ? 'border-hearth-blue bg-hearth-blue/10 text-hearth-blue' : 'border-hearth-line text-hearth-ink2',
                  )}
                >
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => onSubmit(scope)}
          className="w-full rounded-xl bg-hearth-blue px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Plan expense'}
        </button>
      </div>
    </Sheet>
  )
}

/* --------------------------------- page ---------------------------------- */

export default function CalendarPage() {
  const { user, isLoading } = useAuth()
  const utils = trpc.useUtils()

  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [slide, setSlide] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [realizeFor, setRealizeFor] = useState<Projection | null>(null)
  const [justRealized, setJustRealized] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>({
    title: '', amount: '', categoryId: null, dueDate: todayISO(), recurrence: 'none', remind: false,
  })

  const monthFrom = toISO(new Date(ym.y, ym.m, 1))
  const monthTo = toISO(new Date(ym.y, ym.m + 1, 0))
  const range = useMemo(() => ({ from: monthFrom, to: monthTo }), [monthFrom, monthTo])

  const projectionsQ = trpc.projection.list.useQuery(range, { enabled: !!user })
  const expensesQ = trpc.expense.list.useQuery(range, { enabled: !!user })
  const categoriesQ = trpc.category.list.useQuery(undefined, { enabled: !!user })
  const realizePoolQ = trpc.expense.list.useQuery(range, { enabled: !!user && !!realizeFor })

  const invalidate = () => {
    utils.projection.list.invalidate()
    utils.expense.list.invalidate()
  }
  const createMut = trpc.projection.create.useMutation({ onSuccess: invalidate })
  const updateMut = trpc.projection.update.useMutation({ onSuccess: invalidate })
  const skipMut = trpc.projection.skip.useMutation({ onSuccess: invalidate })
  const realizeMut = trpc.projection.realize.useMutation({
    onSuccess: (_d, v) => {
      invalidate()
      setJustRealized(v.id)
      setRealizeFor(null)
      setTimeout(() => setJustRealized(null), 900)
    },
  })

  const projections = (projectionsQ.data ?? []) as Projection[]
  const expenses = expensesQ.data ?? []
  const categories = (categoriesQ.data ?? []).filter((c) => c.scope !== 'personal')
  const today = todayISO()

  const projByDay = useMemo(() => {
    const map = new Map<string, { p: Projection; date: string }[]>()
    for (const p of projections) {
      for (const d of occurrences(p, monthFrom, monthTo)) {
        const arr = map.get(d) ?? []
        arr.push({ p, date: d })
        map.set(d, arr)
      }
    }
    return map
  }, [projections, monthFrom, monthTo])

  const expByDay = useMemo(() => {
    const map = new Map<string, typeof expenses>()
    for (const e of expenses) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [expenses])

  const spentCents = expenses.reduce((s, e) => s + e.amountCents, 0)
  const projectedRemainingCents = useMemo(() => {
    let s = 0
    for (const p of projections) {
      if (p.status !== 'planned') continue
      for (const d of occurrences(p, monthFrom, monthTo)) if (d >= today) s += p.amountCents
    }
    return s
  }, [projections, monthFrom, monthTo, today])

  const shiftMonth = (dir: 1 | -1) => {
    setSlide(dir)
    setYm((p) => {
      const d = new Date(p.y, p.m + dir, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const openPlan = (date?: string, existing?: Projection) => {
    setDraft(
      existing
        ? {
            id: existing.id,
            title: existing.title,
            amount: (existing.amountCents / 100).toFixed(2),
            categoryId: existing.categoryId,
            dueDate: existing.dueDate,
            recurrence: existing.recurrence,
            remind: false,
          }
        : { title: '', amount: '', categoryId: null, dueDate: date ?? today, recurrence: 'none', remind: false },
    )
    setPlanOpen(true)
  }

  const submitPlan = async (scope: 'one' | 'future' | 'series') => {
    const amountCents = Math.round(parseFloat(draft.amount || '0') * 100)
    const base = {
      title: draft.title.trim(),
      amountCents,
      categoryId: draft.categoryId ?? undefined,
      dueDate: draft.dueDate,
      recurrence: draft.recurrence,
    }
    const existing = draft.id ? projections.find((p) => p.id === draft.id) : undefined
    if (!existing) {
      await createMut.mutateAsync(base)
    } else if (existing.recurrence === 'none' || scope === 'series') {
      await updateMut.mutateAsync({ id: existing.id, ...base })
    } else if (scope === 'one') {
      // Split off this occurrence as its own one-off projection.
      await createMut.mutateAsync({ ...base, recurrence: 'none' })
    } else {
      // "This and future": end the original series the day before, start a new one.
      const before = toISO(new Date(fromISO(draft.dueDate).getTime() - 86400000))
      await updateMut.mutateAsync({ id: existing.id, recurrenceUntil: before })
      await createMut.mutateAsync(base)
    }
    setPlanOpen(false)
  }

  /* ------------------------------ grid cells ------------------------------ */
  const firstDow = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISO(new Date(ym.y, ym.m, i + 1))),
  ]

  const isOverdue = (p: Projection, date: string) => p.status === 'planned' && date < today

  const dotsFor = (day: string) => {
    const dots: string[] = []
    if ((expByDay.get(day) ?? []).length > 0) dots.push('bg-hearth-accent')
    for (const { p, date } of projByDay.get(day) ?? []) {
      if (p.status === 'skipped') continue
      if (isOverdue(p, date)) dots.push('bg-hearth-rose')
      else if (p.status === 'realized') dots.push('bg-hearth-accent')
      else dots.push('border border-hearth-blue bg-transparent')
    }
    return dots.slice(0, 3)
  }

  const selectedDayItems = selectedDay ? (projByDay.get(selectedDay) ?? []) : []
  const selectedDayExpenses = selectedDay ? (expByDay.get(selectedDay) ?? []) : []

  /* ------------------------------ list view ------------------------------- */
  const weekGroups = useMemo(() => {
    const groups: { label: string; total: number; rows: { p: Projection; date: string }[] }[] = []
    const entries = [...projByDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    const byWeek = new Map<string, { p: Projection; date: string }[]>()
    for (const [day, items] of entries) {
      const d = fromISO(day)
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = toISO(monday)
      byWeek.set(key, [...(byWeek.get(key) ?? []), ...items])
    }
    for (const [monday, rows] of [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      groups.push({
        label: `Week of ${DAY_FMT.format(fromISO(monday))}`,
        total: rows.filter((r) => r.p.status === 'planned').reduce((s, r) => s + r.p.amountCents, 0),
        rows: rows.sort((a, b) => a.date.localeCompare(b.date)),
      })
    }
    return groups
  }, [projByDay])

  if (isLoading) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6"><div className="h-64 animate-pulse rounded-2xl bg-hearth-surface2" /></div>
  }
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-hearth-ink">Calendar</h1>
        <p className="mt-3 text-sm text-hearth-ink2">Sign in to plan projected family expenses.</p>
        <Link to={LOGIN_PATH} className="mt-6 inline-block rounded-xl bg-hearth-accent px-5 py-2.5 text-sm font-semibold text-white">Sign in</Link>
      </div>
    )
  }

  const empty = !projectionsQ.isLoading && projections.length === 0 && expenses.length === 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-hearth-ink">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            aria-label="Toggle view"
            className="rounded-xl border border-hearth-line p-2.5 text-hearth-ink2 transition-colors hover:text-hearth-ink"
          >
            {view === 'grid' ? <List className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => openPlan()}
            className="flex items-center gap-1.5 rounded-xl bg-hearth-accent px-3.5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Plan expense
          </button>
        </div>
      </div>

      {/* month switcher */}
      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="rounded-full p-2 text-hearth-ink2 hover:bg-hearth-surface2">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-display text-lg font-medium text-hearth-ink">
          {MONTH_FMT.format(new Date(ym.y, ym.m, 1))}
        </span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="rounded-full p-2 text-hearth-ink2 hover:bg-hearth-surface2">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* summary strip */}
      <motion.div
        key={`${ym.y}-${ym.m}-summary`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: SETTLE_EASE }}
        className="mt-4 grid grid-cols-3 gap-3 rounded-2xl border border-hearth-line bg-hearth-surface p-4 shadow-sm"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-ink2">Spent so far</p>
          <p className="mt-1 font-display text-xl font-semibold text-hearth-accent">{EUR(spentCents)}</p>
        </div>
        <div className="border-l border-dashed border-hearth-line pl-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-blue">Projected remaining</p>
          <motion.p
            className="mt-1 font-display text-xl font-semibold text-hearth-blue"
            animate={{ opacity: [1, 0.55, 1] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
          >
            {EUR(projectedRemainingCents)}
          </motion.p>
        </div>
        <div className="border-l border-hearth-line pl-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-ink2">Month outlook</p>
          <p className="mt-1 flex items-center gap-1 font-display text-xl font-semibold text-hearth-ink">
            {EUR(spentCents + projectedRemainingCents)}
            {projectedRemainingCents > 0 ? (
              <TrendingUp className="h-4 w-4 text-hearth-amber" />
            ) : (
              <TrendingDown className="h-4 w-4 text-hearth-accent" />
            )}
          </p>
        </div>
      </motion.div>

      {empty ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <img src="/empty-calendar.svg" alt="" className="w-56" />
          <h2 className="mt-4 font-display text-2xl font-medium text-hearth-ink">Nothing planned</h2>
          <p className="mt-2 max-w-sm text-sm text-hearth-ink2">
            Plan bills, subscriptions and events ahead — projections never touch your balance until a receipt lands.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['Rent', 'Electricity', 'Internet', 'Streaming'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  openPlan()
                  setDraft((d) => ({ ...d, title: s }))
                }}
                className="rounded-full border border-hearth-blue/40 px-3.5 py-1.5 text-xs font-semibold text-hearth-blue hover:bg-hearth-blue/5"
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openPlan()}
            className="mt-5 rounded-xl bg-hearth-blue px-5 py-2.5 text-sm font-semibold text-white"
          >
            Plan a bill or subscription
          </button>
        </div>
      ) : view === 'grid' ? (
        <div className="relative mt-6 overflow-hidden">
          <AnimatePresence mode="wait" custom={slide}>
            <motion.div
              key={`${ym.y}-${ym.m}`}
              custom={slide}
              initial={{ x: slide >= 0 ? 60 : -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: slide >= 0 ? -60 : 60, opacity: 0 }}
              transition={{ duration: 0.3, ease: SETTLE_EASE }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.4}
              onDragEnd={(_e, info) => {
                if (info.offset.x < -60) shiftMonth(1)
                else if (info.offset.x > 60) shiftMonth(-1)
              }}
            >
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-hearth-ink2">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => (
                  <div key={d} className={cn('py-1', i >= 5 && 'text-hearth-ink2/70')}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) =>
                  day === null ? (
                    <div key={`x${i}`} />
                  ) : (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        'flex min-h-[52px] flex-col items-center justify-start rounded-xl border border-transparent px-1 py-1.5 transition-colors hover:border-hearth-line hover:bg-hearth-surface',
                        i % 7 >= 5 && 'bg-hearth-surface2/60',
                        day === today && 'border-hearth-accent bg-hearth-accentSoft/40',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                          day === today ? 'bg-hearth-accent text-white' : 'text-hearth-ink',
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                      <span className="mt-1 flex h-1.5 items-center gap-1">
                        {dotsFor(day).map((cls, j) => (
                          <motion.span
                            key={`${day}-${j}`}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: j * 0.02, type: 'spring', stiffness: 500, damping: 20 }}
                            className={cn('h-1.5 w-1.5 rounded-full', cls)}
                          />
                        ))}
                        {(projByDay.get(day)?.length ?? 0) + ((expByDay.get(day)?.length ?? 0) > 0 ? 1 : 0) > 3 && (
                          <span className="text-[9px] font-bold text-hearth-ink2">+</span>
                        )}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-hearth-ink2">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-hearth-accent" /> Posted</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full border border-hearth-blue" /> Projected</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-hearth-rose" /> Overdue</span>
          </div>
        </div>
      ) : (
        /* list view */
        <div className="mt-6 space-y-6">
          {weekGroups.map((g) => (
            <div key={g.label}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-base font-medium text-hearth-ink">{g.label}</h3>
                <span className="text-xs font-medium text-hearth-blue">projected {EUR(g.total)}</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {g.rows.map(({ p, date }) => (
                  <button
                    key={`${p.id}-${date}`}
                    type="button"
                    onClick={() => setSelectedDay(date)}
                    className="flex w-full items-center gap-3 rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 text-left transition-colors hover:border-hearth-blue/40"
                  >
                    <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-hearth-surface2 text-hearth-ink">
                      <span className="text-sm font-bold leading-none">{Number(date.slice(8))}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-hearth-ink">{p.title}</span>
                      <span className="block text-xs text-hearth-ink2">{p.category?.name ?? 'Uncategorized'}</span>
                    </span>
                    <span className="font-mono text-sm text-hearth-ink">{EUR(p.amountCents)}</span>
                    <StateChip p={p} date={date} overdue={isOverdue(p, date)} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* day detail sheet */}
      <Sheet open={!!selectedDay} onClose={() => setSelectedDay(null)}>
        {selectedDay && (
          <>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-medium text-hearth-ink">
                {DAY_FMT.format(fromISO(selectedDay))}
              </h2>
              <p className="text-xs font-medium text-hearth-ink2">
                Spent {EUR(selectedDayExpenses.reduce((s, e) => s + e.amountCents, 0))} · Projected{' '}
                {EUR(selectedDayItems.filter((i) => i.p.status === 'planned').reduce((s, i) => s + i.p.amountCents, 0))}
              </p>
            </div>

            {selectedDayItems.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-blue">Projected</p>
                <div className="mt-2 space-y-2">
                  {selectedDayItems.map(({ p, date }, idx) => (
                    <motion.div
                      key={`${p.id}-${date}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08, duration: 0.3, ease: SETTLE_EASE }}
                      className={cn(
                        'rounded-2xl border p-3 transition-colors duration-500',
                        justRealized === p.id || p.status === 'realized'
                          ? 'border-hearth-accent bg-hearth-accentSoft/50'
                          : p.status === 'skipped'
                            ? 'border-hearth-line bg-hearth-surface2/60 opacity-60'
                            : isOverdue(p, date)
                              ? 'border-dashed border-hearth-rose bg-hearth-rose/5'
                              : 'border-dashed border-hearth-blue bg-hearth-blue/5',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-hearth-ink">
                            <span className="truncate">{p.title}</span>
                            {p.recurrence !== 'none' && <Repeat className="h-3.5 w-3.5 shrink-0 text-hearth-blue" />}
                          </p>
                          <p className="text-xs text-hearth-ink2">
                            {p.category?.name ?? 'Uncategorized'}
                            {p.recurrence !== 'none' ? ` · repeats ${p.recurrence}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-sm font-medium text-hearth-ink">{EUR(p.amountCents)}</span>
                          <StateChip p={p} date={date} overdue={isOverdue(p, date)} />
                        </div>
                      </div>
                      {p.status === 'planned' && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRealizeFor(p)}
                            className="flex items-center gap-1 rounded-lg bg-hearth-accent px-2.5 py-1.5 text-xs font-semibold text-white"
                          >
                            <Link2 className="h-3.5 w-3.5" /> It's paid — link receipt
                          </button>
                          <button
                            type="button"
                            onClick={() => skipMut.mutate({ id: p.id })}
                            className="flex items-center gap-1 rounded-lg border border-hearth-line px-2.5 py-1.5 text-xs font-semibold text-hearth-ink2 hover:text-hearth-ink"
                          >
                            <SkipForward className="h-3.5 w-3.5" /> Skip
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSelectedDay(null); openPlan(undefined, p) }}
                            className="flex items-center gap-1 rounded-lg border border-hearth-line px-2.5 py-1.5 text-xs font-semibold text-hearth-ink2 hover:text-hearth-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" /> {p.recurrence !== 'none' ? 'Edit series' : 'Edit'}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {selectedDayExpenses.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-hearth-accent">Posted</p>
                <div className="mt-2 space-y-1.5">
                  {selectedDayExpenses.map((e) => (
                    <Link
                      key={e.id}
                      to={`/records/${e.id}`}
                      className="flex items-center gap-3 rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 transition-colors hover:border-hearth-accent/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-hearth-ink">{e.merchant ?? 'Expense'}</span>
                        <span className="block text-xs text-hearth-ink2">
                          {e.category?.name ?? 'Uncategorized'}
                          {e.payer?.name ? ` · paid by ${e.payer.name}` : ''}
                        </span>
                      </span>
                      <span className="font-mono text-sm text-hearth-ink">{EUR(e.amountCents)}</span>
                      {e.status === 'posted' && <Check className="h-4 w-4 text-hearth-accent" />}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {selectedDayItems.length === 0 && selectedDayExpenses.length === 0 && (
              <p className="mt-6 text-center text-sm text-hearth-ink2">Nothing posted or planned for this day.</p>
            )}

            <button
              type="button"
              onClick={() => { const d = selectedDay; setSelectedDay(null); openPlan(d) }}
              className="mt-5 w-full rounded-xl bg-hearth-blue px-4 py-3 text-sm font-semibold text-white"
            >
              Plan expense for this day
            </button>
          </>
        )}
      </Sheet>

      {/* realize picker */}
      <Sheet open={!!realizeFor} onClose={() => setRealizeFor(null)}>
        {realizeFor && (
          <>
            <h2 className="font-display text-xl font-medium text-hearth-ink">Link a receipt</h2>
            <p className="mt-1 text-xs text-hearth-ink2">
              Pick the posted shared expense that realizes “{realizeFor.title}” ({EUR(realizeFor.amountCents)}).
            </p>
            <div className="mt-4 space-y-1.5">
              {(realizePoolQ.data ?? [])
                .filter((e) => e.status === 'posted')
                .map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={realizeMut.isPending}
                    onClick={() => realizeMut.mutate({ id: realizeFor.id, expenseId: e.id })}
                    className="flex w-full items-center gap-3 rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2.5 text-left transition-colors hover:border-hearth-accent disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-hearth-ink">{e.merchant ?? 'Expense'}</span>
                      <span className="block font-mono text-xs text-hearth-ink2">{e.date}</span>
                    </span>
                    <span className="font-mono text-sm text-hearth-ink">{EUR(e.amountCents)}</span>
                  </button>
                ))}
              {(realizePoolQ.data ?? []).filter((e) => e.status === 'posted').length === 0 && (
                <p className="py-6 text-center text-sm text-hearth-ink2">
                  No posted shared expenses this month yet — add the receipt in Records first.
                </p>
              )}
            </div>
          </>
        )}
      </Sheet>

      {/* plan / edit sheet */}
      <PlanSheet
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        draft={draft}
        setDraft={setDraft}
        categories={categories}
        isEditingSeries={!!draft.id && projections.find((p) => p.id === draft.id)?.recurrence !== 'none' && !!draft.id}
        onSubmit={submitPlan}
        saving={createMut.isPending || updateMut.isPending}
      />
    </div>
  )
}

function StateChip({ p, overdue }: { p: Projection; date: string; overdue: boolean }) {
  if (p.status === 'realized')
    return (
      <span className="flex items-center gap-1 rounded-full bg-hearth-accentSoft px-2 py-0.5 text-[11px] font-semibold text-hearth-accent">
        <Check className="h-3 w-3" /> Realized
      </span>
    )
  if (p.status === 'skipped')
    return <span className="flex items-center gap-1 rounded-full bg-hearth-surface2 px-2 py-0.5 text-[11px] font-semibold text-hearth-ink2"><X className="h-3 w-3" /> Skipped</span>
  if (overdue)
    return <span className="rounded-full bg-hearth-rose/10 px-2 py-0.5 text-[11px] font-semibold text-hearth-rose">Overdue</span>
  return <span className="rounded-full border border-dashed border-hearth-blue px-2 py-0.5 text-[11px] font-semibold text-hearth-blue">Projected</span>
}
