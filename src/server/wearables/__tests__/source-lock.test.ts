import { describe, expect, it, vi } from 'vitest'

import {
  schrijfDagbelasting,
  schrijfSlaapnacht,
  schrijfVitals,
} from '../source-lock'

const DATUM = new Date('2026-09-11T00:00:00.000Z')

/** Prisma-fout zoals hij komt als de rij al bestaat. */
const p2002 = Object.assign(new Error('unique'), { code: 'P2002' })

function slaapDb(opts: { eigenRij?: boolean; rijVanAnder?: boolean } = {}) {
  const updateMany = vi.fn().mockResolvedValue({ count: opts.eigenRij ? 1 : 0 })
  const create = opts.rijVanAnder
    ? vi.fn().mockRejectedValue(p2002)
    : vi.fn().mockResolvedValue({})
  return { db: { sleepEntry: { updateMany, create } } as never, updateMany, create }
}

describe('slaapnacht · hele nacht, strikt eerste wint', () => {
  it('werkt een nacht van de eigen bron bij, met het bron-slot in de WHERE', async () => {
    const { db, updateMany, create } = slaapDb({ eigenRij: true })

    const uitkomst = await schrijfSlaapnacht(db, 'user-1', DATUM, 'APPLE_WATCH', { asleepMin: 400 } as never)

    expect(uitkomst).toBe('geschreven')
    expect(updateMany.mock.calls[0][0].where).toEqual({
      userId: 'user-1', date: DATUM, source: 'APPLE_WATCH',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('maakt de nacht aan als niemand hem heeft', async () => {
    const { db, create } = slaapDb()

    expect(await schrijfSlaapnacht(db, 'user-1', DATUM, 'POLAR', { asleepMin: 400 } as never)).toBe('geschreven')
    expect(create.mock.calls[0][0].data).toMatchObject({ userId: 'user-1', source: 'POLAR' })
  })

  it('laat een nacht van een ándere bron staan en gooit niet', async () => {
    // Dit is de kern van de afspraak: Polar overschrijft de nacht van de
    // Apple Watch niet, ook niet als hij later binnenkomt.
    const { db } = slaapDb({ rijVanAnder: true })

    expect(await schrijfSlaapnacht(db, 'user-1', DATUM, 'POLAR', { asleepMin: 400 } as never)).toBe('geblokkeerd')
  })
})

function vitalsDb(opts: { rijBestaat?: boolean; counts?: number[] } = {}) {
  const create = opts.rijBestaat ? vi.fn().mockRejectedValue(p2002) : vi.fn().mockResolvedValue({})
  const beurten = [...(opts.counts ?? [])]
  const updateMany = vi.fn().mockImplementation(() => Promise.resolve({ count: beurten.shift() ?? 0 }))
  return { db: { vitalsEntry: { create, updateMany } } as never, create, updateMany }
}

describe('vitals · twee groepen met een eigen eigenaar', () => {
  it('claimt bij het aanmaken alleen de groepen die deze bron levert', async () => {
    // Een middagsync met alleen stappen mag de nachtgroep niet op naam zetten.
    const { db, create } = vitalsDb()

    await schrijfVitals(db, 'user-1', DATUM, 'APPLE_WATCH', {}, { steps: 8000 })

    expect(create.mock.calls[0][0].data).toMatchObject({
      steps: 8000, source: null, daySource: 'APPLE_WATCH',
    })
  })

  it('laat de eigenaar zijn eigen daggroep bijwerken (stappen lopen op)', async () => {
    const { db, updateMany } = vitalsDb({ rijBestaat: true, counts: [1] })

    await schrijfVitals(db, 'user-1', DATUM, 'APPLE_WATCH', {}, { steps: 12000 })

    expect(updateMany.mock.calls[0][0]).toEqual({
      where: { userId: 'user-1', date: DATUM, daySource: 'APPLE_WATCH' },
      data: { steps: 12000 },
    })
  })

  it('vult bij een andere eigenaar alleen velden die nog leeg zijn', async () => {
    // Apple heeft de nacht, Polar heeft er ademhaling bij: die mag erbij,
    // maar de rust-HR van Apple blijft staan.
    const { db, updateMany } = vitalsDb({ rijBestaat: true, counts: [0, 0] })

    await schrijfVitals(db, 'user-1', DATUM, 'POLAR', { respiratoryRate: 13.4, restingHeartRate: 52 }, {})

    const vullers = updateMany.mock.calls.slice(2).map(c => c[0])
    expect(vullers).toEqual([
      { where: { userId: 'user-1', date: DATUM, respiratoryRate: null }, data: { respiratoryRate: 13.4 } },
      { where: { userId: 'user-1', date: DATUM, restingHeartRate: null }, data: { restingHeartRate: 52 } },
    ])
  })

  it('schrijft hrv en hrvType als paar, nooit los', async () => {
    // Een HRV zonder type is onbruikbaar: SDNN (Apple) en RMSSD (Polar) zijn
    // niet vergelijkbaar, en de readiness-baseline splitst er juist op.
    const { db, updateMany } = vitalsDb({ rijBestaat: true, counts: [0, 0] })

    await schrijfVitals(db, 'user-1', DATUM, 'POLAR', { hrv: 41, hrvType: 'RMSSD' }, {})

    const vuller = updateMany.mock.calls[2][0]
    expect(vuller).toEqual({
      where: { userId: 'user-1', date: DATUM, hrv: null },
      data: { hrv: 41, hrvType: 'RMSSD' },
    })
  })

  it('claimt een groep die nog van niemand is', async () => {
    const { db, updateMany } = vitalsDb({ rijBestaat: true, counts: [0, 1] })

    await schrijfVitals(db, 'user-1', DATUM, 'POLAR', { restingHeartRate: 52 }, {})

    expect(updateMany.mock.calls[1][0]).toEqual({
      where: { userId: 'user-1', date: DATUM, source: null },
      data: { restingHeartRate: 52, source: 'POLAR' },
    })
  })
})

describe('dagbelasting · hele dag, strikt eerste wint', () => {
  it('laat de dag van een andere bron staan', async () => {
    const db = {
      exertionEntry: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockRejectedValue(p2002),
      },
    } as never

    expect(await schrijfDagbelasting(db, 'user-1', DATUM, 'POLAR', { trimp: 120 } as never)).toBe('geblokkeerd')
  })
})
