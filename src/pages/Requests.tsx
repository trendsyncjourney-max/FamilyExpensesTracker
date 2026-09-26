import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { HandCoins, CircleCheck, Undo2, ReceiptText } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import {
  Avatar,
  EmptyBlock,
  ErrorBlock,
  GhostButton,
  LedgerDivider,
  LoadingRows,
  MoneyFigure,
  PrimaryButton,
  StatusChip,
  fmtMoney,
} from './requests/ui'

type Segment = 'inbox' | 'sent'
type SentFilter = 'all' | 'reimbursements' | 'advances' | 'settlements'

const SETTLED_STATUSES = ['confirmed', 'reconciled', 'rejected', 'cancelled']

function SendBackBox({
  onSubmit,
  isPending,
  onCancel,
}: {
  onSubmit: (reason: string) => void
  isPending: boolean
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <label className="mt-3 block text-left text-xs font-medium uppercase tracking-wider text-hearth-ink2">
        Reason (required — it stays with the record)
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="e.g. This receipt belongs to last month…"
        className="mt-1.5 w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink placeholder:text-hearth-ink2/60 focus:outline-none focus:ring-2 focus:ring-hearth-rose/30"
      />
      <div className="mt-2 flex gap-2">
        <GhostButton tone="rose" disabled={!reason.trim() || isPending} onClick={() => onSubmit(reason.trim())}>
          {isPending ? 'Sending back…' : 'Send back with reason'}
        </GhostButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
    </motion.div>
  )
}

export default function Requests() {
  const [segment, setSegment] = useState<Segment>('inbox')
  const [filter, setFilter] = useState<SentFilter>('all')
  const [sendBackKey, setSendBackKey] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const reimbInbox = trpc.reimbursement.inbox.useQuery()
  const reimbSent = trpc.reimbursement.sent.useQuery()
  const advInbox = trpc.advance.inbox.useQuery()
  const advSent = trpc.advance.sent.useQuery()
  const unread = trpc.notification.unreadCount.useQuery()

  const invalidateAll = () =>
    Promise.all([
      utils.reimbursement.inbox.invalidate(),
      utils.reimbursement.sent.invalidate(),
      utils.advance.inbox.invalidate(),
      utils.advance.sent.invalidate(),
      utils.dashboard.summary.invalidate(),
    ])

  const approveReimb = trpc.reimbursement.approve.useMutation({ onSuccess: invalidateAll })
  const rejectReimb = trpc.reimbursement.reject.useMutation({ onSuccess: invalidateAll })
  const confirmReimb = trpc.reimbursement.confirmReceived.useMutation({ onSuccess: invalidateAll })
  const approveAdv = trpc.advance.approve.useMutation({ onSuccess: invalidateAll })
  const rejectAdv = trpc.advance.reject.useMutation({ onSuccess: invalidateAll })
  const confirmReturn = trpc.advance.confirmReturn.useMutation({ onSuccess: invalidateAll })


  const pendingReimb = (reimbInbox.data ?? []).filter((r) => r.status === 'submitted')
  const pendingAdv = (advInbox.data ?? []).filter((a) => a.status === 'submitted')
  // Payment confirmations: my own requests the partner marked as paid.
  const awaitingMyConfirm = (reimbSent.data ?? []).filter((r) => r.status === 'paid')
  // Advance remainder returns awaiting my confirmation (I'm the approver).
  const pendingReturns = (advInbox.data ?? [])
    .filter((a) => (a.returns ?? []).some((r) => r.status === 'pending_confirm'))
    .map((a) => ({ advance: a, returns: (a.returns ?? []).filter((r) => r.status === 'pending_confirm') }))

  const inboxCount =
    pendingReimb.length +
    pendingAdv.length +
    awaitingMyConfirm.length +
    pendingReturns.reduce((n, p) => n + p.returns.length, 0)

  const waitingOnPartner = useMemo(() => {
    const r = (reimbSent.data ?? [])
      .filter((x) => ['submitted', 'approved'].includes(x.status))
      .map((x) => ({ kind: 'reimbursement' as const, item: x }))
    const a = (advSent.data ?? [])
      .filter((x) => ['submitted', 'approved', 'disbursed', 'reconciling'].includes(x.status))
      .map((x) => ({ kind: 'advance' as const, item: x }))
    return [...r, ...a].sort(
      (x, y) => new Date(y.item.createdAt).getTime() - new Date(x.item.createdAt).getTime(),
    )
  }, [reimbSent.data, advSent.data])

  const sentList = useMemo(() => {
    const all = [
      ...(reimbSent.data ?? []).map((x) => ({ kind: 'reimbursement' as const, item: x })),
      ...(advSent.data ?? []).map((x) => ({ kind: 'advance' as const, item: x })),
    ].sort((x, y) => new Date(y.item.createdAt).getTime() - new Date(x.item.createdAt).getTime())
    if (filter === 'all') return all
    if (filter === 'reimbursements') return all.filter((x) => x.kind === 'reimbursement')
    if (filter === 'advances') return all.filter((x) => x.kind === 'advance')
    return all.filter((x) => SETTLED_STATUSES.includes(x.item.status))
  }, [reimbSent.data, advSent.data, filter])

  const sentCount = (reimbSent.data?.length ?? 0) + (advSent.data?.length ?? 0)

  const isLoading =
    reimbInbox.isLoading || reimbSent.isLoading || advInbox.isLoading || advSent.isLoading
  const firstError = reimbInbox.error ?? reimbSent.error ?? advInbox.error ?? advSent.error

  const anyPending =
    approveReimb.isPending || rejectReimb.isPending || approveAdv.isPending || rejectAdv.isPending

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-hearth-ink">
          Requests
        </h1>
        {(unread.data ?? 0) > 0 && (
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-hearth-amber/10 px-2.5 py-1 text-[11px] font-semibold text-hearth-amber">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {unread.data} unread
          </span>
        )}
      </div>

      {/* Segmented control */}
      <div className="mt-5 flex rounded-2xl bg-hearth-surface2 p-1" role="tablist">
        {(
          [
            { key: 'inbox', label: 'Inbox (needs me)', count: inboxCount },
            { key: 'sent', label: 'Sent (mine)', count: sentCount },
          ] as const
        ).map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => setSegment(s.key)}
            className={cn(
              'relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
              segment === s.key ? 'text-hearth-ink' : 'text-hearth-ink2',
            )}
          >
            {segment === s.key && (
              <motion.span
                layoutId="requests-segment"
                className="absolute inset-0 rounded-xl bg-hearth-surface shadow-[0_1px_2px_rgba(28,26,23,.08)]"
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {s.label}
              {s.count > 0 && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold',
                    s.key === 'inbox'
                      ? 'bg-hearth-amber text-white'
                      : 'bg-hearth-surface2 text-hearth-ink2',
                  )}
                >
                  {s.count}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8">
          <LoadingRows />
        </div>
      ) : firstError ? (
        <div className="mt-8">
          <ErrorBlock
            message={firstError.message}
            onRetry={() => invalidateAll()}
          />
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={segment}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {segment === 'inbox' ? (
              <>
                <LedgerDivider tone="amber">Needs your review</LedgerDivider>
                {inboxCount === 0 ? (
                  <EmptyBlock
                    image="/empty-requests.svg"
                    title="All caught up 🎉"
                    caption="Nothing is waiting on you right now."
                  />
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence>
                      {pendingReimb.map((r) => (
                        <motion.div
                          key={`reimb-${r.id}`}
                          layout
                          exit={{ opacity: 0, height: 0, scale: 0.98 }}
                          transition={{ duration: 0.35 }}
                          whileHover={{ scale: 1.005 }}
                          className="rounded-2xl border border-hearth-line bg-hearth-surface p-4 shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]"
                        >
                          <div className="flex items-start gap-3">
                            <Avatar name={r.requester?.name} src={r.requester?.avatar} size={10} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-hearth-ink">
                                <span className="font-semibold">{r.requester?.name ?? 'Partner'}</span>{' '}
                                requests{' '}
                                <MoneyFigure cents={r.amountCents} currency={r.currency} className="text-hearth-ink" />
                              </p>
                              <p className="mt-0.5 text-xs text-hearth-ink2">
                                {(r.items ?? []).length} receipt{(r.items ?? []).length === 1 ? '' : 's'}
                                {r.note ? ` · “${r.note}”` : ''}
                              </p>
                              {(r.items ?? []).length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {(r.items ?? []).slice(0, 3).map((it) => (
                                    <li
                                      key={it.id}
                                      className="flex items-center justify-between gap-2 rounded-lg bg-hearth-surface2 px-2.5 py-1.5 text-xs"
                                    >
                                      <span className="inline-flex min-w-0 items-center gap-1.5 text-hearth-ink2">
                                        <ReceiptText className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">
                                          {it.expense?.merchant ?? it.note ?? 'Item'}
                                        </span>
                                      </span>
                                      <MoneyFigure cents={it.amountCents} currency={r.currency} />
                                    </li>
                                  ))}
                                  {(r.items ?? []).length > 3 && (
                                    <li className="px-2.5 text-xs text-hearth-ink2">
                                      +{(r.items ?? []).length - 3} more
                                    </li>
                                  )}
                                </ul>
                              )}
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <PrimaryButton
                                  disabled={anyPending}
                                  onClick={() => approveReimb.mutate({ id: r.id })}
                                >
                                  <CircleCheck className="mr-1.5 inline h-4 w-4" />
                                  Approve
                                </PrimaryButton>
                                <GhostButton
                                  tone="rose"
                                  disabled={anyPending}
                                  onClick={() => setSendBackKey(sendBackKey === `r${r.id}` ? null : `r${r.id}`)}
                                >
                                  <Undo2 className="mr-1.5 inline h-4 w-4" />
                                  Send back
                                </GhostButton>
                                <Link
                                  to={`/requests/${r.id}`}
                                  className="text-xs font-semibold text-hearth-accent hover:underline"
                                >
                                  Details
                                </Link>
                              </div>
                              <AnimatePresence>
                                {sendBackKey === `r${r.id}` && (
                                  <SendBackBox
                                    isPending={rejectReimb.isPending}
                                    onCancel={() => setSendBackKey(null)}
                                    onSubmit={(reason) =>
                                      rejectReimb.mutate({ id: r.id, reason }, { onSuccess: () => setSendBackKey(null) })
                                    }
                                  />
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      {pendingAdv.map((a) => {
                        const outstanding = a.outstandingCents ?? 0
                        return (
                          <motion.div
                            key={`adv-${a.id}`}
                            layout
                            exit={{ opacity: 0, height: 0, scale: 0.98 }}
                            transition={{ duration: 0.35 }}
                            className="rounded-2xl border border-hearth-line border-l-4 border-l-hearth-gold bg-hearth-surface p-4 shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]"
                          >
                            <div className="flex items-start gap-3">
                              <Avatar name={a.requester?.name} src={a.requester?.avatar} size={10} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-hearth-ink">
                                  <span className="font-semibold">{a.requester?.name ?? 'Partner'}</span>{' '}
                                  requests an advance of{' '}
                                  <MoneyFigure cents={a.amountCents} currency={a.currency} className="text-hearth-gold" />
                                </p>
                                <p className="mt-1 text-sm italic text-hearth-ink2">“{a.purpose}”</p>
                                {a.neededByDate && (
                                  <p className="mt-0.5 text-xs text-hearth-ink2">Needed by {a.neededByDate}</p>
                                )}
                                {outstanding > 0 && (
                                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-hearth-amber/10 px-2 py-0.5 text-[11px] font-semibold text-hearth-amber">
                                    <HandCoins className="h-3 w-3" />
                                    {a.requester?.name ?? 'They'} already {fmtMoney(outstanding, a.currency)} unreconciled
                                  </p>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <PrimaryButton disabled={anyPending} onClick={() => approveAdv.mutate({ id: a.id })}>
                                    Approve
                                  </PrimaryButton>
                                  <GhostButton
                                    tone="rose"
                                    disabled={anyPending}
                                    onClick={() => setSendBackKey(sendBackKey === `a${a.id}` ? null : `a${a.id}`)}
                                  >
                                    Send back
                                  </GhostButton>
                                  <Link
                                    to={`/requests/adv-${a.id}`}
                                    className="text-xs font-semibold text-hearth-accent hover:underline"
                                  >
                                    Details
                                  </Link>
                                </div>
                                <AnimatePresence>
                                  {sendBackKey === `a${a.id}` && (
                                    <SendBackBox
                                      isPending={rejectAdv.isPending}
                                      onCancel={() => setSendBackKey(null)}
                                      onSubmit={(reason) =>
                                        rejectAdv.mutate({ id: a.id, reason }, { onSuccess: () => setSendBackKey(null) })
                                      }
                                    />
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}

                      {awaitingMyConfirm.map((r) => (
                        <motion.div
                          key={`confirm-${r.id}`}
                          layout
                          exit={{ opacity: 0, height: 0, scale: 0.98 }}
                          transition={{ duration: 0.35 }}
                          className="rounded-2xl border border-hearth-line bg-hearth-surface p-4 shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]"
                        >
                          <div className="flex items-start gap-3">
                            <Avatar name={r.approver?.name} src={r.approver?.avatar} size={10} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-hearth-ink">
                                <span className="font-semibold">{r.approver?.name ?? 'Your partner'}</span> marked{' '}
                                <MoneyFigure cents={r.amountCents} currency={r.currency} className="text-hearth-ink" />{' '}
                                as paid — did you receive it?
                              </p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <PrimaryButton
                                  disabled={confirmReimb.isPending}
                                  onClick={() => confirmReimb.mutate({ id: r.id })}
                                >
                                  Confirm received
                                </PrimaryButton>
                                <Link to={`/requests/${r.id}`}>
                                  <GhostButton>Not yet</GhostButton>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      {pendingReturns.map(({ advance, returns }) =>
                        returns.map((ret) => (
                          <motion.div
                            key={`ret-${ret.id}`}
                            layout
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.35 }}
                            className="rounded-2xl border border-hearth-line border-l-4 border-l-hearth-gold bg-hearth-surface p-4"
                          >
                            <p className="text-sm text-hearth-ink">
                              <span className="font-semibold">{advance.requester?.name ?? 'Partner'}</span> returned{' '}
                              <MoneyFigure cents={ret.amountCents} currency={advance.currency} className="text-hearth-gold" />{' '}
                              in change for “{advance.purpose}” — did you receive it?
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <PrimaryButton
                                disabled={confirmReturn.isPending}
                                onClick={() => confirmReturn.mutate({ returnId: ret.id })}
                              >
                                Confirm received
                              </PrimaryButton>
                              <Link to={`/requests/adv-${advance.id}`}>
                                <GhostButton>View advance</GhostButton>
                              </Link>
                            </div>
                          </motion.div>
                        )),
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <LedgerDivider>Waiting on your partner</LedgerDivider>
                {waitingOnPartner.length === 0 ? (
                  <p className="text-sm text-hearth-ink2">Nothing pending on their side.</p>
                ) : (
                  <ul className="space-y-2">
                    {waitingOnPartner.map(({ kind, item }) => (
                      <li key={`${kind}-${item.id}`}>
                        <Link
                          to={kind === 'advance' ? `/requests/adv-${item.id}` : `/requests/${item.id}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-hearth-line bg-hearth-surface2 px-4 py-3 transition-colors hover:bg-hearth-surface"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-hearth-ink">
                              {kind === 'advance' ? `Advance: ${(item as { purpose?: string }).purpose}` : 'Reimbursement'}
                            </p>
                            <p className="text-xs text-hearth-ink2">
                              Sent {new Date(item.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <MoneyFigure cents={item.amountCents} currency={item.currency} />
                            <StatusChip status={item.status} kind={kind} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap gap-2">
                  {(
                    [
                      ['all', 'All'],
                      ['reimbursements', 'Reimbursements'],
                      ['advances', 'Advances'],
                      ['settlements', 'Settlements'],
                    ] as [SentFilter, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={cn(
                        'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                        filter === key
                          ? 'bg-hearth-accent text-white'
                          : 'bg-hearth-surface2 text-hearth-ink2 hover:text-hearth-ink',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {sentList.length === 0 ? (
                  <div className="mt-4">
                    <EmptyBlock
                      image="/empty-requests.svg"
                      title="You haven't requested reimbursements or advances yet."
                    >
                      <Link to="/requests/new?type=reimbursement">
                        <PrimaryButton>Request reimbursement</PrimaryButton>
                      </Link>
                      <Link to="/requests/new?type=advance">
                        <GhostButton tone="gold">Request an advance</GhostButton>
                      </Link>
                    </EmptyBlock>
                  </div>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {sentList.map(({ kind, item }, i) => (
                      <motion.li
                        key={`${kind}-${item.id}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.25 }}
                      >
                        <Link
                          to={kind === 'advance' ? `/requests/adv-${item.id}` : `/requests/${item.id}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-hearth-line bg-hearth-surface px-4 py-3 shadow-[0_1px_2px_rgba(28,26,23,.05)] transition-colors hover:bg-hearth-surface2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-hearth-ink">
                              {kind === 'advance'
                                ? `Advance: ${(item as { purpose?: string }).purpose}`
                                : (item as { note?: string | null }).note || 'Reimbursement'}
                            </p>
                            <p className="text-xs text-hearth-ink2">
                              {new Date(item.createdAt).toLocaleDateString()} ·{' '}
                              {kind === 'advance' ? 'Advance' : 'Reimbursement'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <MoneyFigure cents={item.amountCents} currency={item.currency} />
                            <StatusChip status={item.status} kind={kind} />
                          </div>
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
