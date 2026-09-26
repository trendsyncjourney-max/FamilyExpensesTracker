import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  MoreHorizontal,
  Undo2,
  Download,
  X,
  History,
  HandCoins,
  CalendarClock,
  Check,
  Circle,
  ReceiptText,
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
  todayISO,
} from './shared'

type AuditEvent = {
  id: number
  action: string
  createdAt: string | Date
  actor?: { id: number; name: string | null; avatar: string | null } | null
  before?: unknown
  after?: unknown
}

export default function RecordDetail() {
  return (
    <AuthGate>
      <DetailInner />
    </AuthGate>
  )
}

function DetailInner() {
  const { id } = useParams()
  const expenseId = Number(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const expenseQuery = trpc.expense.getById.useQuery(
    { id: expenseId },
    { enabled: Number.isFinite(expenseId) && expenseId > 0 },
  )
  const auditQuery = trpc.expense.auditTrail.useQuery(
    { id: expenseId },
    { enabled: Number.isFinite(expenseId) && expenseId > 0 },
  )
  const summaryQuery = trpc.dashboard.summary.useQuery()

  const [menuOpen, setMenuOpen] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [returnSheet, setReturnSheet] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Edit draft fields
  const [editMerchant, setEditMerchant] = useState('')
  const [editAmount, setEditAmount] = useState('')

  // Return sheet fields
  const [refundAmount, setRefundAmount] = useState('')
  const [refundDate, setRefundDate] = useState(todayISO())
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'other'>('card')
  const [refundNote, setRefundNote] = useState('')

  const invalidate = async () => {
    await Promise.all([
      utils.expense.getById.invalidate({ id: expenseId }),
      utils.expense.list.invalidate(),
      utils.expense.auditTrail.invalidate({ id: expenseId }),
      utils.dashboard.summary.invalidate(),
    ])
  }

  const updateMut = trpc.expense.update.useMutation({
    onSuccess: async () => {
      setEditMode(false)
      await invalidate()
    },
    onError: (e) => setActionError(e.message),
  })
  const transitionMut = trpc.expense.transition.useMutation({
    onSuccess: invalidate,
    onError: (e) => setActionError(e.message),
  })
  const addRefundMut = trpc.expense.addRefund.useMutation({
    onSuccess: async () => {
      setReturnSheet(false)
      setRefundAmount('')
      setRefundNote('')
      await invalidate()
    },
    onError: (e) => setActionError(e.message),
  })
  const returnStatusMut = trpc.expense.setReturnStatus.useMutation({
    onSuccess: invalidate,
    onError: (e) => setActionError(e.message),
  })
  const createMut = trpc.expense.create.useMutation({
    onSuccess: async (created) => {
      await utils.expense.list.invalidate()
      if (created?.id) navigate(`/records/${created.id}`, { replace: true })
    },
    onError: (e) => setActionError(e.message),
  })

  const e = expenseQuery.data
  const partner = useMemo(
    () => summaryQuery.data?.members.find((m) => m.userId !== user?.id) ?? null,
    [summaryQuery.data, user?.id],
  )

  const refunds = useMemo(() => e?.refunds ?? [], [e])
  const refundedCents = refunds.reduce((acc, r) => acc + r.amountCents, 0)
  const effectiveCents = e ? e.amountCents - refundedCents : 0
  const remainingRefundable = e ? e.amountCents - refundedCents : 0

  const auditEvents = (auditQuery.data ?? []) as unknown as AuditEvent[]

  if (expenseQuery.isLoading) return <PageSkeleton />
  if (expenseQuery.error || !e)
    return (
      <QueryErrorState
        message={expenseQuery.error?.message ?? 'Record not found'}
        onRetry={() => expenseQuery.refetch()}
      />
    )

  const Icon = categoryIcon(e.category?.name ?? e.merchant)
  const canEdit = e.status === 'draft'
  const isVoided = e.status === 'voided'
  const isMine = e.payerId === user?.id

  const timeline: { label: string; done: boolean; tone: 'green' | 'amber' | 'rose' }[] = (() => {
    const actions = new Set(auditEvents.map((a) => a.action))
    const steps: { label: string; done: boolean; tone: 'green' | 'amber' | 'rose' }[] = []
    steps.push({ label: 'Created', done: true, tone: 'green' })
    steps.push({
      label: 'Submitted',
      done: e.status !== 'draft' || actions.has('post'),
      tone: 'green',
    })
    if (e.status === 'disputed' || actions.has('dispute')) {
      steps.push({ label: 'Needs changes', done: true, tone: 'rose' })
    }
    if (e.status === 'resolved' || actions.has('resolve')) {
      steps.push({ label: 'Approved — awaiting payment', done: true, tone: 'amber' })
    }
    if (e.status === 'posted') {
      steps.push({ label: 'Paid ✓ Cleared', done: true, tone: 'green' })
    }
    if (isVoided) {
      steps.push({ label: 'Voided', done: true, tone: 'rose' })
    }
    return steps
  })()

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-6">
        <button
          aria-label="Back to records"
          onClick={() => navigate('/records')}
          className="rounded-full p-1.5 text-hearth-ink2 hover:bg-hearth-surface2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-lg font-semibold text-hearth-ink">Record</h1>
        <div className="relative">
          <button
            aria-label="More actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full p-1.5 text-hearth-ink2 hover:bg-hearth-surface2"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-2xl border border-hearth-line bg-hearth-surface shadow-card">
              <button
                disabled={!canEdit}
                onClick={() => {
                  setMenuOpen(false)
                  setEditMerchant(e.merchant ?? '')
                  setEditAmount((e.amountCents / 100).toFixed(2))
                  setEditMode(true)
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-hearth-ink hover:bg-hearth-surface2 disabled:opacity-40"
              >
                Edit {canEdit ? '' : '(drafts only)'}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  createMut.mutate({
                    scope: 'shared',
                    amountCents: e.amountCents,
                    merchant: e.merchant ?? undefined,
                    date: todayISO(),
                    categoryId: e.categoryId ?? undefined,
                    notes: e.notes ? `Copy of #${e.id}\n${e.notes}` : `Copy of #${e.id}`,
                    asDraft: true,
                  })
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-hearth-ink hover:bg-hearth-surface2"
              >
                Duplicate
              </button>
              <button
                disabled={isVoided}
                onClick={() => {
                  setMenuOpen(false)
                  const reason = window.prompt('Reason for voiding this record?')
                  if (reason !== null)
                    transitionMut.mutate({ id: e.id, action: 'void', comment: reason || undefined })
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-hearth-rose hover:bg-hearth-surface2 disabled:opacity-40"
              >
                Void
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setAuditOpen(true)
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-hearth-ink hover:bg-hearth-surface2"
              >
                Audit history
              </button>
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <p className="mt-4 rounded-xl bg-hearth-rose/10 px-4 py-2.5 text-sm font-medium text-hearth-rose">
          {actionError}
        </p>
      )}

      {/* ReceiptCard hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: SETTLE_EASE }}
        className="mt-6"
      >
        {e.receiptUrl ? (
          <button onClick={() => setLightbox(true)} className="group relative block">
            <div className="relative -rotate-2 overflow-hidden rounded-2xl border border-hearth-line bg-hearth-surface shadow-card transition-transform group-active:scale-[0.98]">
              {/* perforated edge */}
              <svg className="absolute inset-x-0 top-0 h-3 w-full text-hearth-bg" preserveAspectRatio="none" viewBox="0 0 100 4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <circle key={i} cx={4 + i * 8.4} cy="0" r="2.2" fill="currentColor" />
                ))}
              </svg>
              <img src={e.receiptUrl} alt="Receipt" className="max-h-72 w-full object-contain pt-3" />
            </div>
          </button>
        ) : (
          <div className="flex h-40 -rotate-2 items-center justify-center rounded-2xl border border-dashed border-hearth-line bg-hearth-surface">
            <span className="flex flex-col items-center gap-2 text-hearth-ink2">
              <ReceiptText className="h-8 w-8" />
              <span className="text-xs">No receipt photo</span>
            </span>
          </div>
        )}

        {/* Amount + meta */}
        <div className="mt-6">
          {editMode ? (
            <div className="space-y-3 rounded-2xl border border-hearth-line bg-hearth-surface p-4">
              <input
                value={editMerchant}
                onChange={(ev) => setEditMerchant(ev.target.value)}
                placeholder="Merchant"
                className="w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink outline-none"
              />
              <input
                value={editAmount}
                onChange={(ev) => setEditAmount(ev.target.value)}
                inputMode="decimal"
                placeholder="Amount"
                className="w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 font-mono text-sm text-hearth-ink outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode(false)}
                  className="flex-1 rounded-xl border border-hearth-line px-3 py-2 text-sm font-semibold text-hearth-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const cents = Math.round(parseFloat(editAmount.replace(',', '.') || '0') * 100)
                    updateMut.mutate({
                      id: e.id,
                      merchant: editMerchant || null,
                      ...(cents > 0 ? { amountCents: cents } : {}),
                    })
                  }}
                  disabled={updateMut.isPending}
                  className="flex-1 rounded-xl bg-hearth-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-mono text-[40px] leading-[44px] tracking-[-0.02em] text-hearth-ink">
                {eur(e.amountCents, e.currency)}
              </p>
              <h2 className="mt-1 font-display text-[22px] leading-7 text-hearth-ink">
                {e.merchant ?? e.category?.name ?? 'Expense'}
              </h2>
              <p className="mt-1 text-sm text-hearth-ink2">
                {fmtDate(e.date)} · Paid by{' '}
                {e.payer?.name ?? (isMine ? 'you' : (partner?.name ?? 'partner'))}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {e.category && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-hearth-surface2 px-3 py-1 text-xs font-semibold text-hearth-ink">
                    <Icon className="h-3.5 w-3.5 text-hearth-ink2" />
                    {e.category.name}
                  </span>
                )}
                <ExpenseStatusChip status={e.status} />
                <ReturnStatusChip status={e.returnStatus} />
              </div>
            </>
          )}
        </div>
      </motion.div>

      {e.status === 'disputed' && (
        <div className="mt-4 rounded-2xl border border-hearth-rose/30 bg-hearth-rose/5 p-4">
          <p className="text-sm font-semibold text-hearth-rose">Needs changes</p>
          <p className="mt-1 text-xs text-hearth-ink2">
            This record was sent back. Review the notes, then resolve when fixed.
          </p>
          <button
            onClick={() => transitionMut.mutate({ id: e.id, action: 'resolve' })}
            disabled={transitionMut.isPending}
            className="mt-3 rounded-xl bg-hearth-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Mark resolved
          </button>
        </div>
      )}
      {e.status === 'draft' && (
        <button
          onClick={() => transitionMut.mutate({ id: e.id, action: 'post' })}
          disabled={transitionMut.isPending}
          className="mt-4 w-full rounded-xl bg-hearth-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Submit receipt
        </button>
      )}
      {e.status === 'posted' && (
        <button
          onClick={() => {
            const comment = window.prompt('What needs changes?')
            if (comment) transitionMut.mutate({ id: e.id, action: 'dispute', comment })
          }}
          disabled={transitionMut.isPending}
          className="mt-4 w-full rounded-xl border border-hearth-line px-4 py-2.5 text-sm font-semibold text-hearth-ink hover:bg-hearth-surface2 disabled:opacity-50"
        >
          Send back — ask for changes
        </button>
      )}

      {/* Split visualization */}
      <section className="mt-8">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
          Split
        </p>
        <div className="mt-3 rounded-2xl bg-hearth-surface p-4 shadow-card">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-hearth-surface2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '50%' }}
              transition={{ duration: 0.9, ease: SETTLE_EASE }}
              className="absolute inset-y-0 left-0 rounded-full bg-hearth-accent"
            />
            <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-hearth-ink/25" />
          </div>
          <p className="mt-3 text-xs text-hearth-ink2">
            {e.payer?.name ?? (isMine ? 'You' : 'Partner')} paid {eur(e.amountCents, e.currency)} ·
            fair 50/50 split — each bears {eur(Math.round(e.amountCents / 2), e.currency)}
            {refundedCents > 0 &&
              ` · after refunds each bears ${eur(Math.round(effectiveCents / 2), e.currency)}`}
          </p>
        </div>
      </section>

      {/* Status timeline */}
      <section className="mt-8">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
          Status
        </p>
        <div className="mt-3 rounded-2xl bg-hearth-surface p-4 shadow-card">
          {timeline.map((t, i) => (
            <motion.div
              key={`${t.label}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12, duration: 0.3, ease: SETTLE_EASE }}
              className="flex items-start gap-3 pb-4 last:pb-0"
            >
              <span className="relative mt-0.5 flex flex-col items-center">
                {t.done ? (
                  <Check
                    className={cn(
                      'h-4 w-4',
                      t.tone === 'green' && 'text-hearth-accent',
                      t.tone === 'amber' && 'text-hearth-amber',
                      t.tone === 'rose' && 'text-hearth-rose',
                    )}
                  />
                ) : (
                  <Circle className="h-4 w-4 text-hearth-line" />
                )}
                {i < timeline.length - 1 && (
                  <span className="absolute top-5 h-4 w-px bg-hearth-line" />
                )}
              </span>
              <span className="text-sm font-medium text-hearth-ink">{t.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Linked entities */}
      {(e.advanceId || e.projectedExpenseId) && (
        <section className="mt-8">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
            Linked
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {e.advanceId && (
              <Link
                to="/requests"
                className="inline-flex items-center gap-1.5 rounded-full border border-hearth-gold/50 bg-hearth-gold/10 px-3 py-1.5 text-xs font-semibold text-hearth-gold"
              >
                <HandCoins className="h-3.5 w-3.5" />
                Clears an advance
              </Link>
            )}
            {e.projectedExpenseId && (
              <Link
                to="/calendar"
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-hearth-blue/50 bg-hearth-blue/5 px-3 py-1.5 text-xs font-semibold text-hearth-blue"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Realized a planned expense
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Notes */}
      {e.notes && (
        <section className="mt-8">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
            Notes
          </p>
          <p className="mt-2 whitespace-pre-line rounded-2xl bg-hearth-surface p-4 text-sm text-hearth-ink shadow-card">
            {e.notes}
          </p>
        </section>
      )}

      {/* Returns block */}
      <section className="mt-8">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
          Returns
        </p>
        <div className="mt-3 rounded-2xl bg-hearth-surface p-4 shadow-card">
          {refunds.length === 0 && e.returnStatus === 'none' ? (
            <div className="rounded-xl border border-dashed border-hearth-line p-4 text-center">
              <Undo2 className="mx-auto h-5 w-5 text-hearth-ink2" />
              <p className="mt-2 text-sm font-medium text-hearth-ink">Returning something?</p>
              <p className="mt-1 text-xs text-hearth-ink2">
                Link it to the original receipt — the record stays, the amount adjusts.
              </p>
              {!isVoided && (
                <div className="mt-3 flex justify-center gap-2">
                  <button
                    onClick={() => {
                      setRefundDate(todayISO())
                      setReturnSheet(true)
                    }}
                    className="rounded-xl bg-hearth-accent px-4 py-2 text-sm font-semibold text-white"
                  >
                    Register a return
                  </button>
                  <button
                    onClick={() =>
                      returnStatusMut.mutate({ id: e.id, returnStatus: 'return_initiated' })
                    }
                    className="rounded-xl border border-hearth-line px-4 py-2 text-sm font-semibold text-hearth-ink hover:bg-hearth-surface2"
                  >
                    Return started
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {e.returnStatus === 'return_initiated' && refunds.length === 0 && (
                <p className="mb-3 rounded-xl bg-hearth-blue/10 px-3 py-2 text-xs font-semibold text-hearth-blue">
                  Return in progress — refund pending
                </p>
              )}
              <div className="divide-y divide-hearth-line">
                {refunds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-hearth-ink">
                        Refund · {r.method}
                      </p>
                      <p className="text-xs text-hearth-ink2">
                        {fmtDate(r.date)}
                        {r.note ? ` · ${r.note}` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-sm text-hearth-accent">
                      −{eur(r.amountCents, e.currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-hearth-line pt-3">
                <p className="text-sm font-semibold text-hearth-ink">Effective total</p>
                <p className="font-mono text-sm font-semibold text-hearth-ink">
                  {eur(effectiveCents, e.currency)}
                </p>
              </div>
              {!isVoided && remainingRefundable > 0 && (
                <button
                  onClick={() => setReturnSheet(true)}
                  className="mt-3 w-full rounded-xl border border-hearth-line px-4 py-2 text-sm font-semibold text-hearth-ink hover:bg-hearth-surface2"
                >
                  Add another refund
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Audit trail */}
      <section className="mt-8">
        <button
          onClick={() => setAuditOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl bg-hearth-surface px-4 py-3.5 shadow-card"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-hearth-ink">
            <History className="h-4 w-4 text-hearth-ink2" />
            History ({auditEvents.length})
          </span>
          <span className="text-xs text-hearth-ink2">{auditOpen ? 'Hide' : 'Show'}</span>
        </button>
        <AnimatePresence>
          {auditOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 divide-y divide-hearth-line rounded-2xl bg-hearth-surface px-4 shadow-card">
                {auditEvents.length === 0 && (
                  <p className="py-4 text-sm text-hearth-ink2">No history yet.</p>
                )}
                {auditEvents.map((a) => (
                  <div key={a.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-hearth-ink">
                        {a.actor?.name ?? 'Someone'} · {a.action.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono text-xs text-hearth-ink2">
                        {new Date(a.createdAt).toLocaleString('en-IE', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {(a.before != null || a.after != null) && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-hearth-ink2">
                          View changes
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-hearth-surface2 p-2 font-mono text-[11px] text-hearth-ink2">
                          {JSON.stringify({ before: a.before, after: a.after }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && e.receiptUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4"
            onClick={() => setLightbox(false)}
          >
            <div className="flex justify-end gap-2">
              <a
                href={e.receiptUrl}
                download={`receipt-${e.id}`}
                onClick={(ev) => ev.stopPropagation()}
                aria-label="Download receipt"
                className="rounded-full bg-white/10 p-2 text-white"
              >
                <Download className="h-5 w-5" />
              </a>
              <button
                aria-label="Close"
                onClick={() => setLightbox(false)}
                className="rounded-full bg-white/10 p-2 text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto">
              <motion.img
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                src={e.receiptUrl}
                alt="Receipt full view"
                className="max-h-full max-w-full rounded-xl object-contain"
                onClick={(ev) => ev.stopPropagation()}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Return sheet */}
      <AnimatePresence>
        {returnSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setReturnSheet(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg rounded-t-3xl bg-hearth-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-card"
            >
              <h2 className="font-display text-xl font-semibold text-hearth-ink">
                Register a return
              </h2>
              <p className="mt-1 text-xs text-hearth-ink2">
                Refunds are added as linked entries — the original record never changes.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-hearth-ink2">
                    Refund amount (max {eur(remainingRefundable, e.currency)})
                  </label>
                  <input
                    value={refundAmount}
                    onChange={(ev) => setRefundAmount(ev.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 font-mono text-sm text-hearth-ink outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-hearth-ink2">Date</label>
                    <input
                      type="date"
                      value={refundDate}
                      onChange={(ev) => setRefundDate(ev.target.value)}
                      className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 font-mono text-sm text-hearth-ink outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-hearth-ink2">Method</label>
                    <select
                      value={refundMethod}
                      onChange={(ev) => setRefundMethod(ev.target.value as 'cash' | 'card' | 'other')}
                      className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink"
                    >
                      <option value="card">Card</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <input
                  value={refundNote}
                  onChange={(ev) => setRefundNote(ev.target.value)}
                  placeholder="Note (optional)"
                  className="w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink outline-none"
                />
                {(() => {
                  const cents = Math.round(parseFloat(refundAmount.replace(',', '.') || '0') * 100)
                  const valid = cents > 0 && cents <= remainingRefundable
                  return (
                    <>
                      {valid && (
                        <p className="text-xs text-hearth-ink2">
                          New effective amount:{' '}
                          <span className="font-mono text-hearth-ink">
                            {eur(effectiveCents - cents, e.currency)}
                          </span>
                        </p>
                      )}
                      <button
                        disabled={!valid || addRefundMut.isPending}
                        onClick={() =>
                          addRefundMut.mutate({
                            expenseId: e.id,
                            amountCents: cents,
                            date: refundDate,
                            method: refundMethod,
                            note: refundNote || undefined,
                          })
                        }
                        className="w-full rounded-xl bg-hearth-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {addRefundMut.isPending ? 'Saving…' : 'Save refund'}
                      </button>
                    </>
                  )
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
