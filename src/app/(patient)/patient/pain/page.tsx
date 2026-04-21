'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, CheckCircle2 } from 'lucide-react'
import { PAIN_CONTEXT_ICON_MAP } from '@/components/icons'

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

const NRS_COLORS = ['#14B8A6', '#14B8A6', '#84cc16', '#84cc16', '#eab308', '#eab308', '#f97316', '#f97316', '#ef4444', '#ef4444', '#F87171']
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ background: '#FAFAFA' }}>
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white"
          style={{ background: '#BEF264' }}
        >
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold">Pijn geregistreerd</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Jouw therapeut kan dit zien in het dossier. Neem contact op als de pijn erger wordt.
        </p>
        {nrs !== null && nrs >= 7 && (
          <div
            className="rounded-2xl px-4 py-3 text-sm max-w-xs text-center"
            style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid #fecaca', color: '#F87171' }}
          >
            <strong>Hoge pijnscore</strong> — Je therapeut wordt op de hoogte gesteld.
          </div>
        )}
        <Button
          onClick={() => router.push('/patient/dashboard')}
          className="mt-2 w-full max-w-xs h-12 font-semibold"
          style={{ background: '#BEF264' }}
        >
          Terug naar Home
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center gap-3" style={{ background: '#1C2425' }}>
        <button onClick={() => router.back()} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-white font-bold text-lg">Pijn rapporteren</h1>
          <p className="text-[#7B8889] text-xs">Registreer je pijn voor je therapeut</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* NRS Scale */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">Pijnniveau (NRS 0–10)</p>
              {nrs !== null && (
                <span
                  className="text-sm font-bold px-2 py-0.5 rounded-lg text-white"
                  style={{ background: NRS_COLORS[nrs] }}
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
                  className="flex-1 h-11 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: nrs === i ? NRS_COLORS[i] : '#1C2425',
                    color: nrs === i ? 'white' : '#7B8889',
                    transform: nrs === i ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[#7B8889]">
              {Object.entries(NRS_LABELS).map(([k, v]) => (
                <span key={k}>{v}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <p className="font-semibold text-sm mb-3">Locatie</p>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map(loc => {
                const selected = location === loc
                return (
                  <button
                    key={loc}
                    onClick={() => setLocation(selected ? null : loc)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      background: selected ? '#1C2425' : '#1C2425',
                      color: selected ? '#BEF264' : '#52525b',
                      border: selected ? '1.5px solid #BEF264' : '1.5px solid transparent',
                    }}
                  >
                    {loc}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Context */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <p className="font-semibold text-sm mb-3">Wanneer heb je pijn?</p>
            <div className="grid grid-cols-2 gap-2">
              {CONTEXTS.map(c => {
                const selected = context === c.value
                return (
                  <button
                    key={c.value}
                    onClick={() => setContext(selected ? null : c.value)}
                    className="flex items-center gap-2 px-3 py-3 rounded-2xl text-sm font-medium transition-all text-left"
                    style={{
                      background: selected ? 'rgba(190,242,100,0.10)' : '#1C2425',
                      border: selected ? '2px solid #BEF264' : '2px solid transparent',
                      color: selected ? '#BEF264' : '#52525b',
                    }}
                  >
                    <span className="text-lg">{(() => { const Icon = PAIN_CONTEXT_ICON_MAP[c.value]; return Icon ? <Icon size={20} /> : c.icon })()}</span>
                    {c.label}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <p className="font-semibold text-sm mb-3">Toelichting (optioneel)</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Beschrijf de pijn in eigen woorden..."
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
              style={{ background: '#1C2425', border: 'none' }}
              rows={3}
            />
          </CardContent>
        </Card>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full h-12 text-base font-semibold"
          style={{ background: canSubmit ? '#BEF264' : undefined }}
        >
          Rapporteer pijn
        </Button>
      </div>
    </div>
  )
}
