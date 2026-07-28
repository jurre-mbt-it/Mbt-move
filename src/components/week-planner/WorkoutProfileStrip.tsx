'use client'

/**
 * Het profiel van een geplande workout als miniatuur-balkjes onder de tegel,
 * zoals een trainingskalender dat doet: je ziet aan de vorm meteen of het een
 * rustige duurloop is of 5× interval, zonder de tegel te openen.
 *
 * Twee bronnen, één beeld:
 *   - CARDIO met blokken → dezelfde balken als de bouwer en de atleet-kaart,
 *     via `cardioChartBars`. Herhalingen staan uitgevouwen, dus werk/rust komt
 *     terug als een zaagtand. Werkt ook op het oude platte formaat, want
 *     `readWorkout` vertaalt legacy-intervallen naar blokken.
 *   - Kracht en de rest → één balkje per oefening. Breedte is de geschatte
 *     werkduur van die oefening, hoogte het voorgeschreven RPE.
 *
 * Bewust géén as, tooltip of interactie: dit is een vorm, geen grafiek. De
 * volledige inhoud staat in het zijpaneel dat opent als je de tegel aanklikt.
 */

import { cardioChartBars } from '@/lib/cardio-chart'
import { readWorkout } from '@/lib/cardio-workout'
import { durationFromExercises } from '@/lib/planned-load'
import { useCategoryColors } from '@/lib/useCategoryColors'
import { P } from '@/components/dark-ui'

type Exercise = {
  sets: number
  reps: number
  repUnit?: string | null
  restTime?: number | null
  intensityType?: string
  intensityMin?: number | null
  intensityMax?: number | null
}

type Bar = { key: string; sec: number; h: number; color: string }

/** RPE 1..10 → 0..1, met een bodem zodat een licht blok zichtbaar blijft. */
const rpeHeight = (rpe: number) => Math.max(0.18, Math.min(1, rpe / 10))

/**
 * Hoogte van een krachtoefening. Een expliciet RPE-voorschrift wint; anders
 * een rustige middenwaarde, want een balk die doet alsof hij een voorschrift
 * kent terwijl er niets staat is misleidend.
 */
function exerciseHeight(e: Exercise): number {
  if (e.intensityType === 'RPE') {
    const lo = e.intensityMin ?? e.intensityMax
    const hi = e.intensityMax ?? e.intensityMin
    if (lo != null && hi != null) return rpeHeight((lo + hi) / 2)
  }
  return 0.55
}

export function WorkoutProfileStrip({
  cardioParams, exercises, category, height = 16,
}: {
  cardioParams?: unknown
  exercises?: Exercise[] | null
  /** Kleur voor kracht-balkjes; cardio kleurt op zijn eigen zones/RPE. */
  category?: string | null
  height?: number
}) {
  const catColors = useCategoryColors()

  let bars: Bar[] = []

  // readWorkout accepteert `unknown` en slikt zowel het blokken-formaat als het
  // oude platte formaat; ongeldige of lege params leveren null op.
  const workout = readWorkout(cardioParams)
  if (workout) {
    bars = cardioChartBars(workout.blocks).map(b => ({ key: b.key, sec: b.sec, h: b.h, color: b.color }))
  }
  if (bars.length === 0 && exercises?.length) {
    const kleur = catColors[category ?? 'STRENGTH'] ?? P.inkMuted
    bars = exercises.map((e, i) => ({
      key: `ex-${i}`,
      // Dezelfde schatting als de weekbalk gebruikt, dus een lange oefening
      // is hier ook breder.
      sec: Math.max(1, durationFromExercises([e])),
      h: exerciseHeight(e),
      color: kleur,
    }))
  }

  // Eén balk zegt niets over een profiel; dan is de tegel schoner zonder.
  if (bars.length < 2) return null

  const total = bars.reduce((s, b) => s + b.sec, 0) || 1

  return (
    <div
      className="flex items-end gap-px px-2 pb-1.5"
      style={{ height }}
      aria-hidden
    >
      {bars.map(b => (
        <span
          key={b.key}
          className="rounded-[1px]"
          style={{
            width: `${(b.sec / total) * 100}%`,
            height: `${Math.max(12, b.h * 100)}%`,
            background: b.color,
            opacity: 0.75,
            minWidth: 1,
          }}
        />
      ))}
    </div>
  )
}
