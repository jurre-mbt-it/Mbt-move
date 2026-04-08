'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, CheckCircle2 } from 'lucide-react'

const LOCATIONS = [
  'Knie links', 'Knie rechts',
  'Schouder links', 'Schouder rechts',
  'Rug (lumbaal)', 'Rug (thoracaal)',
  'Enkel links', 'Enkel rechts',
  'Heup links', 'Heup rechts',
  'Nek / cervicaal',
  'Anders',
]

const CONTEXTS = [
  'In rust', 'Bij bewegen', 'Na training',
  'Tijdens training', 'Bij traplopen', 'Bij slapen',
]

export default function PainReportPage() {
  const router = useRouter()
  const [nrs, setNrs] = useState<number | null>(null)
  const [location, setLocation] = useState<string | null>(null)
  const [context, setContext] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit() {
    if (nrs === null || !location) return
    setSubmitted(true)
    setTimeout(() => router.push('/patient/progress'), 2000)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: '#FAFAFA' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: '#f0fdf4' }}>
          <CheckCircle2 className="w-8 h-8" style={{ color: '#3ECF6A' }} />
        </div>
        <h2 className="text-xl font-bold mb-1">Geregistreerd</h2>
        <p className="text-sm text-muted-foreground">
          Je therapeut kan dit inzien bij je volgende sessie.
        </p>
      </div>
    )
  }

  const canSubmit = nrs !== null && location !== null

  return (
    <div className="min-h-screen pb-8" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ background: '#1A1A1A' }}>
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-zinc-400 text-sm mb-3">
          <ChevronLeft className="w-4 h-4" /> Terug
        </button>
        <h1 className="text-white text-xl font-bold">Pijn rapporteren</h1>
        <p className="text-zinc-400 text-xs mt-0.5">Los van een oefensessie</p>
      </div>

      <div className="px-4 py-5 space-y-6">
        {/* NRS score */}
        <div>
          <p className="font-semibold text-sm mb-1">
            Pijnniveau (NRS 0-10)
            <span className="text-muted-foreground font-normal"> — verplicht</span>
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            0 = geen pijn · 10 = ergst denkbare pijn
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: 11 }, (_, i) => {
              const color = i === 0 ? '#22c55e' : i <= 3 ? '#84cc16' : i <= 6 ? '#f97316' : '#ef4444'
              const selected = nrs === i
              return (
                <button
                  key={i}
                  onClick={() => setNrs(selected ? null : i)}
                  className="flex-1 min-w-[36px] h-12 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: selected ? color : '#f4f4f5',
                    color: selected ? 'white' : '#71717a',
                    transform: selected ? 'scale(1.08)' : 'scale(1)',
                    border: selected ? `2px solid ${color}` : '2px solid transparent',
                  }}
                >
                  {i}
                </button>
              )
            })}
          </div>
          {nrs !== null && (
            <p className="text-xs mt-2 font-medium"
              style={{ color: nrs <= 3 ? '#15803d' : nrs <= 6 ? '#c2410c' : '#b91c1c' }}>
              {nrs === 0 ? 'Geen pijn'
                : nrs <= 3 ? 'Milde pijn'
                  : nrs <= 6 ? 'Matige pijn'
                    : 'Ernstige pijn'}
              {' '} — score {nrs}/10
            </p>
          )}
        </div>

        {/* Location */}
        <div>
          <p className="font-semibold text-sm mb-3">
            Locatie
            <span className="text-muted-foreground font-normal"> — verplicht</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {LOCATIONS.map(loc => (
              <button
                key={loc}
                onClick={() => setLocation(location === loc ? null : loc)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                style={
                  location === loc
                    ? { background: '#1A1A1A', color: 'white', borderColor: '#1A1A1A' }
                    : { background: 'white', color: '#52525b', borderColor: '#e4e4e7' }
                }
              >
                {loc}
              </button>
            ))}
          </div>
        </div>

        {/* Context */}
        <div>
          <p className="font-semibold text-sm mb-3">
            Wanneer?
            <span className="text-muted-foreground font-normal"> — optioneel</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {CONTEXTS.map(ctx => (
              <button
                key={ctx}
                onClick={() => setContext(context === ctx ? null : ctx)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                style={
                  context === ctx
                    ? { background: '#3ECF6A', color: 'white', borderColor: '#3ECF6A' }
                    : { background: 'white', color: '#52525b', borderColor: '#e4e4e7' }
                }
              >
                {ctx}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="font-semibold text-sm mb-2">
            Notitie
            <span className="text-muted-foreground font-normal"> — optioneel</span>
          </p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Beschrijf de pijn, wanneer het begon, wat het verergert..."
            className="w-full border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-200"
            rows={3}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full h-12 rounded-xl text-sm font-semibold text-white transition-all"
          style={{
            background: canSubmit ? '#3ECF6A' : '#e4e4e7',
            color: canSubmit ? 'white' : '#a1a1aa',
          }}
        >
          Rapportage opslaan
        </button>
      </div>
    </div>
  )
}
