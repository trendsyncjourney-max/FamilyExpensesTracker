import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowLeft, HandCoins, Info } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import {
  ErrorBlock,
  LoadingRows,
  MoneyFigure,
  PrimaryButton,
  daysSince,
  fmtMoney,
} from './requests/ui'

function eurosToCents(v: string) {
  const n = Number.parseFloat(v.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100)
}

export default function RequestNew() {
  const [params] = useSearchParams()
  const type = params.get('type') === 'advance' ? 'advance' : 'reimbursement'
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <Link
        to="/requests"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-hearth-ink2 hover:text-hearth-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to requests
      </Link>
      {type === 'advance' ? <AdvanceForm /> : <ReimbursementForm />}
    </div>
  )
}

/* ------------------------------ Reimbursement ------------------------------ */

function ReimbursementForm() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [mode, setMode] = useState<'receipts' | 'free'>('receipts')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [freeAmount, setFreeAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const expenses = trpc.expense.list.useQuery({ status: 'posted' })
  const create = trpc.reimbursement.create.useMutation({
    onSuccess: async (r) => {
      await utils.reimbursement.invalidate()
      navigate(`/requests/${r.id}`)
    },
    onError: (e) => setError(e.message),
  })

  const candidates = useMemo(
    () => (expenses.data ?? []).filter((e) => !e.advanceId),
    [expenses.data],
  )
  const selectedItems = candidates.filter((e) => selected.has(e.id))
  const sum = selectedItems.reduce((acc, e) => acc + e.amountCents, 0)
  const freeCents = eurosToCents(freeAmount)
  const currency = candidates[0]?.currency ?? 'EUR'

  const canSubmit =
    mode === 'receipts'
      ? selected.size > 0 && !create.isPending
      : freeCents > 0 && note.trim().length >= 10 && !create.isPending

  const submit = () => {
    setError(null)
    if (mode === 'receipts') {
      create.mutate({
        note: note.trim() || undefined,
        items: selectedItems.map((e) => ({ expenseId: e.id, amountCents: e.amountCents })),
      })
    } else {
      create.mutate({
        note: note.trim(),
        items: [{ amountCents: freeCents, note: note.trim() }],
      })
    }
  }

  return (
    <>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-hearth-ink">
        Request reimbursement
      </h1>

      {/* Source picker */}
      <div className="mt-5 flex rounded-2xl bg-hearth-surface2 p-1">
        {(
          [
            ['receipts', 'From receipts'],
            ['free', 'Free amount'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={cn(
              'relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
              mode === key ? 'text-hearth-ink' : 'text-hearth-ink2',
            )}
          >
            {mode === key && (
              <motion.span
                layoutId="reimb-source"
                className="absolute inset-0 rounded-xl bg-hearth-surface shadow-[0_1px_2px_rgba(28,26,23,.08)]"
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {mode === 'receipts' ? (
        <div className="mt-4">
          {expenses.isLoading ? (
            <LoadingRows />
          ) : expenses.error ? (
            <ErrorBlock message={expenses.error.message} onRetry={() => expenses.refetch()} />
          ) : candidates.length === 0 ? (
            <div className="rounded-2xl border border-hearth-line bg-hearth-surface p-6 text-center">
              <img src="/empty-receipts.svg" alt="" className="mx-auto h-32 w-44 object-contain" />
              <p className="mt-3 text-sm text-hearth-ink2">
                No shared receipts available to claim yet.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {candidates.map((e) => {
                const checked = selected.has(e.id)
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(e.id)) next.delete(e.id)
                          else next.add(e.id)
                          return next
                        })
                      }
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                        checked
                          ? 'border-hearth-accent bg-hearth-accentSoft'
                          : 'border-hearth-line bg-hearth-surface hover:bg-hearth-surface2',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                          checked ? 'border-hearth-accent bg-hearth-accent' : 'border-hearth-line bg-hearth-surface',
                        )}
                      >
                        {checked && (
                          <motion.svg
                            viewBox="0 0 12 12"
                            className="h-3 w-3"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                          >
                            <motion.path
                              d="M2 6.5 4.8 9 10 3"
                              fill="none"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.3 }}
                            />
                          </motion.svg>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-hearth-ink">
                          {e.merchant ?? 'Receipt'}
                        </p>
                        <p className="text-xs text-hearth-ink2">{e.date}</p>
                      </div>
                      <MoneyFigure cents={e.amountCents} currency={e.currency} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note for your partner (optional)"
            className="mt-3 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2 text-sm text-hearth-ink placeholder:text-hearth-ink2/60 focus:outline-none focus:ring-2 focus:ring-hearth-accent/30"
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-hearth-ink2">
              Amount
            </label>
            <input
              value={freeAmount}
              onChange={(e) => setFreeAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="mt-1.5 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2 font-mono text-lg text-hearth-ink placeholder:text-hearth-ink2/60 focus:outline-none focus:ring-2 focus:ring-hearth-accent/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-hearth-ink2">
              Note (required, min 10 characters)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Covered the plumber's deposit in cash"
              className="mt-1.5 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2 text-sm text-hearth-ink placeholder:text-hearth-ink2/60 focus:outline-none focus:ring-2 focus:ring-hearth-accent/30"
            />
          </div>
        </div>
      )}

      {/* Live summary */}
      <div className="mt-5 rounded-2xl border border-hearth-line bg-hearth-surface2 p-4">
        <p className="text-sm text-hearth-ink">
          Your partner will owe you{' '}
          <span className="font-mono font-semibold">
            {fmtMoney(mode === 'receipts' ? sum : freeCents, currency)}
          </span>
          {mode === 'receipts' && ` for ${selected.size} receipt${selected.size === 1 ? '' : 's'}`}.
        </p>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-hearth-rose">{error}</p>}

      <div className="mt-5 flex gap-2">
        <PrimaryButton disabled={!canSubmit} onClick={submit} className="flex-1 py-3">
          {create.isPending ? 'Submitting…' : 'Submit — Waiting for review'}
        </PrimaryButton>
      </div>
    </>
  )
}

/* -------------------------------- Advance -------------------------------- */

function AdvanceForm() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [purpose, setPurpose] = useState('')
  const [amount, setAmount] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sent = trpc.advance.sent.useQuery()
  const agingAdvance = (sent.data ?? []).find(
    (a) =>
      ['disbursed', 'reconciling'].includes(a.status) &&
      (a.outstandingCents ?? 0) > 0 &&
      daysSince(a.disbursedAt) >= 14,
  )

  const create = trpc.advance.request.useMutation({
    onSuccess: async (a) => {
      await utils.advance.invalidate()
      navigate(`/requests/adv-${a.id}`)
    },
    onError: (e) => setError(e.message),
  })

  const cents = eurosToCents(amount)
  const canSubmit = purpose.trim().length > 0 && cents > 0 && !create.isPending

  return (
    <>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-hearth-gold">
        <HandCoins className="mr-2 inline h-7 w-7 align-[-4px]" />
        Request an advance
      </h1>

      <div className="mt-5 space-y-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-hearth-ink2">
            Purpose
          </label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. School supplies for the kids"
            className="mt-1.5 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2 text-sm text-hearth-ink placeholder:text-hearth-ink2/60 focus:outline-none focus:ring-2 focus:ring-hearth-gold/40"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-hearth-ink2">
            Amount
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1.5 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2 font-mono text-lg text-hearth-ink placeholder:text-hearth-ink2/60 focus:outline-none focus:ring-2 focus:ring-hearth-gold/40"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-hearth-ink2">
            Needed by (optional)
          </label>
          <input
            type="date"
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-hearth-line bg-hearth-surface px-3 py-2 text-sm text-hearth-ink focus:outline-none focus:ring-2 focus:ring-hearth-gold/40"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2.5 rounded-2xl border border-hearth-line bg-hearth-surface2 p-4 text-sm text-hearth-ink2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-hearth-ink2" />
        Receipts are due after the event. You'll clear this advance by adding receipts or returning
        the change.
      </div>

      {agingAdvance && (
        <div className="mt-3 rounded-2xl border border-hearth-rose/40 bg-hearth-rose/5 p-4 text-sm font-medium text-hearth-rose">
          You have an advance open for {daysSince(agingAdvance.disbursedAt)} days — clear it before
          requesting more.
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-hearth-rose">{error}</p>}

      <div className="mt-5">
        <PrimaryButton
          disabled={!canSubmit || !!agingAdvance}
          onClick={() => {
            setError(null)
            create.mutate({
              amountCents: cents,
              purpose: purpose.trim(),
              neededByDate: neededBy || undefined,
            })
          }}
          className="w-full bg-hearth-gold py-3 text-[#1C1A17]"
        >
          {create.isPending ? 'Submitting…' : 'Submit — Waiting for review'}
        </PrimaryButton>
        {agingAdvance && (
          <p className="mt-2 text-center text-xs text-hearth-ink2">
            <Link to={`/requests/adv-${agingAdvance.id}`} className="font-semibold text-hearth-accent hover:underline">
              Open the aging advance to reconcile it
            </Link>
          </p>
        )}
      </div>
    </>
  )
}
