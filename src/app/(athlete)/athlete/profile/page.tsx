'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkButton,
} from '@/components/dark-ui'

export default function AthleteProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div>
          <Kicker>PROFIEL · ATLEET</Kicker>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              fontSize: 'clamp(44px, 12vw, 80px)',
              paddingTop: 4,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            ATLEET
          </h1>
        </div>

        {/* Avatar circle */}
        <Tile>
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: P.lime,
                color: P.bg,
                fontWeight: 900,
                fontSize: 22,
                letterSpacing: '0.04em',
              }}
            >
              AT
            </div>
            <div className="min-w-0">
              <div
                style={{
                  color: P.ink,
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: '-0.01em',
                  textTransform: 'uppercase',
                }}
              >
                ATLEET
              </div>
              <div style={{ marginTop: 4 }}>
                <MetaLabel>ATLEET DASHBOARD</MetaLabel>
              </div>
            </div>
          </div>
        </Tile>

        {/* Profile info */}
        <Tile>
          <Kicker style={{ marginBottom: 12 }}>PROFIEL</Kicker>
          <div className="space-y-3">
            <div
              className="flex items-center justify-between py-2"
              style={{ borderBottom: `1px solid ${P.line}` }}
            >
              <MetaLabel>ROL</MetaLabel>
              <span
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                ATLEET
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <MetaLabel>MODUS</MetaLabel>
              <span
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                ZELFSTANDIG TRAINEN
              </span>
            </div>
          </div>
        </Tile>

        <DarkButton variant="secondary" onClick={handleSignOut} className="w-full">
          UITLOGGEN
        </DarkButton>
      </div>
    </div>
  )
}
