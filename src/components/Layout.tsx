import { useSyncExternalStore, type ReactNode } from 'react'
import { CloudOff } from 'lucide-react'
import Navbar from './Navbar'
import Footer from './Footer'
import MobileTabBar from './MobileTabBar'

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** Slim, non-blocking offline/sync pill (design.md §6). Hidden when online. */
function OfflinePill() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
  if (online) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4 pt-2">
      <p className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-hearth-amber px-3 py-1 text-xs font-semibold text-white shadow-md">
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
        Saved locally — will sync
      </p>
    </div>
  )
}

/**
 * Shared layout — children pattern (react-dev.md Layout + routing contract, A).
 * Navbar is `sticky top-0 z-50` in normal flow, so no page needs nav-height offsets.
 * Mobile gets a fixed bottom tab bar; content keeps bottom padding to clear it.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-hearth-bg text-hearth-ink">
      <Navbar />
      <OfflinePill />
      <main className="flex-1 pb-24 md:pb-0">{children}</main>
      <Footer />
      <MobileTabBar />
    </div>
  )
}
