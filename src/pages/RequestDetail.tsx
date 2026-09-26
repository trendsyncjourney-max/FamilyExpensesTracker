import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, CircleCheck, ScanLine } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  Avatar,
  EmptyBlock,
  ErrorBlock,
  GhostButton,
  LoadingRows,
  MoneyFigure,
  PrimaryButton,
  StatusChip,
  daysSince,
  fmtMoney,
} from './requests/ui'

export default function RequestDetail() {
  const { id = '' } = useParams()
  if (id.startsWith('adv-')) {
    const advId = Number(id.slice(4))
    return <AdvanceDetail id={advId} />
  }
  return <ReimbursementDetail id={Number(id)} />
}

/* ------------------------------ Shared bits ------------------------------ */

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <Link
        to="/requests"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-hearth-ink2 hover:text-hearth-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {title}
      </Link>
      {children}
    </div>
  )
}

function AvatarPair({
  from,
  to,
}: {
  from?: { name?: string | null; avatar?: string | null } | null
  to?: { name?: string | null; avatar?: string | null } | null
}) {
  return (
    <span className="inline-flex -space-x-2">
      <Avatar name={from?.name} src={from?.avatar} size={8} />
      <Avatar name={to?.name} src={to?.avatar} size={8} className="border-2 border-hearth-surface" />
    </span>
  )
}

function Timeline({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mt-6 space-y-0">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'absolute left-[7px] top-4 h-full w-px',
                  done ? 'bg-hearth-accent' : 'bg-hearth-line',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2',
                done && 'border-hearth-accent bg-hearth-accent',
                active && 'border-hearth-accent bg-hearth-surface',
                !done && !active && 'border-hearth-line bg-hearth-surface2',
              )}
            >
              {active && (
                <span className="absolute inset-0 m-auto h-1.5 w-1.5 animate-pulse rounded-full bg-hearth-accent" />
              )}
            </span>
            <span
              className={cn(
                'text-sm',
                done ? 'text-hearth-ink2 line-through' : active ? 'font-semibold text-hearth-ink' : 'text-hearth-ink2',
              )}
            >
              {s}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/* --------------------------- Reimbursement detail --------------------------- */

function ReimbursementDetail({ id }: { id: number }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const q = trpc.reimbursement.getById.useQuery({ id }, { enabled: Number.isFinite(id) })
  const [reason, setReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cleared, setCleared] = useState(false)

  const invalidate = () => utils.reimbursement.invalidate()
  const opts = {
    onError: (e: { message: string }) => setError(e.message),
    onSuccess: () => invalidate(),
  }
  const approve = trpc.reimbursement.approve.useMutation(opts)
  const reject = trpc.reimbursement.reject.useMutation(opts)
  const cancel = trpc.reimbursement.cancel.useMutation(opts)
  const markPaid = trpc.reimbursement.markPaid.useMutation(opts)
  const confirm = trpc.reimbursement.confirmReceived.useMutation({
    onError: opts.onError,
    onSuccess: async () => {
      setCleared(true)
      await invalidate()
    },
  })

  if (q.isLoading)
    return (
      <PageShell title="Back to requests">
        <div className="mt-6">
          <LoadingRows />
        </div>
      </PageShell>
    )
  if (q.error || !q.data)
    return (
      <PageShell title="Back to requests">
        <div className="mt-6">
          <ErrorBlock message={q.error?.message ?? 'Request not found.'} onRetry={() => q.refetch()} />
        </div>
      </PageShell>
    )

  const r = q.data
  const isRequester = user?.id === r.requesterId
  const isApprover = user?.id === r.approverId
  const stepIndex = ['submitted', 'approved', 'paid', 'confirmed'].indexOf(r.status)

  return (
    <PageShell title="Back to requests">
      <motion.div
        animate={cleared ? { backgroundColor: 'var(--h-accent-soft)' } : {}}
        transition={{ duration: 0.8 }}
        className="mt-5 rounded-2xl border border-hearth-line bg-hearth-surface p-6 shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]"
      >
        <div className="flex items-center justify-between gap-3">
          <AvatarPair from={r.requester} to={r.approver} />
          <StatusChip status={r.status} />
        </div>
        <p className="mt-4 font-display text-5xl font-semibold tracking-tight text-hearth-ink">
          {fmtMoney(r.amountCents, r.currency)}
        </p>
        <p className="mt-1 text-sm text-hearth-ink2">
          {r.requester?.name ?? 'Requester'} → {r.approver?.name ?? 'Approver'} ·{' '}
          {new Date(r.createdAt).toLocaleDateString()}
        </p>
        {r.note && <p className="mt-2 text-sm italic text-hearth-ink2">“{r.note}”</p>}
        {r.rejectReason && (
          <p className="mt-2 rounded-xl bg-hearth-rose/5 px-3 py-2 text-sm text-hearth-rose">
            Sent back: “{r.rejectReason}”
          </p>
        )}

        {/* Itemized receipts */}
        {(r.items ?? []).length > 0 && (
          <ul className="mt-5 space-y-2">
            {(r.items ?? []).map((it, i) => (
              <motion.li
                key={it.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                {it.expenseId ? (
                  <Link
                    to={`/records/${it.expenseId}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-hearth-surface2 px-3.5 py-2.5 transition-colors hover:bg-hearth-line/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-hearth-ink">
                        {it.expense?.merchant ?? it.note ?? 'Receipt'}
                      </span>
                      <span className="text-xs text-hearth-ink2">{it.expense?.date}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <MoneyFigure cents={it.amountCents} currency={r.currency} />
                      {cleared && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: i * 0.08 }}
                        >
                          <CircleCheck className="h-4 w-4 text-hearth-accent" />
                        </motion.span>
                      )}
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-hearth-surface2 px-3.5 py-2.5">
                    <span className="truncate text-sm text-hearth-ink">{it.note ?? 'Free amount'}</span>
                    <MoneyFigure cents={it.amountCents} currency={r.currency} />
                  </div>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </motion.div>

      <Timeline
        steps={['Submitted', 'Approved', 'Paid', 'Confirmed received', 'Cleared']}
        current={r.status === 'confirmed' ? 5 : Math.max(stepIndex, 0)}
      />

      {/* Contextual action panel */}
      <div className="mt-4 rounded-2xl border border-hearth-line bg-hearth-surface p-5">
        {error && <p className="mb-3 text-sm font-medium text-hearth-rose">{error}</p>}
        {isApprover && r.status === 'submitted' && (
          <>
            <p className="text-sm font-semibold text-hearth-ink">Review this request</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton disabled={approve.isPending} onClick={() => approve.mutate({ id: r.id })}>
                Approve
              </PrimaryButton>
              <GhostButton tone="rose" onClick={() => setShowReject((v) => !v)}>
                Send back
              </GhostButton>
            </div>
            <AnimatePresence>
              {showReject && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (required)"
                    className="mt-3 w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink focus:outline-none focus:ring-2 focus:ring-hearth-rose/30"
                  />
                  <GhostButton
                    tone="rose"
                    className="mt-2"
                    disabled={!reason.trim() || reject.isPending}
                    onClick={() => reject.mutate({ id: r.id, reason: reason.trim() })}
                  >
                    Send back with reason
                  </GhostButton>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
        {isApprover && r.status === 'approved' && (
          <>
            <p className="text-sm font-semibold text-hearth-ink">Approved — awaiting payment</p>
            <p className="mt-1 text-xs text-hearth-ink2">
              Mark that you sent the money — {r.requester?.name ?? 'your partner'} confirms receipt.
            </p>
            <PrimaryButton
              className="mt-3"
              disabled={markPaid.isPending}
              onClick={() => markPaid.mutate({ id: r.id })}
            >
              Record payment
            </PrimaryButton>
          </>
        )}
        {isRequester && r.status === 'paid' && (
          <>
            <p className="text-sm font-semibold text-hearth-ink">
              {r.approver?.name ?? 'Your partner'} marked this as paid
            </p>
            <p className="mt-1 text-xs text-hearth-ink2">Confirm once the money has arrived.</p>
            <PrimaryButton
              className="mt-3"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate({ id: r.id })}
            >
              Confirm received
            </PrimaryButton>
          </>
        )}
        {isRequester && r.status === 'submitted' && (
          <>
            <p className="text-sm text-hearth-ink2">Waiting for {r.approver?.name ?? 'your partner'} to review.</p>
            <GhostButton
              tone="rose"
              className="mt-3"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ id: r.id }, { onSuccess: () => navigate('/requests') })}
            >
              Cancel request
            </GhostButton>
          </>
        )}
        {isRequester && ['approved', 'paid'].includes(r.status) && r.status === 'approved' && (
          <p className="text-sm text-hearth-ink2">
            Only your partner can record the payment for this request.
          </p>
        )}
        {r.status === 'confirmed' && (
          <p className="flex items-center gap-2 text-sm font-semibold text-hearth-accent">
            <CircleCheck className="h-4 w-4" /> Paid ✓ Cleared
          </p>
        )}
        {r.status === 'rejected' && (
          <p className="text-sm text-hearth-rose">This request was sent back. Edit the receipts and submit a new one.</p>
        )}
        {r.status === 'cancelled' && <p className="text-sm text-hearth-ink2">This request was cancelled.</p>}
        {!isRequester && !isApprover && (
          <p className="text-sm text-hearth-ink2">Only your partner can act on this request.</p>
        )}
        {isRequester && r.status === 'submitted' && (
          <p className="mt-2 text-xs text-hearth-ink2">Only your partner can approve this.</p>
        )}
      </div>

      {/* Audit trail (collapsed) */}
      <details className="mt-4 rounded-2xl border border-hearth-line bg-hearth-surface px-5 py-4">
        <summary className="cursor-pointer text-sm font-semibold text-hearth-ink">Audit trail</summary>
        <ul className="mt-3 space-y-1.5 font-mono text-xs text-hearth-ink2">
          <li>{new Date(r.createdAt).toLocaleString()} — submitted</li>
          {r.respondedAt && <li>{new Date(r.respondedAt).toLocaleString()} — {r.status === 'rejected' ? 'sent back' : 'responded'}</li>}
          {r.paidAt && <li>{new Date(r.paidAt).toLocaleString()} — paid</li>}
          {r.confirmedAt && <li>{new Date(r.confirmedAt).toLocaleString()} — confirmed received</li>}
        </ul>
      </details>
    </PageShell>
  )
}

/* ----------------------------- Advance detail ----------------------------- */

function AdvanceMeter({
  given,
  receipts,
  returned,
  currency,
  pulse,
}: {
  given: number
  receipts: number
  returned: number
  currency: string
  pulse: boolean
}) {
  const applied = Math.min(receipts, given)
  const toReturn = Math.max(given - applied - returned, 0)
  const over = Math.max(receipts - given, 0)
  const total = Math.max(given, receipts, 1)
  const pct = (v: number) => `${Math.min((v / total) * 100, 100)}%`
  return (
    <div className="mt-4">
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-hearth-surface2">
        <motion.div
          className="h-full bg-hearth-accent"
          animate={{ width: pct(applied) }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.div
          className={cn('h-full bg-hearth-gold', pulse && 'animate-pulse')}
          animate={{ width: pct(toReturn) }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        {over > 0 && (
          <motion.div
            className="h-full bg-hearth-blue"
            animate={{ width: pct(over) }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </div>
      <p className="mt-2 text-xs text-hearth-ink2">
        <span className="font-mono font-medium text-hearth-gold">{fmtMoney(given, currency)}</span> given ·{' '}
        <span className="font-mono font-medium text-hearth-accent">{fmtMoney(applied, currency)}</span> in receipts
        {toReturn > 0 && (
          <>
            {' '}· <span className="font-mono font-medium text-hearth-ink">{fmtMoney(toReturn, currency)}</span> to return
          </>
        )}
        {over > 0 && (
          <>
            {' '}· <span className="font-mono font-medium text-hearth-blue">{fmtMoney(over, currency)}</span> above the advance
          </>
        )}
      </p>
    </div>
  )
}

function AdvanceDetail({ id }: { id: number }) {
  const { user } = useAuth()
  const utils = trpc.useUtils()
  const q = trpc.advance.getById.useQuery({ id }, { enabled: Number.isFinite(id) })
  const [reason, setReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [returnAmount, setReturnAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [spillDone, setSpillDone] = useState(false)

  const invalidate = () => utils.advance.invalidate()
  const opts = {
    onError: (e: { message: string }) => setError(e.message),
    onSuccess: () => invalidate(),
  }
  const approve = trpc.advance.approve.useMutation(opts)
  const reject = trpc.advance.reject.useMutation(opts)
  const cancel = trpc.advance.cancel.useMutation(opts)
  const disburse = trpc.advance.disburse.useMutation(opts)
  const reconcile = trpc.advance.reconcile.useMutation(opts)
  const returnRemainder = trpc.advance.returnRemainder.useMutation({
    onError: opts.onError,
    onSuccess: async () => {
      setReturnAmount('')
      await invalidate()
    },
  })
  const confirmReturn = trpc.advance.confirmReturn.useMutation(opts)
  const createReimb = trpc.reimbursement.create.useMutation({
    onError: opts.onError,
    onSuccess: async () => {
      setSpillDone(true)
      await utils.reimbursement.invalidate()
    },
  })

  if (q.isLoading)
    return (
      <PageShell title="Back to requests">
        <div className="mt-6">
          <LoadingRows />
        </div>
      </PageShell>
    )
  if (q.error || !q.data)
    return (
      <PageShell title="Back to requests">
        <div className="mt-6">
          <ErrorBlock message={q.error?.message ?? 'Advance not found.'} onRetry={() => q.refetch()} />
        </div>
      </PageShell>
    )

  const a = q.data
  const isRequester = user?.id === a.requesterId
  const isApprover = user?.id === a.approverId
  const receipts = (a.linkedExpenses ?? []).reduce((acc, e) => acc + e.amountCents, 0)
  const outstanding = a.outstandingCents ?? Math.max(a.amountCents - receipts - a.returnedAmountCents, 0)
  const overspend = Math.max(receipts - a.amountCents, 0)
  const ageDays = daysSince(a.disbursedAt)
  const aging = ['disbursed', 'reconciling'].includes(a.status) && ageDays >= 14
  const pendingReturns = (a.returns ?? []).filter((r) => r.status === 'pending_confirm')
  const open = ['disbursed', 'reconciling'].includes(a.status)
  const stepIndex = ['submitted', 'approved', 'disbursed', 'reconciling', 'reconciled'].indexOf(a.status)

  const returnCents = (() => {
    const n = Number.parseFloat(returnAmount.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
  })()

  return (
    <PageShell title="Back to requests">
      {/* Gold hero */}
      <div className="mt-5 rounded-2xl border border-hearth-line border-t-4 border-t-hearth-gold bg-hearth-surface p-6 shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]">
        <div className="flex items-center justify-between gap-3">
          <AvatarPair from={a.requester} to={a.approver} />
          <StatusChip status={a.status} kind="advance" />
        </div>
        <p className="mt-4 font-display text-5xl font-semibold tracking-tight text-hearth-ink">
          {fmtMoney(a.amountCents, a.currency)}
        </p>
        <p className="mt-2 text-sm italic text-hearth-ink2">“{a.purpose}”</p>
        {a.neededByDate && <p className="mt-1 text-xs text-hearth-ink2">Needed by {a.neededByDate}</p>}
        {a.rejectReason && (
          <p className="mt-2 rounded-xl bg-hearth-rose/5 px-3 py-2 text-sm text-hearth-rose">
            Sent back: “{a.rejectReason}”
          </p>
        )}
        <AdvanceMeter
          given={a.amountCents}
          receipts={receipts}
          returned={a.returnedAmountCents}
          currency={a.currency}
          pulse={outstanding > 0 && ageDays > 7}
        />
      </div>

      {aging && (
        <div className="mt-4 rounded-2xl border border-hearth-rose/40 bg-hearth-rose/5 p-4 text-sm font-medium text-hearth-rose">
          This advance has been open {ageDays} days — add receipts or return the change.
        </div>
      )}

      <Timeline
        steps={['Requested', 'Approved', 'Money given', 'Reconciling', 'Cleared & closed']}
        current={a.status === 'reconciled' ? 5 : Math.max(stepIndex, 0)}
      />

      {/* Linked receipts */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-hearth-ink">Receipts for this advance</h2>
          {isRequester && open && (
            <Link
              to="/records/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-hearth-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              <ScanLine className="h-3.5 w-3.5" /> Scan a receipt
            </Link>
          )}
        </div>
        {(a.linkedExpenses ?? []).length === 0 ? (
          <div className="mt-3">
            <EmptyBlock
              image="/empty-receipts.svg"
              title="No receipts yet"
              caption="Receipts for this advance: add them as you shop."
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {(a.linkedExpenses ?? []).map((e) => (
              <li key={e.id}>
                <Link
                  to={`/records/${e.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-hearth-line bg-hearth-surface px-3.5 py-2.5 transition-colors hover:bg-hearth-surface2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-hearth-ink">
                      {e.merchant ?? 'Receipt'}
                    </span>
                    <span className="text-xs text-hearth-ink2">{e.date}</span>
                  </span>
                  <MoneyFigure cents={e.amountCents} currency={e.currency} />
                </Link>
              </li>
            ))}
            <li className="flex items-center justify-between px-3.5 text-sm">
              <span className="text-hearth-ink2">Running total</span>
              <MoneyFigure cents={receipts} currency={a.currency} className="text-hearth-ink" />
            </li>
          </ul>
        )}
        {open && (
          <GhostButton
            className="mt-2"
            disabled={reconcile.isPending}
            onClick={() => reconcile.mutate({ id: a.id })}
          >
            Refresh reconciliation
          </GhostButton>
        )}
      </div>

      {/* Settle the difference */}
      {open && (
        <div className="mt-5 rounded-2xl border border-hearth-line bg-hearth-surface p-5">
          <h3 className="text-sm font-semibold text-hearth-ink">Settle the difference</h3>
          {outstanding > 0 && isRequester && (
            <div className="mt-3">
              <p className="text-sm text-hearth-ink2">
                {fmtMoney(outstanding, a.currency)} to return in cash — your partner confirms receipt.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={returnAmount}
                  onChange={(e) => setReturnAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder={(outstanding / 100).toFixed(2)}
                  className="w-32 rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 font-mono text-sm text-hearth-ink focus:outline-none focus:ring-2 focus:ring-hearth-gold/40"
                />
                <PrimaryButton
                  disabled={returnCents <= 0 || returnRemainder.isPending}
                  onClick={() =>
                    returnRemainder.mutate({
                      id: a.id,
                      amountCents: returnCents,
                      date: new Date().toISOString().slice(0, 10),
                    })
                  }
                >
                  Record cash return
                </PrimaryButton>
              </div>
            </div>
          )}
          {outstanding > 0 && isApprover && (
            <p className="mt-3 text-sm text-hearth-ink2">
              {fmtMoney(outstanding, a.currency)} still to return by {a.requester?.name ?? 'your partner'}.
            </p>
          )}
          {overspend > 0 && isRequester && (
            <div className="mt-3">
              <p className="text-sm text-hearth-ink2">
                {fmtMoney(overspend, a.currency)} above the advance — this becomes a normal reimbursement
                request.
              </p>
              {spillDone ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-hearth-accent">
                  <CircleCheck className="h-4 w-4" /> Reimbursement request created
                </p>
              ) : (
                <PrimaryButton
                  className="mt-2"
                  disabled={createReimb.isPending}
                  onClick={() =>
                    createReimb.mutate({
                      note: `Overspend on advance: ${a.purpose}`,
                      items: [{ amountCents: overspend, note: `Overspend on advance: ${a.purpose}` }],
                    })
                  }
                >
                  Create reimbursement for {fmtMoney(overspend, a.currency)}
                </PrimaryButton>
              )}
            </div>
          )}
          {outstanding === 0 && overspend === 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-hearth-accent">
              <CircleCheck className="h-4 w-4" /> Perfectly cleared ✓
            </p>
          )}
        </div>
      )}

      {/* Pending cash returns to confirm */}
      {pendingReturns.length > 0 && isApprover && (
        <div className="mt-4 rounded-2xl border border-hearth-line bg-hearth-surface p-5">
          <h3 className="text-sm font-semibold text-hearth-ink">Cash returns to confirm</h3>
          <ul className="mt-2 space-y-2">
            {pendingReturns.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-hearth-surface2 px-3.5 py-2.5"
              >
                <span className="text-sm text-hearth-ink">
                  <MoneyFigure cents={r.amountCents} currency={a.currency} /> on {r.date}
                </span>
                <PrimaryButton
                  disabled={confirmReturn.isPending}
                  onClick={() => confirmReturn.mutate({ returnId: r.id })}
                >
                  Confirm received
                </PrimaryButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lifecycle actions */}
      <div className="mt-4 rounded-2xl border border-hearth-line bg-hearth-surface p-5">
        {error && <p className="mb-3 text-sm font-medium text-hearth-rose">{error}</p>}
        {isApprover && a.status === 'submitted' && (
          <>
            <p className="text-sm font-semibold text-hearth-ink">Review this advance request</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton disabled={approve.isPending} onClick={() => approve.mutate({ id: a.id })}>
                Approve
              </PrimaryButton>
              <GhostButton tone="rose" onClick={() => setShowReject((v) => !v)}>
                Send back
              </GhostButton>
            </div>
            <AnimatePresence>
              {showReject && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (required)"
                    className="mt-3 w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink focus:outline-none focus:ring-2 focus:ring-hearth-rose/30"
                  />
                  <GhostButton
                    tone="rose"
                    className="mt-2"
                    disabled={!reason.trim() || reject.isPending}
                    onClick={() => reject.mutate({ id: a.id, reason: reason.trim() })}
                  >
                    Send back with reason
                  </GhostButton>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
        {isApprover && a.status === 'approved' && (
          <>
            <p className="text-sm font-semibold text-hearth-ink">Approved — hand over the money</p>
            <p className="mt-1 text-xs text-hearth-ink2">
              Mark that you gave {a.requester?.name ?? 'your partner'} the cash.
            </p>
            <PrimaryButton
              className="mt-3"
              disabled={disburse.isPending}
              onClick={() => disburse.mutate({ id: a.id })}
            >
              Record disbursement
            </PrimaryButton>
          </>
        )}
        {isRequester && ['submitted', 'approved'].includes(a.status) && (
          <>
            <p className="text-sm text-hearth-ink2">
              {a.status === 'submitted'
                ? 'Waiting for review. Only your partner can approve this.'
                : 'Approved — waiting for your partner to hand over the money.'}
            </p>
            <GhostButton
              tone="rose"
              className="mt-3"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ id: a.id })}
            >
              Cancel request
            </GhostButton>
          </>
        )}
        {a.status === 'reconciled' && (
          <p className="flex items-center gap-2 text-sm font-semibold text-hearth-accent">
            <CircleCheck className="h-4 w-4" /> Cleared & closed
          </p>
        )}
        {a.status === 'rejected' && <p className="text-sm text-hearth-rose">This advance was sent back.</p>}
        {a.status === 'cancelled' && <p className="text-sm text-hearth-ink2">This advance was cancelled.</p>}
      </div>

      {/* Audit trail */}
      <details className="mt-4 rounded-2xl border border-hearth-line bg-hearth-surface px-5 py-4">
        <summary className="cursor-pointer text-sm font-semibold text-hearth-ink">Audit trail</summary>
        <ul className="mt-3 space-y-1.5 font-mono text-xs text-hearth-ink2">
          <li>{new Date(a.createdAt).toLocaleString()} — requested</li>
          {a.disbursedAt && <li>{new Date(a.disbursedAt).toLocaleString()} — money given</li>}
          {(a.returns ?? []).map((r) => (
            <li key={r.id}>
              {r.date} — returned {fmtMoney(r.amountCents, a.currency)} ({r.status === 'confirmed' ? 'confirmed' : 'awaiting confirmation'})
            </li>
          ))}
        </ul>
      </details>
    </PageShell>
  )
}
