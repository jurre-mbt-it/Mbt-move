import { describe, expect, it } from 'vitest'

import {
  matchLoggedPlanned,
  type LoggedCardio,
  type LoggedSession,
  type PlannedEntry,
} from '../planned-matching'

const ISO = '2026-08-19'

let n = 0
const plan = (extra: Partial<PlannedEntry> & { key: string }): PlannedEntry => ({
  iso: ISO,
  itemId: extra.key,
  programId: null,
  category: 'CARDIO',
  activity: null,
  hasOwnLog: false,
  ...extra,
})

const cardio = (extra: Partial<LoggedCardio> = {}): LoggedCardio => ({
  id: `c${n++}`,
  iso: ISO,
  activity: 'RUNNING',
  itemId: null,
  ...extra,
})

const sessie = (extra: Partial<LoggedSession> = {}): LoggedSession => ({
  id: `s${n++}`,
  iso: ISO,
  programId: null,
  itemId: null,
  ...extra,
})

const geen = { sessions: [] as LoggedSession[], cardio: [] as LoggedCardio[] }

describe('matchLoggedPlanned', () => {
  it('vinkt een item af zodra het zelf een log meldt (buiten het venster)', () => {
    const m = matchLoggedPlanned([plan({ key: 'a', hasOwnLog: true })], geen)
    expect(m.get('a')?.source).toBe('own')
  })

  it('vinkt een item af op de cardio-log die het item noemt', () => {
    const log = cardio({ itemId: 'a', activity: 'CYCLING' })
    const m = matchLoggedPlanned([plan({ key: 'a', activity: 'RUNNING' })], {
      sessions: [],
      cardio: [log],
    })
    // Identiteit wint van activiteit: de patiënt vinkte dit item zelf af.
    expect(m.get('a')).toEqual({ source: 'cardio', log })
  })

  it('vinkt een item af op de sessie die het item noemt', () => {
    const log = sessie({ itemId: 'a' })
    const m = matchLoggedPlanned([plan({ key: 'a', category: 'STRENGTH' })], {
      sessions: [log],
      cardio: [],
    })
    expect(m.get('a')).toEqual({ source: 'session', log })
  })

  it('laat een gepland fietsritje staan als er die dag is hardgelopen', () => {
    const m = matchLoggedPlanned([plan({ key: 'fiets', activity: 'CYCLING' })], {
      sessions: [],
      cardio: [cardio({ activity: 'RUNNING' })],
    })
    expect(m.has('fiets')).toBe(false)
  })

  it('vinkt een gepland fietsritje wél af bij een gelogde fietsrit', () => {
    const m = matchLoggedPlanned([plan({ key: 'fiets', activity: 'CYCLING' })], {
      sessions: [],
      cardio: [cardio({ activity: 'CYCLING' })],
    })
    expect(m.get('fiets')?.source).toBe('cardio')
  })

  it('negeert een cardio-log die al aan een ánder item hangt', () => {
    const m = matchLoggedPlanned([plan({ key: 'vandaag', activity: 'RUNNING' })], {
      sessions: [],
      cardio: [cardio({ activity: 'RUNNING', itemId: 'gisteren' })],
    })
    expect(m.has('vandaag')).toBe(false)
  })

  it('negeert een sessie die al aan een ander gepland item hangt', () => {
    const m = matchLoggedPlanned([plan({ key: 'los', category: 'STRENGTH' })], {
      sessions: [sessie({ itemId: 'ander-item' })],
      cardio: [],
    })
    expect(m.has('los')).toBe(false)
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
    const m = matchLoggedPlanned([plan({ key: 'algemeen' })], {
      sessions: [],
      cardio: [cardio({ activity: 'RUNNING' })],
    })
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
    const m = matchLoggedPlanned([plan({ key: 'a', activity: 'RUNNING', iso: '2026-08-20' })], {
      sessions: [],
      cardio: [cardio({ activity: 'RUNNING', iso: ISO })],
    })
    expect(m.has('a')).toBe(false)
  })

  it('matcht een programma-item op een sessie met hetzelfde programma', () => {
    const m = matchLoggedPlanned([plan({ key: 'p', category: 'STRENGTH', programId: 'prog1' })], {
      sessions: [sessie({ programId: 'prog1' })],
      cardio: [],
    })
    expect(m.get('p')?.source).toBe('session')
  })

  it('matcht een programma-item niet op een sessie van een ander programma', () => {
    const m = matchLoggedPlanned([plan({ key: 'p', category: 'STRENGTH', programId: 'prog1' })], {
      sessions: [sessie({ programId: 'prog2' })],
      cardio: [],
    })
    expect(m.has('p')).toBe(false)
  })

  it('vinkt een los krachtitem af met een losse sessie', () => {
    const m = matchLoggedPlanned([plan({ key: 'los', category: 'STRENGTH' })], {
      sessions: [sessie()],
      cardio: [],
    })
    expect(m.get('los')?.source).toBe('session')
  })

  it('laat een tegel zonder itemId (legacy) gewoon de heuristiek volgen', () => {
    const m = matchLoggedPlanned(
      [plan({ key: 'legacy', itemId: null, activity: 'RUNNING' })],
      { sessions: [], cardio: [cardio({ activity: 'RUNNING' })] },
    )
    expect(m.get('legacy')?.source).toBe('cardio')
  })

  // De melding die deze module opleverde: gisteren stond hardlopen gepland,
  // vandaag fietsen. Ze deed de duurloop van gisteren pas vandaag. Daarna was
  // niet meer te zien dat er vandaag fietsen gepland stond.
  it('houdt het geplande fietsen van vandaag staan als gisteren-run vandaag is gedaan', () => {
    const gisteren = '2026-08-18'
    const m = matchLoggedPlanned(
      [
        plan({ key: 'run-gisteren', iso: gisteren, activity: 'RUNNING' }),
        plan({ key: 'fiets-vandaag', iso: ISO, activity: 'CYCLING' }),
      ],
      {
        sessions: [],
        // Vandaag gelogd, maar afgevinkt tegen het geplande item van gisteren.
        cardio: [cardio({ iso: ISO, activity: 'RUNNING', itemId: 'run-gisteren' })],
      },
    )
    expect(m.get('run-gisteren')?.source).toBe('cardio')
    expect(m.has('fiets-vandaag')).toBe(false)
    // De uitvoerdag komt mee terug: daarop bouwen beide kalenders de
    // "verplaatst naar …"-markering en telt de week-voortgang.
    expect(m.get('run-gisteren')?.log?.iso).toBe(ISO)
    expect(m.get('run-gisteren')?.log?.iso).not.toBe(gisteren)
  })

  // Zelfde verhaal, maar ze logde de duurloop los (niet vanuit de kalender).
  // Dan is er geen koppeling — de activiteit moet het verschil maken.
  it('houdt gepland fietsen staan bij een losgelogde duurloop op dezelfde dag', () => {
    const m = matchLoggedPlanned([plan({ key: 'fiets-vandaag', activity: 'CYCLING' })], {
      sessions: [],
      cardio: [cardio({ activity: 'RUNNING', itemId: null })],
    })
    expect(m.has('fiets-vandaag')).toBe(false)
  })

  it('geeft de gematchte log terug zodat de therapeut-planner er status uit kan halen', () => {
    const log = { ...cardio({ activity: 'CYCLING' }), durationSec: 900 }
    const m = matchLoggedPlanned([plan({ key: 'fiets', activity: 'CYCLING' })], {
      sessions: [],
      cardio: [log],
    })
    const hit = m.get('fiets')
    expect(hit?.source).toBe('cardio')
    expect(hit?.log?.durationSec).toBe(900)
  })
})
