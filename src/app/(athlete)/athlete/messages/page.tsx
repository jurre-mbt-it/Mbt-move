'use client'

import Link from 'next/link'
import { P, Kicker } from '@/components/dark-ui'
import { MessageThread } from '@/components/messages/MessageThread'

const mono =
  'var(--font-mono-athletic)'

export default function AthleteMessagesPage() {
  return (
    // Vaste hoogte minus de bottom-nav (h-16) zodat de composer erboven blijft.
    <div
      className="flex flex-col"
      style={{ background: P.bg, color: P.ink, height: 'calc(100dvh - 64px)' }}
    >
      <div className="max-w-lg w-full mx-auto flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-10 pb-3" style={{ borderBottom: `1px solid ${P.line}` }}>
          <Link
            href="/athlete/dashboard"
            className="athletic-tap inline-flex"
            style={{
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.16em',
              fontWeight: 800,
              color: P.inkMuted,
              textTransform: 'uppercase',
            }}
          >
            ← TERUG
          </Link>
          <div style={{ marginTop: 8 }}>
            <Kicker>MET JE COACH</Kicker>
            <h1
              className="athletic-display"
              style={{
                color: P.ink,
                fontWeight: 900,
                letterSpacing: '-0.03em',
                fontSize: 28,
                textTransform: 'uppercase',
                margin: '2px 0 0',
              }}
            >
              Berichten
            </h1>
          </div>
        </div>
        <MessageThread viewerSide="patient" />
      </div>
    </div>
  )
}
