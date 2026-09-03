import { describe, expect, it, vi } from 'vitest'
import { findDuplicate, overlapsAsDuplicate } from '../dedupe'

const at = (iso: string) => new Date(iso)

describe('overlapsAsDuplicate', () => {
  it('herkent dezelfde training uit twee bronnen', () => {
    expect(overlapsAsDuplicate(at('2026-08-06T07:49:00Z'), 18286, at('2026-08-06T07:49:30Z'), 18286)).toBe(true)
  })

  it('laat twee losse trainingen op één dag met rust', () => {
    expect(overlapsAsDuplicate(at('2026-08-06T07:00:00Z'), 3600, at('2026-08-06T18:00:00Z'), 3600)).toBe(false)
  })
})

/** Minimale prisma-stub: geeft de meegegeven rijen terug en legt de where vast. */
function db(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows)
  return { db: { cardioLog: { findMany } } as never, findMany }
}

describe('findDuplicate', () => {
  const nieuw = { completedAt: at('2026-08-06T07:49:00Z'), durationSec: 18286 }

  it('vindt een duplicaat van DEZELFDE bron', async () => {
    // Het geval uit de praktijk: drie HealthKit-records van één wandeling,
    // elk met een eigen UUID omdat een tweede app ze naast Apple's eigen
    // workout in Health schrijft. De oude check keek alleen naar ándere
    // bronnen en liet ze dus alle drie staan.
    const { db: prisma } = db([
      { id: 'a', externalId: 'uuid-1', source: 'APPLE_WATCH', completedAt: at('2026-08-06T07:49:10Z'), durationSec: 18286, ratedAt: null },
    ])
    const hit = await findDuplicate(prisma, 'p1', nieuw.completedAt, nieuw.durationSec)
    expect(hit?.id).toBe('a')
  })

  it('vindt nog steeds een duplicaat van een andere bron', async () => {
    const { db: prisma } = db([
      { id: 'b', externalId: '99', source: 'STRAVA', completedAt: at('2026-08-06T07:50:00Z'), durationSec: 18000, ratedAt: null },
    ])
    const hit = await findDuplicate(prisma, 'p1', nieuw.completedAt, nieuw.durationSec)
    expect(hit?.id).toBe('b')
  })

  it('laat handmatig gelogde sessies met rust', async () => {
    const { db: prisma, findMany } = db([])
    await findDuplicate(prisma, 'p1', nieuw.completedAt, nieuw.durationSec)
    expect(findMany.mock.calls[0][0].where.externalId).toEqual({ not: null })
  })

  it('vindt niets als er niets overlapt', async () => {
    const { db: prisma } = db([
      { id: 'c', externalId: 'x', source: 'APPLE_WATCH', completedAt: at('2026-08-06T18:00:00Z'), durationSec: 1800, ratedAt: null },
    ])
    expect(await findDuplicate(prisma, 'p1', nieuw.completedAt, nieuw.durationSec)).toBeNull()
  })
})
