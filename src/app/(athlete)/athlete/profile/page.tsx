'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'
import { AccessRelations } from '@/components/access/AccessRelations'
import { computeHrZones } from '@/lib/cardio-zones'
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

  const { data: cohortStatus } = trpc.cohort.getMyOptIn.useQuery()
  const setCohort = trpc.cohort.setMyOptIn.useMutation({
    onSuccess: ({ optIn }) => {
      utils.cohort.getMyOptIn.invalidate()
      toast.success(
        optIn
          ? 'Je telt mee in platform-aggregaten.'
          : 'Je doet niet meer mee aan platform-aggregaten.',
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

        {/* Cohort analytics opt-in (AVG art. 9 — default niet meedoen) */}
        <Tile accentBar={cohortStatus?.optIn ? P.lime : P.inkDim}>
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
                (pijn, sessies, oefeningen) om het platform te verbeteren.
                Je kunt zelf kiezen om mee te doen, je individuele data
                blijft natuurlijk wel van jou. Standaard doe je niet mee.
              </p>
              <div className="mt-3">
                {cohortStatus?.optIn ? (
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
                ) : (
                  <span
                    className="athletic-mono px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: P.surfaceHi,
                      color: P.inkMuted,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      border: `1px solid ${P.line}`,
                    }}
                  >
                    NIET INGESCHAKELD
                  </span>
                )}
              </div>
            </div>
            <Switch
              checked={cohortStatus?.optIn ?? false}
              onCheckedChange={(checked) => setCohort.mutate({ optIn: checked })}
              disabled={setCohort.isPending}
            />
          </div>
        </Tile>

        {/* HR-profiel — voedt de auto-berekende cardio-zones */}
        <HrProfileCard />

        {/* Wie mag jouw gegevens zien. Stond eerder alleen in de patiënt-
            omgeving, waardoor een atleet een openstaand verzoek van een coach
            of therapeut nooit kon goedkeuren. */}
        <div className="flex flex-col gap-2">
          <Kicker>Wie mag jouw gegevens zien</Kicker>
          <AccessRelations />
        </div>

        <DarkButton variant="secondary" onClick={handleSignOut} className="w-full">
          UITLOGGEN
        </DarkButton>
      </div>
    </div>
  )
}

// ───────────────────────── HR-profiel ─────────────────────────

const hrInputStyle: React.CSSProperties = {
  background: P.surfaceHi,
  border: `1px solid ${P.lineStrong}`,
  color: P.ink,
  fontSize: 16,
  fontWeight: 800,
  borderRadius: 10,
  height: 48,
  width: '100%',
  textAlign: 'center',
  outline: 'none',
}

function HrProfileCard() {
  const utils = trpc.useUtils()
  const { data: me } = trpc.auth.getMe.useQuery()
  const update = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.getMe.invalidate()
      toast.success('Hartslagprofiel opgeslagen.')
    },
    onError: () => toast.error('Opslaan mislukt. Probeer opnieuw.'),
  })

  // Lokale edits zijn null tot de atleet iets typt; tot dan tonen we de
  // server-waarde. Zo vermijden we een setState-in-effect hydratie-stap.
  const [maxHrEdit, setMaxHr] = useState<string | null>(null)
  const [restHrEdit, setRestHr] = useState<string | null>(null)
  const [lthrEdit, setLthr] = useState<string | null>(null)

  const maxHr = maxHrEdit ?? (me?.maxHeartRate != null ? String(me.maxHeartRate) : '')
  const restHr = restHrEdit ?? (me?.restingHeartRate != null ? String(me.restingHeartRate) : '')
  const lthr = lthrEdit ?? (me?.lthr != null ? String(me.lthr) : '')

  const preview = computeHrZones({
    maxHeartRate: maxHr ? parseInt(maxHr, 10) : null,
    restingHeartRate: restHr ? parseInt(restHr, 10) : null,
    dateOfBirth: me?.dateOfBirth ?? null,
  })

  return (
    <Tile>
      <Kicker style={{ marginBottom: 4 }}>HARTSLAGPROFIEL</Kicker>
      <p style={{ color: P.inkMuted, fontSize: 12, marginBottom: 12, lineHeight: '17px' }}>
        Vul je max-hartslag in voor nauwkeurige trainingszones. Met je rust-hartslag
        rekenen we via Karvonen (preciezer). Leeg laten? Dan schatten we op leeftijd.
      </p>
      <div className="flex gap-3">
        <div className="flex-1">
          <MetaLabel style={{ marginBottom: 4 }}>MAX HR</MetaLabel>
          <input type="number" min={100} max={230} placeholder="190" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} style={hrInputStyle} />
        </div>
        <div className="flex-1">
          <MetaLabel style={{ marginBottom: 4 }}>RUST HR</MetaLabel>
          <input type="number" min={30} max={120} placeholder="55" value={restHr} onChange={(e) => setRestHr(e.target.value)} style={hrInputStyle} />
        </div>
        <div className="flex-1">
          <MetaLabel style={{ marginBottom: 4 }}>DREMPEL (LTHR)</MetaLabel>
          <input type="number" min={80} max={220} placeholder="opt." value={lthr} onChange={(e) => setLthr(e.target.value)} style={hrInputStyle} />
        </div>
      </div>

      {preview && (
        <div className="mt-3 flex gap-1.5">
          {preview.zones.map((z) => (
            <div key={z.zone} className="flex-1 rounded-lg text-center py-1.5" style={{ background: z.color + '22', border: `1px solid ${z.color}55` }}>
              <div className="athletic-mono" style={{ fontSize: 10, fontWeight: 900, color: z.color }}>Z{z.zone}</div>
              <div className="athletic-mono" style={{ fontSize: 10, color: P.inkMuted, marginTop: 2 }}>{z.minBpm}-{z.maxBpm}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <DarkButton
          onClick={() =>
            update.mutate({
              maxHeartRate: maxHr ? parseInt(maxHr, 10) : null,
              restingHeartRate: restHr ? parseInt(restHr, 10) : null,
              lthr: lthr ? parseInt(lthr, 10) : null,
            })
          }
          loading={update.isPending}
          className="w-full"
        >
          PROFIEL OPSLAAN
        </DarkButton>
      </div>
    </Tile>
  )
}
