// Sync-only theme root: spiegelt app/layout.tsx (athletic-dark op html+body).
// Previews en floor cards renderen hierbinnen zodat shadcn-tokens de
// athletic-dark overrides krijgen, zoals in de echte app.
import * as React from 'react'
export function DsThemeRoot({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="athletic-dark"
      style={{
        background: 'var(--p-bg)',
        color: 'var(--p-ink)',
        fontFamily: "'Satoshi', ui-sans-serif, system-ui, sans-serif",
        padding: 16,
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  )
}
