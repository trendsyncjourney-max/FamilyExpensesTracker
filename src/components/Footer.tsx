import { Link } from 'react-router'

export default function Footer() {
  return (
    <footer className="border-t border-hearth-line bg-hearth-surface2/60">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-4 py-10 sm:px-6">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" className="h-6 w-6" />
          <span className="font-display text-lg font-semibold text-hearth-ink">Hearth</span>
        </div>
        <p className="max-w-md text-center text-sm text-hearth-ink2">
          Shared receipts, reimbursements, advances and plans — one calm ledger for the
          two of you.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-hearth-ink2">
          <Link to="/records" className="hover:text-hearth-ink">Records</Link>
          <Link to="/requests" className="hover:text-hearth-ink">Requests</Link>
          <Link to="/calendar" className="hover:text-hearth-ink">Calendar</Link>
          <Link to="/personal" className="hover:text-hearth-personal">Personal</Link>
          <Link to="/more" className="hover:text-hearth-ink">More</Link>
        </nav>
        <div className="ledger-divider w-full max-w-xs">
          <span className="ledger-diamond" />
        </div>
        <p className="text-xs text-hearth-ink2">Trustworthy clarity, every month.</p>
      </div>
    </footer>
  )
}
