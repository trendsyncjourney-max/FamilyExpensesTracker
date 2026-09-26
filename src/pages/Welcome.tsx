import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'
import {
  CalendarDays,
  RotateCcw,
  Lock,
  History,
  Copy,
  Check,
  Loader2,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'
import { cn } from '@/lib/utils'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/* ------------------------------ ambient blobs ----------------------------- */

function AmbientBlobs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <div
        className="absolute -left-32 top-[-10%] h-[480px] w-[480px] rounded-full opacity-60 blur-3xl motion-safe:animate-[blob-drift_20s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, var(--h-accent-soft), transparent 70%)' }}
      />
      <div
        className="absolute -right-40 bottom-[-15%] h-[560px] w-[560px] rounded-full opacity-50 blur-3xl motion-safe:animate-[blob-drift_20s_ease-in-out_infinite_reverse]"
        style={{ background: 'radial-gradient(circle, var(--h-accent-soft), transparent 70%)' }}
      />
      <style>{`@keyframes blob-drift { 0%,100% { transform: translate(0,0) } 50% { transform: translate(48px, 36px) } }`}</style>
    </div>
  )
}

/* ------------------------------ advance meter ----------------------------- */

function MiniAdvanceMeter() {
  const ref = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLParagraphElement>(null)

  useGSAP(
    () => {
      if (!barRef.current || !labelRef.current) return
      const state = { p: 0 }
      gsap.to(state, {
        p: 70,
        ease: 'none',
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 75%',
          end: 'center center',
          scrub: 0.5,
        },
        onUpdate: () => {
          const receipts = Math.round(300 * (state.p / 100))
          const toReturn = 300 - receipts
          barRef.current!.style.transform = `scaleX(${state.p / 100})`
          labelRef.current!.textContent = `€300 given · €${receipts} receipts · €${toReturn} to return`
        },
      })
    },
    { scope: ref },
  )

  return (
    <div ref={ref} className="mt-6 rounded-2xl border border-hearth-line bg-hearth-surface2/70 p-4">
      <div className="h-3 overflow-hidden rounded-full bg-hearth-line/60">
        <div
          ref={barRef}
          className="h-full w-full origin-left rounded-full bg-gradient-to-r from-hearth-gold via-hearth-gold to-hearth-accent"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>
      <p ref={labelRef} className="mt-2 font-mono text-xs font-medium text-hearth-ink2">
        €300 given · €0 receipts · €300 to return
      </p>
    </div>
  )
}

/* ------------------------------- auth card -------------------------------- */

function FamilySetup() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createMut = trpc.family.create.useMutation({
    onSuccess: async (r) => {
      setCreatedCode(r.inviteCode)
      await utils.family.current.invalidate()
    },
    onError: (e) => setError(e.message),
  })
  const joinMut = trpc.family.join.useMutation({
    onSuccess: async () => {
      await utils.invalidate()
      navigate('/')
    },
    onError: (e) => setError(e.message),
  })

  const formatCode = (v: string) =>
    v
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6)
      .replace(/^(.{3})(.{1,3})$/, '$1-$2')

  if (createdCode) {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-hearth-ink2">Your family invite code</p>
        <p className="mt-3 font-mono text-4xl font-semibold tracking-[0.2em] text-hearth-accent">
          {formatCode(createdCode)}
        </p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(createdCode).catch(() => {})
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-hearth-line px-4 py-2 text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
        >
          {copied ? <Check className="h-4 w-4 text-hearth-accent" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <p className="mt-3 text-xs text-hearth-ink2">Send it to your partner</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-12 items-center rounded-xl bg-hearth-accent px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Welcome home
        </Link>
      </div>
    )
  }

  return (
    <div>
      {mode === 'choose' && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode('create')}
            className="h-14 rounded-xl bg-hearth-accent text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Create a family
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className="h-14 rounded-xl border border-hearth-line text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
          >
            Join with code
          </button>
        </div>
      )}
      {mode === 'create' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            if (name.trim()) createMut.mutate({ name: name.trim() })
          }}
          className="flex flex-col gap-3"
        >
          <label className="text-xs font-semibold uppercase tracking-wide text-hearth-ink2">
            Family name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Martins"
            className="h-12 rounded-xl border border-hearth-line bg-hearth-surface px-4 text-sm text-hearth-ink outline-none focus:border-hearth-accent"
          />
          <button
            type="submit"
            disabled={createMut.isPending || !name.trim()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-hearth-accent text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create family
          </button>
        </form>
      )}
      {mode === 'join' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            joinMut.mutate({ inviteCode: code.replace('-', '') })
          }}
          className="flex flex-col gap-3"
        >
          <label className="text-xs font-semibold uppercase tracking-wide text-hearth-ink2">
            Invite code
          </label>
          <input
            value={code}
            onChange={(e) => setCode(formatCode(e.target.value))}
            placeholder="ABC-123"
            className="h-12 rounded-xl border border-hearth-line bg-hearth-surface px-4 text-center font-mono text-lg tracking-[0.3em] text-hearth-ink outline-none focus:border-hearth-accent"
          />
          <button
            type="submit"
            disabled={joinMut.isPending || code.replace('-', '').length < 4}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-hearth-accent text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {joinMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Join family
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-center text-sm font-medium text-hearth-rose">{error}</p>}
      {mode !== 'choose' && (
        <button
          type="button"
          onClick={() => {
            setMode('choose')
            setError(null)
          }}
          className="mt-4 w-full text-center text-xs font-semibold text-hearth-ink2 hover:text-hearth-ink"
        >
          Back
        </button>
      )}
    </div>
  )
}

function AuthCard() {
  const { isAuthenticated, isLoading } = useAuth()

  return (
    <div
      data-auth-card
      className="w-full max-w-md rounded-3xl border border-hearth-line bg-hearth-surface p-8 shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]"
    >
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-hearth-surface2" aria-hidden />
      ) : isAuthenticated ? (
        <div>
          <h3 className="font-display text-2xl font-medium text-hearth-ink">
            Set up your family
          </h3>
          <p className="mb-6 mt-2 text-sm text-hearth-ink2">
            One ledger for the two of you.
          </p>
          <FamilySetup />
        </div>
      ) : (
        <div className="text-center">
          <h3 className="font-display text-2xl font-medium text-hearth-ink">Begin</h3>
          <p className="mb-6 mt-2 text-sm text-hearth-ink2">
            We'll email you a sign-in link. No passwords.
          </p>
          <Link
            to={LOGIN_PATH}
            className="flex h-14 items-center justify-center rounded-xl bg-hearth-accent text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start your family
          </Link>
          <Link
            to={LOGIN_PATH}
            className="mt-3 flex h-14 items-center justify-center rounded-xl border border-hearth-line text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
          >
            I have an invite code
          </Link>
        </div>
      )}
      <p className="mt-6 text-center text-xs text-hearth-ink2">
        Installable PWA · your data syncs between both partners' devices
      </p>
    </div>
  )
}

/* --------------------------------- page ----------------------------------- */

const LOOP_STEPS = [
  'Snap the receipt — we read the amount.',
  'Your partner reviews with one tap.',
  'Paid, confirmed, cleared. Forever traceable — even for returns.',
]

const FEATURES = [
  { icon: CalendarDays, title: 'Projected-expense calendar', accent: false },
  { icon: RotateCcw, title: 'Returns stay traceable', accent: false },
  { icon: Lock, title: 'A private personal page for each of you', accent: true },
  { icon: History, title: 'Complete audit trail — nothing is ever edited silently', accent: false },
]

export default function Welcome() {
  const root = useRef<HTMLDivElement>(null)

  // Lenis smooth scroll, synced with ScrollTrigger
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.09 })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
    }
  }, [])

  useGSAP(
    () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) return

      // Hero: headline char-split entrance, sub words, CTAs, parallax image
      const chars = gsap.utils.toArray<HTMLElement>('[data-hero-char]')
      gsap.set(chars, { y: 24, opacity: 0 })
      const tl = gsap.timeline({ delay: 0.2 })
      tl.to(chars, { y: 0, opacity: 1, duration: 0.7, stagger: 0.018, ease: 'power3.out' })
        .fromTo(
          '[data-hero-word]',
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, stagger: 0.04, ease: 'power2.out' },
          '-=0.2',
        )
        .fromTo(
          '[data-hero-cta]',
          { scale: 0.94, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.45, stagger: 0.08, ease: 'back.out(1.6)' },
          '+=0.3',
        )

      gsap.to('[data-hero-img]', {
        yPercent: -18,
        ease: 'none',
        scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
      })

      // Section 2: pinned horizontal journey across receipt loop diagram
      const loopTl = gsap.timeline({
        scrollTrigger: {
          trigger: '[data-loop]',
          start: 'top top',
          end: '+=150%',
          pin: true,
          scrub: 0.5,
        },
      })
      loopTl.fromTo('[data-loop-img]', { xPercent: 8 }, { xPercent: -8, ease: 'none' }, 0)
      gsap.utils.toArray<HTMLElement>('[data-loop-caption]').forEach((el, i) => {
        const at = i / 3
        loopTl.fromTo(
          el,
          { x: 40, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.12, ease: 'power2.out' },
          at,
        )
        if (i < LOOP_STEPS.length - 1) {
          loopTl.to(el, { opacity: 0.35, duration: 0.08 }, at + 0.3)
        }
      })

      // Section 3: pinned advance, image scales 0.92 → 1
      gsap.fromTo(
        '[data-adv-img]',
        { scale: 0.92 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '[data-adv]',
            start: 'top top',
            end: '+=120%',
            pin: true,
            scrub: 0.5,
          },
        },
      )

      // Section 4: feature grid stagger reveal
      gsap.fromTo(
        '[data-feature]',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.07,
          ease: 'power3.out',
          scrollTrigger: { trigger: '[data-features]', start: 'top 80%', once: true },
        },
      )

      // Auth card entrance
      gsap.fromTo(
        '[data-auth-card]',
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: { trigger: '[data-auth-card]', start: 'top 85%', once: true },
        },
      )
    },
    { scope: root },
  )

  const headline = 'Family money, finally in good order.'
  const sub = 'Send receipts. Clear reimbursements. Track advances. Plan the month. Together.'

  return (
    <div ref={root} className="relative">
      <AmbientBlobs />
      <div className="relative" style={{ zIndex: 1 }}>
        {/* Section 1 — Hero */}
        <section
          data-hero
          className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-16 text-center"
        >
          <h1
            className="mx-auto max-w-3xl font-display text-[40px] leading-[1.15] font-semibold tracking-[-0.01em] text-hearth-ink sm:text-5xl"
            aria-label={headline}
          >
            {headline.split(' ').map((word, wi) => (
              <span key={wi} className="inline-block whitespace-nowrap">
                {word.split('').map((c, ci) => (
                  <span key={ci} data-hero-char className="inline-block" aria-hidden>
                    {c}
                  </span>
                ))}
                {wi < headline.split(' ').length - 1 && <span>&nbsp;</span>}
              </span>
            ))}
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-7 text-hearth-ink2">
            {sub.split(' ').map((w, i) => (
              <span key={i} data-hero-word className="inline-block">
                {w}&nbsp;
              </span>
            ))}
          </p>

          <div className="mt-8 w-full max-w-2xl overflow-hidden">
            <img
              data-hero-img
              src="/hero-onboarding.png"
              alt="Two phones on a kitchen table showing matching receipt cards"
              className="mx-auto w-full rounded-3xl object-cover shadow-[0_24px_60px_-20px_rgba(28,26,23,.35)]"
              style={{ transform: 'rotate(-1.5deg)' }}
            />
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              data-hero-cta
              to={LOGIN_PATH}
              className="flex h-14 items-center rounded-xl bg-hearth-accent px-8 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Start your family
            </Link>
            <Link
              data-hero-cta
              to={LOGIN_PATH}
              className="flex h-14 items-center rounded-xl border border-hearth-line px-8 text-sm font-semibold text-hearth-ink transition-colors hover:bg-hearth-surface2"
            >
              I have an invite code
            </Link>
          </div>
          <p className="mt-5 text-xs font-medium tracking-wide text-hearth-ink2">
            Private by design · Works offline · Installs like an app
          </p>
          <div
            aria-hidden
            className="mt-10 h-2 w-2 rotate-45 bg-hearth-ink2 motion-safe:animate-bounce"
            style={{ animationDuration: '1.6s' }}
          />
        </section>

        {/* Section 2 — receipt lifecycle, pinned */}
        <section data-loop className="flex min-h-[100dvh] items-center overflow-hidden px-4">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
            <div className="overflow-hidden rounded-3xl border border-hearth-line bg-hearth-surface shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]">
              <img
                data-loop-img
                src="/onboarding-receipt-loop.png"
                alt="Receipt lifecycle: camera, review card, cleared stamp"
                className="w-full scale-110 object-cover"
              />
            </div>
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-3xl font-medium text-hearth-ink">
                How receipts clear
              </h2>
              {LOOP_STEPS.map((s, i) => (
                <div
                  key={i}
                  data-loop-caption
                  className="rounded-2xl border border-hearth-line bg-hearth-surface p-5"
                  style={{ opacity: 0 }}
                >
                  <span className="font-mono text-xs font-medium text-hearth-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-1 text-[15px] font-medium leading-6 text-hearth-ink">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3 — advances, pinned */}
        <section data-adv className="flex min-h-[100dvh] items-center px-4">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
            <img
              data-adv-img
              src="/onboarding-advance.png"
              alt="A hand passing coins into a labelled jar beside stacking receipts"
              className="w-full rounded-3xl border border-hearth-line object-cover shadow-[0_1px_2px_rgba(28,26,23,.05),0_8px_24px_-12px_rgba(28,26,23,.12)]"
            />
            <div>
              <h2 className="font-display text-3xl font-medium text-hearth-ink">
                Big purchase coming? Ask first, receipt later.
              </h2>
              <p className="mt-4 text-[15px] leading-6 text-hearth-ink2">
                Request money up front, then clear it with receipts as you shop — or return the
                change. Nothing gets lost.
              </p>
              <MiniAdvanceMeter />
            </div>
          </div>
        </section>

        {/* Section 4 — feature grid */}
        <section data-features className="px-4 py-24">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                data-feature
                className={cn(
                  'rounded-2xl border border-hearth-line bg-hearth-surface p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_8px_24px_-12px_rgba(28,26,23,.2)]',
                  f.accent && 'border-l-4 border-l-hearth-personal',
                )}
                style={{ transitionTimingFunction: SETTLE }}
              >
                <f.icon
                  className={cn('h-6 w-6', f.accent ? 'text-hearth-personal' : 'text-hearth-accent')}
                />
                <p className="mt-3 text-sm font-semibold leading-5 text-hearth-ink">{f.title}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 5 — auth / family setup */}
        <section className="flex min-h-[90dvh] items-center justify-center px-4 py-16">
          <AuthCard />
        </section>
      </div>
    </div>
  )
}
