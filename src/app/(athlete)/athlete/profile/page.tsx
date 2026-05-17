'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'
import { Switch } from '@/components/ui/switch'
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
  const utils = trpc.useUtils()

  const { data: cohortStatus } = trpc.cohort.getMyOptOut.useQuery()
  const setCohort = trpc.cohort.setMyOptOut.useMutation({
    onSuccess: ({ optOut }) => {
      utils.cohort.getMyOptOut.invalidate()
      toast.success(
        optOut
          ? 'Je doet niet meer mee aan platform-aggregaten.'
          : 'Je telt weer mee in platform-aggregaten.',
      )
    },
    onError: () => toast.error('Er is iets misgegaan. Probeer opnieuw.'),
  })

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
                background: P.brand,
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

        {/* Cohort analytics opt-out */}
        <Tile accentBar={cohortStatus?.optOut ? P.danger : P.lime}>
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p
                className="athletic-mono"
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                }}
              >
                MEEDOEN AAN AGGREGATEN
              </p>
              <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4, lineHeight: '17px' }}>
                Movement Based Therapy gebruikt geanonimiseerde gemiddelden
                (pijn, sessies, oefeningen) om het platform te verbeteren. Je
                kunt jezelf op elk moment uitsluiten — je individuele data
                blijft natuurlijk wel van jou.
              </p>
              <div className="mt-3">
                {cohortStatus?.optOut ? (
                  <span
                    className="athletic-mono px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: P.surfaceHi,
                      color: P.danger,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      border: `1px solid ${P.danger}`,
                    }}
                  >
                    UITGESLOTEN
                  </span>
                ) : (
                  <span
                    className="athletic-mono px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: P.surfaceHi,
                      color: P.lime,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      border: `1px solid ${P.lime}`,
                    }}
                  >
                    DOET MEE
                  </span>
                )}
              </div>
            </div>
            <Switch
              checked={!(cohortStatus?.optOut ?? false)}
              onCheckedChange={(checked) => setCohort.mutate({ optOut: !checked })}
              disabled={setCohort.isPending}
            />
          </div>
        </Tile>

        <DarkButton variant="secondary" onClick={handleSignOut} className="w-full">
          UITLOGGEN
        </DarkButton>
      </div>
    </div>
  )
}
