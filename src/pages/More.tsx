import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import {
  ChevronRight,
  Users,
  Copy,
  Share2,
  Check,
  Tag,
  History,
  Download,
  EyeOff,
  Bell,
  BellOff,
  MonitorSmartphone,
  Palette,
  Info,
  GripVertical,
  Plus,
  Archive,
  Loader2,
  ShoppingCart,
  Utensils,
  Home as HomeIcon,
  Car,
  Plug,
  HeartPulse,
  Ticket,
  Shapes,
  type LucideIcon,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const ICON_MAP: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  home: HomeIcon,
  car: Car,
  plug: Plug,
  'heart-pulse': HeartPulse,
  ticket: Ticket,
  shapes: Shapes,
  tag: Tag,
}
const ICON_CHOICES = Object.keys(ICON_MAP)

function CategoryIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const Icon = (icon && ICON_MAP[icon]) || Tag
  return <Icon className={className ?? 'h-4 w-4'} />
}

/* ------------------------------ small pieces ------------------------------ */

function Group({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: EASE }}
      className="mt-8"
    >
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-hearth-ink2">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-hearth-line bg-hearth-surface">
        {children}
      </div>
    </motion.section>
  )
}

function Row({
  icon: Icon,
  label,
  caption,
  onClick,
  trailing,
  danger,
}: {
  icon: LucideIcon
  label: string
  caption?: string
  onClick?: () => void
  trailing?: React.ReactNode
  danger?: boolean
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-hearth-line px-4 py-3.5 text-left last:border-b-0"
    >
      <Icon className={cn('h-5 w-5 shrink-0', danger ? 'text-hearth-rose' : 'text-hearth-accent')} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[15px] font-medium', danger ? 'text-hearth-rose' : 'text-hearth-ink')}>
          {label}
        </span>
        {caption && <span className="block truncate text-xs text-hearth-ink2">{caption}</span>}
      </span>
      {trailing ?? (
        <ChevronRight className="h-4 w-4 shrink-0 text-hearth-ink2 transition-transform duration-200 group-hover:translate-x-1" />
      )}
    </motion.button>
  )
}

function useLocalPref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  }
  return [value, set]
}

/* ------------------------------- categories ------------------------------- */

function CategoryManager({ scope, title }: { scope: 'shared' | 'personal'; title: string }) {
  const utils = trpc.useUtils()
  const { data: categories } = trpc.category.list.useQuery({ includeArchived: false })
  const [items, setItems] = useState<NonNullable<typeof categories>>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('tag')

  const scoped = useMemo(
    () => (categories ?? []).filter((c) => c.scope === scope || c.scope === 'both'),
    [categories, scope],
  )
  useEffect(() => setItems(scoped), [scoped])

  const createMut = trpc.category.create.useMutation({
    onSuccess: () => {
      setAdding(false)
      setNewName('')
      utils.category.list.invalidate()
    },
  })
  const updateMut = trpc.category.update.useMutation({
    onSuccess: () => utils.category.list.invalidate(),
  })

  const persistOrder = (ordered: typeof items) => {
    ordered.forEach((c, i) => {
      if (c.sortOrder !== i) updateMut.mutate({ id: c.id, sortOrder: i })
    })
  }

  return (
    <div className={cn('border-b border-hearth-line last:border-b-0', scope === 'personal' && 'border-l-4 border-l-hearth-personal')}>
      <div className="flex items-center justify-between px-4 pt-3">
        <span className={cn('text-xs font-semibold uppercase tracking-wide', scope === 'personal' ? 'text-hearth-personal' : 'text-hearth-ink2')}>
          {title}
        </span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-hearth-accent"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <Reorder.Group axis="y" values={items} onReorder={setItems} className="px-2 py-2">
        {items.map((c) => (
          <Reorder.Item
            key={c.id}
            value={c}
            onDragEnd={() => persistOrder(items)}
            whileDrag={{ scale: 1.03, boxShadow: '0 8px 24px -12px rgba(28,26,23,.25)' }}
            className="flex items-center gap-2 rounded-xl bg-hearth-surface px-2 py-2.5"
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-hearth-ink2" />
            <CategoryIcon icon={c.icon} className={cn('h-4 w-4 shrink-0', scope === 'personal' ? 'text-hearth-personal' : 'text-hearth-accent')} />
            <span className="flex-1 truncate text-sm font-medium text-hearth-ink">{c.name}</span>
            <button
              type="button"
              title="Archive (keeps history intact)"
              onClick={() => updateMut.mutate({ id: c.id, archived: true })}
              className="rounded-lg p-1.5 text-hearth-ink2 transition-colors hover:bg-hearth-surface2 hover:text-hearth-rose"
            >
              <Archive className="h-4 w-4" />
            </button>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <p className="px-4 pb-3 text-xs text-hearth-ink2">Archiving keeps history intact.</p>
      <AnimatePresence>
        {adding && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault()
              if (newName.trim())
                createMut.mutate({
                  name: newName.trim(),
                  icon: newIcon,
                  scope,
                  sortOrder: items.length,
                })
            }}
          >
            <div className="flex flex-col gap-2 border-t border-hearth-line p-4">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name"
                className="h-11 rounded-xl border border-hearth-line bg-hearth-surface px-3 text-sm text-hearth-ink outline-none focus:border-hearth-accent"
              />
              <div className="flex flex-wrap gap-2">
                {ICON_CHOICES.map((key) => {
                  const Icon = ICON_MAP[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewIcon(key)}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg border',
                        newIcon === key
                          ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                          : 'border-hearth-line text-hearth-ink2',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
              <button
                type="submit"
                disabled={createMut.isPending || !newName.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-hearth-accent text-sm font-semibold text-white disabled:opacity-50"
              >
                {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Add category
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------- audit log ------------------------------- */

const ENTITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Receipts' },
  { key: 'reimbursement', label: 'Requests' },
  { key: 'advance', label: 'Advances' },
  { key: 'settlement', label: 'Settlements' },
  { key: 'family', label: 'Family' },
  { key: 'category', label: 'Categories' },
]

function AuditLog({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const { data: events, isLoading } = trpc.audit.list.useQuery({ limit: 200 })

  const filtered = useMemo(
    () => (events ?? []).filter((e) => filter === 'all' || e.entityType === filter),
    [events, filter],
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="fixed inset-0 z-[60] flex flex-col bg-hearth-bg"
    >
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4">
        <h2 className="font-display text-2xl font-medium text-hearth-ink">Audit log</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-hearth-line px-4 py-2 text-sm font-semibold text-hearth-ink"
        >
          Done
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-wrap gap-2 px-4 pb-3">
        {ENTITY_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              filter === f.key
                ? 'bg-hearth-accent text-white'
                : 'border border-hearth-line text-hearth-ink2 hover:text-hearth-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-hearth-ink2" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-hearth-ink2">Nothing here yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-hearth-line bg-hearth-surface">
            <AnimatePresence mode="popLayout">
              {filtered.map((e, i) => {
                const actorName = e.actor?.name ?? 'Someone'
                const open = expanded === e.id
                return (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.03, ease: EASE }}
                    className="border-b border-hearth-line last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : e.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="font-mono text-[11px] text-hearth-ink2">
                        {new Date(e.createdAt).toLocaleString('en-IE', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {e.actor?.avatar ? (
                        <img src={e.actor.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-hearth-accentSoft text-[10px] font-semibold text-hearth-accent">
                          {actorName.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-hearth-ink">
                        {actorName} · {e.action.replace(/_/g, ' ')} · {e.entityType}
                      </span>
                      <ChevronRight
                        className={cn('h-4 w-4 shrink-0 text-hearth-ink2 transition-transform', open && 'rotate-90')}
                      />
                    </button>
                    <AnimatePresence>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                          className="overflow-hidden"
                        >
                          <div className="grid gap-2 bg-hearth-surface2/60 px-4 py-3 font-mono text-[11px] leading-5 text-hearth-ink2 sm:grid-cols-2">
                            <div>
                              <p className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide">Before</p>
                              <pre className="whitespace-pre-wrap break-all">
                                {e.beforeJson ? JSON.stringify(e.beforeJson, null, 2) : '—'}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide">After</p>
                              <pre className="whitespace-pre-wrap break-all">
                                {e.afterJson ? JSON.stringify(e.afterJson, null, 2) : '—'}
                              </pre>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
        <p className="mt-3 text-center text-xs text-hearth-ink2">
          Nothing here can be edited or deleted.
        </p>
      </div>
    </motion.div>
  )
}

/* --------------------------------- export --------------------------------- */

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

function ExportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [scope, setScope] = useState<'shared' | 'personal'>('shared')
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const utils = trpc.useUtils()
  const [busy, setBusy] = useState(false)

  const runExport = async () => {
    setBusy(true)
    try {
      const range = { from: from || undefined, to: to || undefined }
      const data =
        scope === 'shared'
          ? await utils.expense.list.fetch(range)
          : await utils.expense.listPersonal.fetch(range)
      const rows = data.map((e) => ({
        date: e.date,
        merchant: e.merchant ?? '',
        amount: (e.amountCents / 100).toFixed(2),
        currency: e.currency,
        status: e.status,
        payer: e.payer?.name ?? '',
        category: e.category?.name ?? '',
        notes: e.notes ?? '',
      }))
      if (format === 'csv') {
        download(`hearth-${scope}-export.csv`, toCsv(rows))
      } else {
        // Lightweight "PDF" path: printable view the user can save as PDF.
        const win = window.open('', '_blank')
        if (win) {
          win.document.write(
            `<html><head><title>Hearth export</title><style>body{font-family:system-ui;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;font-size:12px;text-align:left}img{max-width:80px}</style></head><body><h1>Hearth ${scope} export</h1><table><tr>${Object.keys(rows[0] ?? { note: '' }).map((c) => `<th>${c}</th>`).join('')}</tr>${rows
              .map((r) => `<tr>${Object.values(r).map((v) => `<td>${String(v)}</td>`).join('')}</tr>`)
              .join('')}</table></body></html>`,
          )
          win.document.close()
          win.print()
        }
      }
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Export</SheetTitle>
          <SheetDescription>Personal exports contain only your data.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-hearth-ink2">Scope</p>
            <div className="flex gap-2">
              {(['shared', 'personal'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize',
                    scope === s
                      ? s === 'personal'
                        ? 'border-hearth-personal bg-hearth-personal/10 text-hearth-personal'
                        : 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                      : 'border-hearth-line text-hearth-ink2',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-hearth-ink2">Format</p>
            <div className="flex gap-2">
              {(['csv', 'pdf'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    'flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold uppercase',
                    format === f
                      ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                      : 'border-hearth-line text-hearth-ink2',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-hearth-ink2">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 text-sm font-normal normal-case text-hearth-ink"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-hearth-ink2">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 text-sm font-normal normal-case text-hearth-ink"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={runExport}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-hearth-accent text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ------------------------------ notifications ----------------------------- */

const NOTIF_TYPES = [
  { key: 'expense_added', label: 'Partner added an expense' },
  { key: 'request_awaiting', label: 'Request awaiting me' },
  { key: 'request_decided', label: 'Request approved / rejected' },
  { key: 'advance_aging', label: 'Advance aging' },
  { key: 'refund_registered', label: 'Refund registered' },
  { key: 'bill_due', label: 'Bill due' },
]

function NotificationsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils()
  const { data: notifications, isLoading } = trpc.notification.list.useQuery({ limit: 50 })
  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  })
  const markAll = trpc.notification.markAllRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  })
  const [prefs, setPrefs] = useLocalPref<Record<string, boolean>>(
    'hearth.notifPrefs',
    Object.fromEntries(NOTIF_TYPES.map((t) => [t.key, true])),
  )
  const [permission, setPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            {permission === 'granted'
              ? 'Push permission granted.'
              : permission === 'denied'
                ? 'Notifications are blocked — enable them in your browser or OS settings.'
                : 'Get notified when your partner adds an expense.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-8">
          {permission === 'default' && (
            <button
              type="button"
              onClick={async () => {
                const p = await Notification.requestPermission()
                setPermission(p)
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-hearth-accent text-sm font-semibold text-white"
            >
              <Bell className="h-4 w-4" /> Enable notifications
            </button>
          )}
          {permission === 'denied' && (
            <div className="flex items-center gap-2 rounded-xl border border-hearth-rose/40 bg-hearth-rose/10 px-3 py-2.5 text-xs font-medium text-hearth-rose">
              <BellOff className="h-4 w-4" /> Blocked — update this in your device settings.
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-hearth-ink2">Notify me about</p>
            <div className="overflow-hidden rounded-2xl border border-hearth-line">
              {NOTIF_TYPES.map((t) => (
                <div key={t.key} className="flex items-center justify-between border-b border-hearth-line px-4 py-3 last:border-b-0">
                  <span className="text-sm font-medium text-hearth-ink">{t.label}</span>
                  <Switch
                    checked={prefs[t.key] ?? true}
                    onCheckedChange={(v) => setPrefs({ ...prefs, [t.key]: v })}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-hearth-ink2">Recent</p>
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="text-xs font-semibold text-hearth-accent"
              >
                Mark all read
              </button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-hearth-ink2" />
              </div>
            ) : (notifications ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-hearth-ink2">No notifications yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-hearth-line">
                {(notifications ?? []).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => !n.readAt && markRead.mutate({ id: n.id })}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-hearth-line px-4 py-3 text-left last:border-b-0',
                      !n.readAt && 'bg-hearth-accentSoft/40',
                    )}
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-hearth-line' : 'bg-hearth-accent')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-hearth-ink">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-hearth-ink2">{n.body}</span>}
                    </span>
                    <span className="font-mono text-[10px] text-hearth-ink2">
                      {new Date(n.createdAt).toLocaleDateString('en-IE', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ---------------------------------- page ---------------------------------- */

export default function More() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const utils = trpc.useUtils()
  const { data: familyData } = trpc.family.current.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  })

  const [familySheet, setFamilySheet] = useState(false)
  const [inviteSheet, setInviteSheet] = useState(false)
  const [splitSheet, setSplitSheet] = useState(false)
  const [notifSheet, setNotifSheet] = useState(false)
  const [exportSheet, setExportSheet] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [copied, setCopied] = useState(false)

  const [editName, setEditName] = useState('')
  const [editCurrency, setEditCurrency] = useState('')
  const [split, setSplit] = useLocalPref<number>('hearth.defaultSplit', 50)
  const [privacyBlur, setPrivacyBlur] = useLocalPref<boolean>('hearth.privacyBlur', false)
  const [theme, setTheme] = useLocalPref<'auto' | 'light' | 'dark'>('hearth.theme', 'auto')

  const family = familyData?.family ?? null
  const partner = useMemo(
    () => familyData?.members.find((m) => m.user.id !== user?.id) ?? null,
    [familyData, user],
  )

  const updateSettings = trpc.family.updateSettings.useMutation({
    onSuccess: () => utils.family.current.invalidate(),
  })

  // PWA install prompt
  const [installEvt, setInstallEvt] = useState<Event | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Theme: record preference (base theme follows system; note explains)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Apply privacy blur preference to the document root for money figures
  useEffect(() => {
    document.documentElement.classList.toggle('privacy-blur', privacyBlur)
    return () => document.documentElement.classList.remove('privacy-blur')
  }, [privacyBlur])

  const inviteCode = family?.inviteCode ?? ''

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-hearth-surface2" />
        <div className="mt-8 h-24 animate-pulse rounded-2xl bg-hearth-surface2" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-hearth-surface2" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-hearth-ink">More</h1>
        <p className="mt-3 max-w-sm text-sm text-hearth-ink2">
          Sign in to manage your family, categories, notifications and exports.
        </p>
        <Link
          to={LOGIN_PATH}
          className="mt-6 inline-flex h-12 items-center rounded-xl bg-hearth-accent px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-hearth-ink">More</h1>

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="mt-6 rounded-2xl border border-hearth-line bg-hearth-surface p-4"
      >
        <div className="flex items-center gap-4">
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="h-14 w-14 rounded-full border border-hearth-line object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-hearth-accentSoft text-xl font-semibold text-hearth-accent">
              {(user?.name ?? 'H').slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold text-hearth-ink">
              {user?.name ?? user?.email ?? 'Member'}
            </p>
            {partner && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-hearth-ink2">
                <span className="h-1.5 w-1.5 rounded-full bg-hearth-accent" />
                Partner: {partner.user?.name ?? 'linked'} ✓ linked
              </p>
            )}
            {family && <p className="mt-0.5 text-xs text-hearth-ink2">{family.name} · {family.currency}</p>}
          </div>
        </div>
        <div className="mt-4 border-t border-hearth-line pt-3">
          {confirmLogout ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-hearth-rose">
                Local data will be wiped from this device. Sign out?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => logout()}
                  className="flex-1 rounded-xl bg-hearth-rose px-3 py-2.5 text-sm font-semibold text-white"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLogout(false)}
                  className="flex-1 rounded-xl border border-hearth-line px-3 py-2.5 text-sm font-semibold text-hearth-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="text-sm font-semibold text-hearth-rose"
            >
              Sign out
            </button>
          )}
        </div>
      </motion.div>

      {/* Family */}
      <Group title="Family" index={1}>
        <Row
          icon={Users}
          label="Family name & currency"
          caption={family ? `${family.name} · ${family.currency}` : 'No family yet'}
          onClick={() => {
            setEditName(family?.name ?? '')
            setEditCurrency(family?.currency ?? 'EUR')
            setFamilySheet(true)
          }}
        />
        {family && (
          <Row
            icon={Copy}
            label="Invite partner"
            caption={partner ? 'Partner already linked' : 'Share your invite code'}
            onClick={() => setInviteSheet(true)}
          />
        )}
        <Row
          icon={Share2}
          label="Default split"
          caption={`You ${split}% · Partner ${100 - split}%`}
          onClick={() => setSplitSheet(true)}
        />
        <Row
          icon={History}
          label="Advance aging warning"
          trailing={
            <span className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease days"
                onClick={() =>
                  family && updateSettings.mutate({ advanceAgingWarnDays: Math.max(1, (family.advanceAgingWarnDays ?? 14) - 1) })
                }
                className="h-8 w-8 rounded-lg border border-hearth-line text-sm font-semibold text-hearth-ink"
              >
                −
              </button>
              <span className="w-10 text-center font-mono text-sm text-hearth-ink">
                {family?.advanceAgingWarnDays ?? 14}d
              </span>
              <button
                type="button"
                aria-label="Increase days"
                onClick={() =>
                  family && updateSettings.mutate({ advanceAgingWarnDays: Math.min(90, (family.advanceAgingWarnDays ?? 14) + 1) })
                }
                className="h-8 w-8 rounded-lg border border-hearth-line text-sm font-semibold text-hearth-ink"
              >
                +
              </button>
            </span>
          }
        />
      </Group>

      {/* Categories */}
      <Group title="Categories" index={2}>
        <CategoryManager scope="shared" title="Shared categories" />
        <CategoryManager scope="personal" title="Personal categories" />
      </Group>

      {/* Data & history */}
      <Group title="Data & history" index={3}>
        <Row icon={History} label="Audit log" caption="Every change, newest first" onClick={() => setAuditOpen(true)} />
        <Row icon={Download} label="Export" caption="CSV or PDF · shared or personal" onClick={() => setExportSheet(true)} />
        <Row
          icon={EyeOff}
          label="Privacy shield default"
          caption="Amounts blur on app open"
          trailing={<Switch checked={privacyBlur} onCheckedChange={setPrivacyBlur} />}
        />
      </Group>

      {/* App */}
      <Group title="App" index={4}>
        <Row icon={Bell} label="Notifications" caption="Per-type toggles & push permission" onClick={() => setNotifSheet(true)} />
        {installEvt && (
          <Row
            icon={MonitorSmartphone}
            label="Install app"
            caption="Add Hearth to your home screen"
            onClick={() => {
              const evt = installEvt as Event & { prompt?: () => void }
              evt.prompt?.()
              setInstallEvt(null)
            }}
          />
        )}
        <Row
          icon={Palette}
          label="Theme"
          trailing={
            <span className="flex overflow-hidden rounded-lg border border-hearth-line">
              {(['auto', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold capitalize',
                    theme === t ? 'bg-hearth-accent text-white' : 'text-hearth-ink2',
                  )}
                >
                  {t}
                </button>
              ))}
            </span>
          }
        />
        <p className="border-b border-hearth-line px-4 pb-3 text-xs text-hearth-ink2">
          Hearth follows your system appearance; this preference is remembered for a future
          dedicated dark palette.
        </p>
        <Row icon={Info} label="About" caption="Hearth · version 1.0.0" trailing={<span />} />
      </Group>

      {/* Sheets & overlays */}
      <Sheet open={familySheet} onOpenChange={setFamilySheet}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Family name & currency</SheetTitle>
          </SheetHeader>
          <form
            className="flex flex-col gap-3 px-4 pb-6"
            onSubmit={(e) => {
              e.preventDefault()
              updateSettings.mutate(
                { name: editName.trim() || undefined, currency: editCurrency.toUpperCase() || undefined },
                { onSuccess: () => setFamilySheet(false) },
              )
            }}
          >
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Family name"
              className="h-12 rounded-xl border border-hearth-line bg-hearth-surface px-4 text-sm text-hearth-ink outline-none focus:border-hearth-accent"
            />
            <input
              value={editCurrency}
              onChange={(e) => setEditCurrency(e.target.value.slice(0, 3))}
              placeholder="EUR"
              maxLength={3}
              className="h-12 rounded-xl border border-hearth-line bg-hearth-surface px-4 font-mono text-sm uppercase text-hearth-ink outline-none focus:border-hearth-accent"
            />
            <button
              type="submit"
              disabled={updateSettings.isPending || !family}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-hearth-accent text-sm font-semibold text-white disabled:opacity-50"
            >
              {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={inviteSheet} onOpenChange={setInviteSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Invite partner</SheetTitle>
            <SheetDescription>Expires in 6 days · regenerating invalidates the old code.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col items-center gap-4 px-4 pb-8">
            <p className="font-mono text-4xl font-semibold tracking-[0.25em] text-hearth-accent">
              {inviteCode || '—'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(inviteCode).catch(() => {})
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-hearth-line px-5 text-sm font-semibold text-hearth-ink"
              >
                {copied ? <Check className="h-4 w-4 text-hearth-accent" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              {typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={() =>
                    navigator
                      .share({ title: 'Join my Hearth family', text: `Join my family on Hearth with code ${inviteCode}` })
                      .catch(() => {})
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-hearth-accent px-5 text-sm font-semibold text-white"
                >
                  <Share2 className="h-4 w-4" /> Share
                </button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={splitSheet} onOpenChange={setSplitSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Default split</SheetTitle>
            <SheetDescription>Applies to new receipts; each receipt can override.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4 pb-8">
            <div className="flex gap-2">
              {[50, 60, 70].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSplit(v)}
                  className={cn(
                    'flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold',
                    split === v
                      ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                      : 'border-hearth-line text-hearth-ink2',
                  )}
                >
                  {v}/{100 - v}
                </button>
              ))}
            </div>
            <div className="px-1">
              <Slider
                value={[split]}
                onValueChange={([v]) => setSplit(v)}
                min={10}
                max={90}
                step={5}
              />
            </div>
            <p className="text-center text-sm text-hearth-ink2">
              On a €100 receipt: you{' '}
              <span className="font-mono font-medium text-hearth-ink">€{split.toFixed(0)}</span> ·{' '}
              {partner?.user?.name ?? 'partner'}{' '}
              <span className="font-mono font-medium text-hearth-ink">€{(100 - split).toFixed(0)}</span>
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <ExportSheet open={exportSheet} onOpenChange={setExportSheet} />
      <NotificationsSheet open={notifSheet} onOpenChange={setNotifSheet} />
      <AnimatePresence>{auditOpen && <AuditLog onClose={() => setAuditOpen(false)} />}</AnimatePresence>
    </div>
  )
}
