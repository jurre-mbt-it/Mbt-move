import { describe, it, expect } from 'vitest'
import {
  formatSessionForDossier,
  formatCardioForDossier,
  formatRepsPerSet,
  type DossierExercise,
} from '@/lib/dossier-report'

const DATE = new Date(2026, 7, 27, 14, 30) // 27-08-2026

function ex(partial: Partial<DossierExercise> & { name: string }): DossierExercise {
  return { sets: 3, reps: 10, ...partial }
}

describe('formatRepsPerSet', () => {
  it('comprimeert gelijke sets tot één getal', () => {
    expect(formatRepsPerSet([10, 10, 10], 10)).toBe('10')
  })

  it('toont elke set als ze verschillen', () => {
    expect(formatRepsPerSet([10, 8, 6], 10)).toBe('10-8-6')
  })

  it('laat niet-ingevulde sets aan het eind weg en markeert een gat middenin', () => {
    expect(formatRepsPerSet([10, 8, null], 10)).toBe('10-8')
    expect(formatRepsPerSet([10, null, 6], 10)).toBe('10-—-6')
  })

  it('valt terug op het vaste reps-veld', () => {
    expect(formatRepsPerSet(null, 12)).toBe('12')
    expect(formatRepsPerSet([], '12')).toBe('12')
    expect(formatRepsPerSet(null, null)).toBeNull()
  })
})

describe('formatSessionForDossier', () => {
  it('zet een eenvoudige sessie om naar dossiertekst', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      durationMinutes: 45,
      painLevel: 3,
      exertionLevel: 6,
      feelScore: 4,
      notes: 'Rustig opgebouwd.',
      exercises: [ex({ name: 'Squat', weightsPerSet: [40, 40, 40] })],
    })
    expect(txt).toBe(
      [
        'Behandeling 27-08-2026 · 45 min',
        '',
        '1. Squat: 3×10 reps @ 40 kg',
        '',
        'Pijn 3/10 · RPE 6/10 · Gevoel 4/5',
        'Notities: Rustig opgebouwd.',
      ].join('\n'),
    )
  })

  it('bevat nooit een naam of geboortedatum — alleen datum en inhoud', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      durationMinutes: 30,
      exercises: [ex({ name: 'Squat' })],
    })
    expect(txt.split('\n')[0]).toBe('Behandeling 27-08-2026 · 30 min')
  })

  it('toont per-set gewichten en per-set reps', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      exercises: [ex({ name: 'Deadlift', repsPerSet: [10, 8, 6], weightsPerSet: [40, 45, 50] })],
    })
    expect(txt).toContain('1. Deadlift: 3×10-8-6 reps @ 40-45-50 kg')
  })

  it('leest de live string-invoer van het behandelscherm', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      durationMinutes: '45',
      exercises: [ex({ name: 'Squat', sets: '3', reps: '10', weightsPerSet: ['12,5', '12,5', ''] })],
    })
    // Lege laatste set valt weg, de komma-invoer blijft komma-notatie.
    expect(txt).toContain('1. Squat: 3×10 reps @ 12,5 kg')
  })

  it('gebruikt de rep-eenheid van de oefening', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      exercises: [ex({ name: 'Wall sit', sets: 3, reps: 45, repUnit: 'sec' })],
    })
    expect(txt).toContain('1. Wall sit: 3×45 sec')
  })

  it('splitst warming-up en hoofddeel met doorlopende nummering', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      exercises: [
        ex({ name: 'Roeien', phase: 'WARMUP', sets: 1, reps: 5, repUnit: 'min' }),
        ex({ name: 'Squat', phase: 'MAIN' }),
        ex({ name: 'Lunge', phase: 'MAIN' }),
      ],
    })
    expect(txt).toContain('Warming-up\n1. Roeien: 1×5 min')
    expect(txt).toContain('Hoofddeel\n2. Squat')
    expect(txt).toContain('3. Lunge')
  })

  it('laat de kopjes weg als er geen warming-up is', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      exercises: [ex({ name: 'Squat', phase: 'MAIN' }), ex({ name: 'Lunge' })],
    })
    expect(txt).not.toContain('Hoofddeel')
    expect(txt).not.toContain('Warming-up')
  })

  it('zet superset, extra parameters, pijn en notitie op de oefeningsregel', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      exercises: [
        ex({
          name: 'Squat',
          supersetGroup: 'A',
          extraParams: [
            { label: 'Tempo', value: '3-1-1' },
            { label: 'Pauze', value: 90, unit: 'sec' },
            { label: 'Band kleur', value: '' },
          ],
          painLevel: 2,
          notes: 'Laatste set met band',
        }),
      ],
    })
    expect(txt).toContain('1. (A) Squat: 3×10 reps (Tempo 3-1-1 · Pauze 90 sec) · pijn 2/10')
    expect(txt).toContain('\n   Laatste set met band')
  })

  it('slaat een oefening zonder enige inhoud over', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      exercises: [
        { name: 'Leeg', sets: null, reps: null },
        ex({ name: 'Squat' }),
      ],
    })
    expect(txt).not.toContain('Leeg')
    expect(txt).toContain('1. Squat')
  })

  it('blijft leesbaar zonder oefeningen, duur of scores', () => {
    expect(formatSessionForDossier({ date: DATE, exercises: [] })).toBe('Behandeling 27-08-2026')
  })

  it('laat de scoreregel weg als er niets is ingevuld', () => {
    const txt = formatSessionForDossier({
      date: DATE,
      exercises: [ex({ name: 'Squat' })],
      notes: 'Alleen een notitie.',
    })
    expect(txt).not.toContain('RPE')
    expect(txt.endsWith('Notities: Alleen een notitie.')).toBe(true)
  })
})

describe('formatCardioForDossier', () => {
  it('zet een cardio-sessie om naar dossiertekst', () => {
    const txt = formatCardioForDossier({
      date: DATE,
      activity: 'RUNNING',
      protocol: 'INTERVALS',
      durationSec: 1920,
      distanceM: 6200,
      avgPaceSecPerKm: 310,
      avgHeartRate: 148,
      maxHeartRate: 171,
      zone: 3,
      rpe: 7,
      painLevel: 1,
      notes: 'Kuit voelde stug.',
    })
    expect(txt).toBe(
      [
        'Cardio 27-08-2026 · Hardlopen (Intervallen) · 32 min',
        'Afstand 6,20 km · tempo 5:10 /km · HR gem. 148 (max 171) · zone 3',
        'RPE 7/10 · Pijn 1/10',
        'Notities: Kuit voelde stug.',
      ].join('\n'),
    )
  })

  it('laat weg wat niet gemeten is', () => {
    const txt = formatCardioForDossier({
      date: DATE,
      activity: 'CYCLING',
      protocol: 'STEADY_STATE',
      durationSec: 1800,
    })
    expect(txt).toBe('Cardio 27-08-2026 · Fietsen (Steady State) · 30 min')
  })

  it('noemt de doelzone alleen als die van de gehaalde zone afwijkt', () => {
    const base = { date: DATE, activity: 'RUNNING', protocol: 'ZONE_TRAINING', durationSec: 600 }
    expect(formatCardioForDossier({ ...base, zone: 2, targetZone: 2 })).not.toContain('doelzone')
    expect(formatCardioForDossier({ ...base, zone: 3, targetZone: 2 })).toContain('doelzone 2')
  })
})
