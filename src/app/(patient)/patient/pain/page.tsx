'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, CheckCircle2 } from 'lucide-react'
import { PAIN_CONTEXT_ICON_MAP } from '@/components/icons'
import { P, Kicker, MetaLabel, Tile, DarkButton, DarkTextarea } from '@/components/dark-ui'

const LOCATIONS = [
  'Knie links', 'Knie rechts',
  'Enkel links', 'Enkel rechts',
  'Heup links', 'Heup rechts',
  'Rug (laag)', 'Rug (midden)',
  'Schouder links', 'Schouder rechts',
  'Nek', 'Anders',
]

const CONTEXTS = [
  { value: 'rest', label: 'In rust', icon: '🛋️' },
  { value: 'movement', label: 'Bij beweging', icon: '🚶' },
  { value: 'exercise', label: 'Tijdens oefening', icon: '🏋️' },
  { value: 'after', label: 'Na inspanning', icon: '😴' },
  { value: 'always', label: 'Altijd', icon: '🔄' },
]

// NRS colour scale — lime → gold → danger
const NRS_COLORS = [
  P.lime, P.lime,
  P.limeMid, P.limeMid,
  P.gold, P.gold,
  P.goldWarm, P.goldWarm,
  P.danger, P.danger,
  P.danger,
]
const NRS_LABELS: Record<number, string> = { 0: 'Geen pijn', 3: 'Mild', 5: 'Matig', 7: 'Ernstig', 10: 'Ondraaglijk' }

export default function PainReportPage() {
  const router = useRouter()
  const [nrs, setNrs] = useState<number | null>(null)
  const [location, setLocation] = useState<string | null>(null)
  const [context, setContext] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const canSubmit = nrs !== null && location !== null && context !== null

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ background: P.bg, color: P.ink }}>
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: P.lime, color: P.bg }}
        >
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <Kicker>BEVESTIGD</Kicker>
        <h2
          className="athletic-display"
          style={{
            color: P.ink,
            fontSize: 32,
            lineHeight: '36px',
            letterSpacing: '-0.03em',
            fontWeight: 900,
            paddingTop: 2,
            textTransform: 'uppercase',
          }}
        >
          PIJN GEREGISTREERD
        </h2>
        <p style={{ color: P.inkMuted, fontSize: 13, maxWidth: '20rem', lineHeight: 1.5 }}>
          Jouw therapeut kan dit zien in het dossier. Neem contact op als de pijn erger wordt.
        </p>
        {nrs !== null && nrs >= 7 && (
          <Tile accentBar={P.danger} style={{ maxWidth: '20rem' }}>
            <p style={{ color: P.danger, fontSize: 13, textAlign: 'center' }}>
              <strong>Hoge pijnscore</strong> — Je therapeut wordt op de hoogte gesteld.
            </p>
          </Tile>
        )}
        <div className="w-full max-w-xs mt-2">
          <DarkButton
            onClick={() => router.push('/patient/dashboard')}
            size="lg"
          >
            TERUG NAAR HOME
          </DarkButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => router.back()}
              className="athletic-tap p-1 -ml-1"
              style={{ color: P.inkMuted }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <Kicker>PIJN RAPPORTEREN</Kicker>
          </div>
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
            PIJN
          </h1>
          <MetaLabel style={{ marginTop: 4, textTransform: 'none', fontWeight: 500 }}>
            Registreer je pijn voor je therapeut
          </MetaLabel>
        </div>

        {/* NRS Scale */}
        <Tile>
          <div className="flex items-center justify-between mb-3">
            <MetaLabel>PIJNNIVEAU (NRS 0–10)</MetaLabel>
            {nrs !== null && (
              <span
                className="athletic-mono px-2 py-0.5 rounded-lg"
                style={{ background: NRS_COLORS[nrs], color: P.bg, fontSize: 12, fontWeight: 900 }}
              >
                {nrs}/10
              </span>
            )}
          </div>
          <div className="flex gap-1 mb-2">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => setNrs(nrs === i ? null : i)}
                className="athletic-tap flex-1 h-11 rounded-xl athletic-mono transition-all"
                style={{
                  background: nrs === i ? NRS_COLORS[i] : P.surfaceHi,
                  color: nrs === i ? P.bg : P.inkMuted,
                  border: nrs === i ? `1px solid ${NRS_COLORS[i]}` : `1px solid ${P.line}`,
                  transform: nrs === i ? 'scale(1.15)' : 'scale(1)',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            {Object.entries(NRS_LABELS).map(([k, v]) => (
              <span
                key={k}
                className="athletic-mono"
                style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.06em' }}
              >
                {v}
              </span>
            ))}
          </div>
        </Tile>

        {/* Location */}
        <Tile>
          <MetaLabel style={{ marginBottom: 12 }}>LOCATIE</MetaLabel>
          <div className="flex flex-wrap gap-2">
            {LOCATIONS.map(loc => {
              const selected = location === loc
              return (
                <button
                  key={loc}
                  onClick={() => setLocation(selected ? null : loc)}
                  className="athletic-tap px-3 py-1.5 rounded-xl transition-all"
                  style={{
                    background: selected ? P.surfaceHi : P.surfaceLow,
                    color: selected ? P.lime : P.inkMuted,
                    border: selected ? `1.5px solid ${P.lime}` : `1.5px solid ${P.line}`,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {loc}
                </button>
              )
            })}
          </div>
        </Tile>

        {/* Context */}
        <Tile>
          <MetaLabel style={{ marginBottom: 12 }}>WANNEER HEB JE PIJN?</MetaLabel>
          <div className="grid grid-cols-2 gap-2">
            {CONTEXTS.map(c => {
              const selected = context === c.value
              return (
                <button
                  key={c.value}
                  onClick={() => setContext(selected ? null : c.value)}
                  className="athletic-tap flex items-center gap-2 px-3 py-3 rounded-2xl transition-all text-left"
                  style={{
                    background: selected ? 'rgba(190,242,100,0.10)' : P.surfaceLow,
                    border: selected ? `2px solid ${P.lime}` : `2px solid ${P.line}`,
                    color: selected ? P.lime : P.inkMuted,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <span className="text-lg">{(() => { const Icon = PAIN_CONTEXT_ICON_MAP[c.value]; return Icon ? <Icon size={20} /> : c.icon })()}</span>
                  {c.label}
                </button>
              )
            })}
          </div>
        </Tile>

        {/* Notes */}
        <Tile>
          <MetaLabel style={{ marginBottom: 12 }}>TOELICHTING (OPTIONEEL)</MetaLabel>
          <DarkTextarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Beschrijf de pijn in eigen woorden..."
            rows={3}
          />
        </Tile>

        <DarkButton
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="lg"
          variant={canSubmit ? 'primary' : 'secondary'}
        >
          RAPPORTEER PIJN
        </DarkButton>
      </div>
    </div>
  )
}
