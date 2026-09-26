import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import imageCompression from 'browser-image-compression'
import {
  Camera,
  Image as ImageIcon,
  PenLine,
  HandCoins,
  ChevronDown,
  ChevronLeft,
  RotateCcw,
  Check,
  CloudOff,
  RefreshCw,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  AuthGate,
  SETTLE_EASE,
  eur,
  todayISO,
} from './shared'

type Phase = 'pick' | 'processing' | 'form' | 'success'
type SplitMode = 'half' | 'full' | 'custom'

export default function RecordNew() {
  return (
    <AuthGate>
      <RecordNewInner />
    </AuthGate>
  )
}

function RecordNewInner() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const [phase, setPhase] = useState<Phase>('pick')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [receiptMeta, setReceiptMeta] = useState<{
    url: string
    contentType?: string
    sizeBytes?: number
  } | null>(null)
  const [, setUploadState] = useState<'idle' | 'processing' | 'ready'>('idle')

  // Form fields
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [date, setDate] = useState(todayISO())
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [paidBy, setPaidBy] = useState<'me' | 'partner'>('me')
  const [splitMode, setSplitMode] = useState<SplitMode>('half')
  const [splitPct, setSplitPct] = useState(50)
  const [moreOpen, setMoreOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [advanceId, setAdvanceId] = useState<number | null>(null)
  const [projectionId, setProjectionId] = useState<number | null>(null)
  const [returnable, setReturnable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<number | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const categoriesQuery = trpc.category.list.useQuery()
  const advancesQuery = trpc.advance.sent.useQuery()
  const projectionsQuery = trpc.projection.list.useQuery({})
  const summaryQuery = trpc.dashboard.summary.useQuery()

  const partner = useMemo(
    () => summaryQuery.data?.members.find((m) => m.userId !== user?.id) ?? null,
    [summaryQuery.data, user?.id],
  )

  const openAdvances = useMemo(
    () =>
      (advancesQuery.data ?? []).filter((a) =>
        ['disbursed', 'reconciling'].includes(a.status),
      ),
    [advancesQuery.data],
  )
  const plannedProjections = useMemo(
    () => (projectionsQuery.data ?? []).filter((p) => p.status === 'planned'),
    [projectionsQuery.data],
  )

  const realize = trpc.projection.realize.useMutation()
  const createExpense = trpc.expense.create.useMutation({
    onSuccess: async (expense) => {
      if (projectionId && expense?.id) {
        try {
          await realize.mutateAsync({ id: projectionId, expenseId: expense.id })
        } catch {
          // projection may already be linked; the expense link is enough
        }
      }
      await Promise.all([
        utils.expense.list.invalidate(),
        utils.dashboard.summary.invalidate(),
        utils.projection.list.invalidate(),
        utils.advance.sent.invalidate(),
      ])
      setCreatedId(expense?.id ?? null)
      setPhase('success')
    },
    onError: (e) => setError(e.message),
  })

  const amountCents = Math.round(parseFloat(amount.replace(',', '.') || '0') * 100)
  const myShareCents =
    splitMode === 'full'
      ? paidBy === 'me'
        ? amountCents
        : 0
      : splitMode === 'custom'
        ? Math.round((amountCents * splitPct) / 100)
        : Math.round(amountCents / 2)

  async function handleFile(file: File | null | undefined) {
    if (!file) return
    setError(null)
    setUploadState('processing')
    setPhase('processing')
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
      })
      const dataUrl = await imageCompression.getDataUrlFromFile(compressed)
      setPreviewUrl(dataUrl)
      // Receipts are stored inline in a MEDIUMTEXT column; the server caps
      // receipt URLs at 8M chars. Stay below that and fail loudly instead
      // of silently dropping the photo.
      if (dataUrl.length <= 7_500_000) {
        setReceiptMeta({
          url: dataUrl,
          contentType: compressed.type || file.type,
          sizeBytes: compressed.size,
        })
      } else {
        setReceiptMeta(null)
        setError(
          'That receipt photo is too large to store, even after compression. Try a smaller or lower-resolution photo — the receipt will NOT be attached if you continue.',
        )
      }
    } catch {
      setPreviewUrl(null)
      setReceiptMeta(null)
      setError('Could not read that photo — you can still enter the expense manually.')
    }
    // Simulated scan sweep before revealing the review form.
    window.setTimeout(() => {
      setUploadState('ready')
      setPhase('form')
    }, 1200)
  }

  function submit(asDraft: boolean) {
    setError(null)
    if (!asDraft && (!Number.isFinite(amountCents) || amountCents <= 0)) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (amountCents <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    const extraNotes = [
      notes.trim() || null,
      paidBy === 'partner' && partner ? `Paid by ${partner.name ?? 'partner'}` : null,
      splitMode === 'custom'
        ? `Split ${splitPct}/${100 - splitPct}`
        : splitMode === 'full'
          ? 'Borne fully by payer'
          : null,
      returnable ? 'Returnable item' : null,
      previewUrl && !receiptMeta ? 'Receipt photo captured locally (too large to attach)' : null,
    ]
      .filter(Boolean)
      .join('\n')

    createExpense.mutate({
      scope: 'shared',
      amountCents,
      merchant: merchant.trim() || undefined,
      date,
      categoryId: categoryId ?? undefined,
      notes: extraNotes || undefined,
      asDraft,
      advanceId: advanceId ?? undefined,
      projectedExpenseId: projectionId ?? undefined,
      receipt: receiptMeta ?? undefined,
    })
  }

  function resetForAnother() {
    setPhase('pick')
    setPreviewUrl(null)
    setReceiptMeta(null)
    setAmount('')
    setMerchant('')
    setDate(todayISO())
    setCategoryId(null)
    setNotes('')
    setAdvanceId(null)
    setProjectionId(null)
    setReturnable(false)
    setError(null)
    setCreatedId(null)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 sm:px-6">
      <div className="flex items-center gap-2 pt-6">
        <button
          aria-label="Back"
          onClick={() => (phase === 'form' ? setPhase('pick') : navigate(-1))}
          className="rounded-full p-1.5 text-hearth-ink2 hover:bg-hearth-surface2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-hearth-ink">
          Add a receipt
        </h1>
      </div>

      <AnimatePresence mode="wait">
        {/* ---------------- Capture picker ---------------- */}
        {phase === 'pick' && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.26, ease: SETTLE_EASE }}
            className="mt-6"
          >
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  key: 'scan',
                  icon: Camera,
                  label: 'Scan receipt',
                  caption: 'Point at the receipt',
                  primary: true,
                  onClick: () => cameraRef.current?.click(),
                },
                {
                  key: 'upload',
                  icon: ImageIcon,
                  label: 'Upload photo',
                  caption: 'From your gallery',
                  onClick: () => galleryRef.current?.click(),
                },
                {
                  key: 'manual',
                  icon: PenLine,
                  label: 'Enter manually',
                  caption: 'No photo needed',
                  onClick: () => setPhase('form'),
                },
                {
                  key: 'advance',
                  icon: HandCoins,
                  label: 'Request an advance',
                  caption: 'Cash up front',
                  gold: true,
                  onClick: () => navigate('/requests'),
                },
              ].map((o, i) => (
                <motion.button
                  key={o.key}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.3, ease: SETTLE_EASE }}
                  onClick={o.onClick}
                  className={cn(
                    'flex flex-col items-start gap-6 rounded-2xl border p-4 text-left shadow-card transition-transform active:scale-[0.97]',
                    o.primary
                      ? 'border-hearth-accent bg-hearth-accent text-white'
                      : 'border-hearth-line bg-hearth-surface text-hearth-ink',
                  )}
                >
                  <o.icon
                    className={cn(
                      'h-6 w-6',
                      o.primary
                        ? 'text-white'
                        : o.gold
                          ? 'text-hearth-gold'
                          : 'text-hearth-accent',
                    )}
                  />
                  <span>
                    <span className="block text-sm font-semibold">{o.label}</span>
                    <span
                      className={cn(
                        'text-xs',
                        o.primary ? 'text-white/70' : 'text-hearth-ink2',
                      )}
                    >
                      {o.caption}
                    </span>
                  </span>
                </motion.button>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-hearth-ink2">
              <CloudOff className="h-3.5 w-3.5" />
              Offline? The draft saves locally and syncs later.
            </p>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </motion.div>
        )}

        {/* ---------------- Processing ---------------- */}
        {phase === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6"
          >
            <div className="relative overflow-hidden rounded-2xl border border-hearth-line bg-hearth-surface shadow-card">
              {previewUrl && (
                <img src={previewUrl} alt="Captured receipt" className="max-h-96 w-full object-contain" />
              )}
              <motion.div
                initial={{ top: 0 }}
                animate={{ top: '100%' }}
                transition={{ duration: 1.2, ease: 'linear' }}
                className="absolute inset-x-0 h-0.5 bg-hearth-accent shadow-[0_0_16px_2px_var(--h-accent)]"
              />
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-hearth-ink2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Reading amount and date…
            </p>
          </motion.div>
        )}

        {/* ---------------- Review form ---------------- */}
        {phase === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.26, ease: SETTLE_EASE }}
            className="mt-6 space-y-5"
          >
            {previewUrl && (
              <div className="flex items-start gap-4">
                <img
                  src={previewUrl}
                  alt="Receipt"
                  className="h-24 w-20 -rotate-2 rounded-xl border border-hearth-line object-cover shadow-card"
                />
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-hearth-line px-3 py-2 text-xs font-semibold text-hearth-ink hover:bg-hearth-surface2"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retake
                </button>
              </div>
            )}

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                Amount
              </label>
              <div className="mt-1 flex items-baseline gap-1 rounded-xl border border-hearth-line bg-hearth-surface px-4 py-3">
                <span className="font-mono text-lg text-hearth-ink2">€</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  autoFocus
                  className="w-full bg-transparent font-mono text-2xl text-hearth-ink outline-none placeholder:text-hearth-ink2/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                  Merchant
                </label>
                <input
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="Mercadona"
                  className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-4 py-2.5 text-sm text-hearth-ink outline-none placeholder:text-hearth-ink2/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-surface px-4 py-2.5 font-mono text-sm text-hearth-ink outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                Category
              </label>
              <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
                {(categoriesQuery.data ?? [])
                  .filter((c) => c.scope !== 'personal')
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategoryId((id) => (id === c.id ? null : c.id))}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                        categoryId === c.id
                          ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                          : 'border-hearth-line bg-hearth-surface text-hearth-ink2 hover:text-hearth-ink',
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                Paid by
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['me', 'partner'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPaidBy(p)}
                    className={cn(
                      'rounded-xl border px-4 py-3 text-sm font-semibold transition-all',
                      paidBy === p
                        ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                        : 'border-hearth-line bg-hearth-surface text-hearth-ink2 hover:text-hearth-ink',
                    )}
                  >
                    {p === 'me' ? 'Me' : (partner?.name ?? 'Partner')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-hearth-ink2">
                Split
              </label>
              <div className="mt-2 flex gap-2">
                {(
                  [
                    ['half', '50 / 50'],
                    ['full', 'Full payer'],
                    ['custom', 'Custom'],
                  ] as [SplitMode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setSplitMode(m)}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
                      splitMode === m
                        ? 'border-hearth-accent bg-hearth-accentSoft text-hearth-accent'
                        : 'border-hearth-line bg-hearth-surface text-hearth-ink2 hover:text-hearth-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {splitMode === 'custom' && (
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={splitPct}
                    onChange={(e) => setSplitPct(Number(e.target.value))}
                    className="flex-1 accent-hearth-accent"
                  />
                  <span className="font-mono text-xs text-hearth-ink">{splitPct}%</span>
                </div>
              )}
              {amountCents > 0 && (
                <p className="mt-2 text-xs text-hearth-ink2">
                  You bear {eur(myShareCents)} · {partner?.name ?? 'Partner'} bears{' '}
                  {eur(amountCents - myShareCents)}
                </p>
              )}
            </div>

            {/* More options */}
            <div className="rounded-2xl border border-hearth-line bg-hearth-surface">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-hearth-ink"
              >
                More options
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')}
                />
              </button>
              {moreOpen && (
                <div className="space-y-4 border-t border-hearth-line p-4">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink outline-none placeholder:text-hearth-ink2/50"
                  />
                  {openAdvances.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-hearth-ink2">
                        Link to open advance
                      </label>
                      <select
                        value={advanceId ?? ''}
                        onChange={(e) =>
                          setAdvanceId(e.target.value ? Number(e.target.value) : null)
                        }
                        className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink"
                      >
                        <option value="">No advance</option>
                        {openAdvances.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.purpose} — {eur(a.outstandingCents)} open
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {plannedProjections.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-hearth-ink2">
                        This pays a planned expense
                      </label>
                      <select
                        value={projectionId ?? ''}
                        onChange={(e) =>
                          setProjectionId(e.target.value ? Number(e.target.value) : null)
                        }
                        className="mt-1 w-full rounded-xl border border-hearth-line bg-hearth-bg px-3 py-2 text-sm text-hearth-ink"
                      >
                        <option value="">Not a planned expense</option>
                        {plannedProjections.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} — {eur(p.amountCents)} due {p.dueDate}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-hearth-ink">Returnable item</span>
                    <input
                      type="checkbox"
                      checked={returnable}
                      onChange={(e) => setReturnable(e.target.checked)}
                      className="h-5 w-5 accent-hearth-accent"
                    />
                  </label>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-xl bg-hearth-rose/10 px-4 py-2.5 text-sm font-medium text-hearth-rose">
                {error}
              </p>
            )}

            {/* Sticky submit bar */}
            <div className="sticky bottom-4 rounded-2xl border border-hearth-line bg-hearth-surface p-3 shadow-card">
              <p className="mb-2 flex items-center gap-1.5 px-1 text-xs text-hearth-ink2">
                {receiptMeta ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-hearth-accent" /> Receipt attached
                  </>
                ) : previewUrl ? (
                  <>
                    <CloudOff className="h-3.5 w-3.5 text-hearth-amber" /> Photo kept locally —
                    metadata saved
                  </>
                ) : (
                  'No receipt photo'
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => submit(true)}
                  disabled={createExpense.isPending}
                  className="flex-1 rounded-xl border border-hearth-line px-4 py-2.5 text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2 disabled:opacity-50"
                >
                  Save draft
                </button>
                <button
                  onClick={() => submit(false)}
                  disabled={createExpense.isPending}
                  className="flex-1 rounded-xl bg-hearth-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {createExpense.isPending ? 'Submitting…' : 'Submit receipt'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ---------------- Success ---------------- */}
        {phase === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: SETTLE_EASE }}
            className="mt-16 flex flex-col items-center text-center"
          >
            {previewUrl ? (
              <motion.img
                initial={{ y: -30, rotate: -6 }}
                animate={{ y: 0, rotate: -2 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                src={previewUrl}
                alt="Receipt"
                className="h-36 w-28 rounded-xl border border-hearth-line object-cover shadow-card"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-hearth-accentSoft">
                <Check className="h-7 w-7 text-hearth-accent" />
              </span>
            )}
            <h2 className="mt-6 font-display text-2xl font-semibold text-hearth-ink">
              Submitted
            </h2>
            <p className="mt-2 max-w-xs text-sm text-hearth-ink2">
              {partner?.name ?? 'Your partner'} will see it in the shared ledger.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={resetForAnother}
                className="rounded-xl border border-hearth-line px-5 py-2.5 text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
              >
                Scan another
              </button>
              {createdId ? (
                <Link
                  to={`/records/${createdId}`}
                  className="rounded-xl bg-hearth-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Done
                </Link>
              ) : (
                <Link
                  to="/records"
                  className="rounded-xl bg-hearth-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Done
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

