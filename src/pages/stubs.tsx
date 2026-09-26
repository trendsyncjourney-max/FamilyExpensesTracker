import type { ReactNode } from 'react'

export function PageStub({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
      <div className="ledger-divider mb-6">
        <span className="text-xs font-medium uppercase tracking-wider text-hearth-ink2">
          {title}
        </span>
        <span className="ledger-diamond" />
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-hearth-ink">
        {title}
      </h1>
      <p className="mt-3 max-w-lg text-sm text-hearth-ink2">
        {children ?? 'This page is being built.'}
      </p>
    </div>
  )
}

export { default as Records } from './records/Records'
export { default as RecordDetail } from './records/RecordDetail'
export { default as RecordNew } from './records/RecordNew'
export { default as Requests } from './Requests'
export { default as RequestDetail } from './RequestDetail'
export { default as RequestNew } from './RequestNew'
export { default as CalendarPage } from './Calendar'
export { default as Personal } from './Personal'
export { default as More } from './More'
export { default as Welcome } from './Welcome'
