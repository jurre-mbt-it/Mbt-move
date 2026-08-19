import { describe, expect, it } from 'vitest'

import {
  matchLoggedPlanned,
  type LoggedCardio,
  type LoggedSession,
  type PlannedEntry,
} from '../planned-matching'

const ISO = '2026-08-19'

const plan = (extra: Partial<PlannedEntry> & { key: string }): PlannedEntry => ({
  iso: ISO,
  programId: null,
  category: 'CARDIO',
  activity: null,
  hasOwnLog: false,
  ...extra,
})

const cardio = (extra: Partial<LoggedCardio> = {}): LoggedCardio => ({
  iso: ISO,
  activity: 'RUNNING',
  itemId: null,
  ...extra,
})

const sessie = (extra: Partial<LoggedSession> = {}): LoggedSession => ({
  iso: ISO,
  programId: null,
  itemId: null,
  ...extra,
})

const geen = { sessions: [] as LoggedSession[], cardio: [] as LoggedCardio[] }

describe('matchLoggedPlanned', () => {
  it('vinkt een item af zodra er een log aan hangt (identiteit)', () => {
    const m = matchLoggedPlanned([plan({ key: 'a', hasOwnLog: true })], geen)
    expect(m.has('a')).toBe(true)
  })

  it('laat een gepland fietsritje staan als er die dag is hardgelopen', () => {
    // De klacht: gisteren-run vandaag gedaan, vandaag stond fietsen gepland.
    // De fietstraining moet zichtbaar blijven.
    const m = matchLoggedPlanned(
      [plan({ key: 'fiets', activity: 'CYCLING' })],
      { sessions: [], cardio: [cardio({ activity: 'RUNNING' })] },
    )
    expect(m.has('fiets')).toBe(false)
  })

  it('vinkt een gepland fietsritje wél af bij een gelogde fietsrit', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'fiets', activity: 'CYCLING' })],
      { sessions: [], cardio: [cardio({ activity: 'CYCLING' })] },
    )
    expect(m.has('fiets')).toBe(true)
  })

  it('negeert een cardio-log die al aan een ánder item hangt', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'vandaag', activity: 'RUNNING' })],
      { sessions: [], cardio: [cardio({ activity: 'RUNNING', itemId: 'gisteren' })] },
    )
    expect(m.has('vandaag')).toBe(false)
  })

  it('geeft de log aan het item dat de activiteit noemt, niet aan generieke cardio', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'algemeen' }), plan({ key: 'run', activity: 'RUNNING' })],
      { sessions: [], cardio: [cardio({ activity: 'RUNNING' })] },
    )
    expect(m.has('run')).toBe(true)
    expect(m.has('algemeen')).toBe(false)
  })

  it('laat generieke cardio wel matchen als er niets specifiekers is', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'algemeen' })],
      { sessions: [], cardio: [cardio({ activity: 'RUNNING' })] },
    )
    expect(m.has('algemeen')).toBe(true)
  })

  it('matcht één log op één item, niet op twee', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'a', activity: 'RUNNING' }), plan({ key: 'b', activity: 'RUNNING' })],
      { sessions: [], cardio: [cardio({ activity: 'RUNNING' })] },
    )
    expect([m.has('a'), m.has('b')].filter(Boolean)).toHaveLength(1)
  })

  it('houdt dagen uit elkaar', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'a', activity: 'RUNNING', iso: '2026-08-20' })],
      { sessions: [], cardio: [cardio({ activity: 'RUNNING', iso: ISO })] },
    )
    expect(m.has('a')).toBe(false)
  })

  it('matcht een programma-item op een sessie met hetzelfde programma', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'p', category: 'STRENGTH', programId: 'prog1' })],
      { sessions: [sessie({ programId: 'prog1' })], cardio: [] },
    )
    expect(m.has('p')).toBe(true)
  })

  it('matcht een programma-item niet op een sessie van een ander programma', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'p', category: 'STRENGTH', programId: 'prog1' })],
      { sessions: [sessie({ programId: 'prog2' })], cardio: [] },
    )
    expect(m.has('p')).toBe(false)
  })

  it('negeert een sessie die al aan een ander gepland item hangt', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'los', category: 'STRENGTH' })],
      { sessions: [sessie({ itemId: 'ander-item' })], cardio: [] },
    )
    expect(m.has('los')).toBe(false)
  })

  // De melding die deze module opleverde: gisteren stond hardlopen gepland,
  // vandaag fietsen. Ze deed de duurloop van gisteren pas vandaag. Daarna was
  // niet meer te zien dat er vandaag fietsen gepland stond.
  it('houdt het geplande fietsen van vandaag staan als gisteren-run vandaag is gedaan', () => {
    const gisteren = '2026-08-18'
    const m = matchLoggedPlanned(
      [
        plan({ key: 'run-gisteren', iso: gisteren, activity: 'RUNNING', hasOwnLog: true }),
        plan({ key: 'fiets-vandaag', iso: ISO, activity: 'CYCLING' }),
      ],
      {
        sessions: [],
        // Vandaag gelogd, maar afgevinkt tegen het geplande item van gisteren.
        cardio: [cardio({ iso: ISO, activity: 'RUNNING', itemId: 'run-gisteren' })],
      },
    )
    expect(m.has('run-gisteren')).toBe(true)
    expect(m.has('fiets-vandaag')).toBe(false)
  })

  // Zelfde verhaal, maar ze logde de duurloop los (niet vanuit de kalender).
  // Dan is er geen koppeling — de activiteit moet het verschil maken.
  it('houdt gepland fietsen staan bij een losgelogde duurloop op dezelfde dag', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'fiets-vandaag', activity: 'CYCLING' })],
      { sessions: [], cardio: [cardio({ activity: 'RUNNING', itemId: null })] },
    )
    expect(m.has('fiets-vandaag')).toBe(false)
  })

  it('vinkt een los krachtitem af met een losse sessie', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'los', category: 'STRENGTH' })],
      { sessions: [sessie()], cardio: [] },
    )
    expect(m.has('los')).toBe(true)
  })
})
