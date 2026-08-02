import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  binnenOchtendVenster,
  raaktVandaag,
  maybeNotifyRecoveryOnSync,
  type MorningInsightDb,
} from '../morning-insight'

vi.mock('../notify', () => ({
  notifyRecovery: vi.fn().mockResolvedValue(undefined),
}))
import { notifyRecovery } from '../notify'

/** Amsterdam-tijdstip als echte instant. Zomertijd = UTC+2. */
function ams(dag: string, uur: number, minuut = 0): Date {
  const uu = String(uur - 2).padStart(2, '0')
  return new Date(`${dag}T${uu}:${String(minuut).padStart(2, '0')}:00.000Z`)
}

/**
 * Stub met alleen wat de happy path raakt. Modellen die de code niet hoort aan
 * te spreken blijven leeg, zodat onbedoeld gebruik hard klapt in plaats van
 * stil te slagen.
 */
function stubDb(over: Record<string, unknown> = {}) {
  return {
    readinessSnapshot: { findFirst: vi.fn().mockResolvedValue({ band: 'GREEN' }) },
    notification: { findMany: vi.fn().mockResolvedValue([]) },
    patientCareStatus: { findMany: vi.fn().mockResolvedValue([]) },
    patientTherapist: { findMany: vi.fn().mockResolvedValue([]) },
    ...over,
  } as unknown as MorningInsightDb
}

beforeEach(() => vi.mocked(notifyRecovery).mockClear())

describe('binnenOchtendVenster', () => {
  it('laat 07:00 tot 11:59 door', () => {
    expect(binnenOchtendVenster(ams('2026-08-02', 7))).toBe(true)
    expect(binnenOchtendVenster(ams('2026-08-02', 8, 35))).toBe(true)
    expect(binnenOchtendVenster(ams('2026-08-02', 11, 59))).toBe(true)
  })

  it('houdt de vroege ochtend tegen: daar is de cron nog van', () => {
    expect(binnenOchtendVenster(ams('2026-08-02', 6, 59))).toBe(false)
    expect(binnenOchtendVenster(ams('2026-08-02', 3))).toBe(false)
  })

  it('houdt vanaf het middaguur tegen', () => {
    expect(binnenOchtendVenster(ams('2026-08-02', 12))).toBe(false)
    expect(binnenOchtendVenster(ams('2026-08-02', 22))).toBe(false)
  })

  it('rekent in Amsterdamse tijd, niet in UTC', () => {
    // 06:30 UTC is 08:30 in Amsterdam (zomertijd): binnen het venster.
    expect(binnenOchtendVenster(new Date('2026-08-02T06:30:00.000Z'))).toBe(true)
    // 11:00 UTC is 13:00 in Amsterdam: erbuiten.
    expect(binnenOchtendVenster(new Date('2026-08-02T11:00:00.000Z'))).toBe(false)
  })
})

describe('raaktVandaag', () => {
  const nu = ams('2026-08-02', 8, 35)

  it('herkent de dag van vandaag', () => {
    expect(raaktVandaag([new Date('2026-08-01T22:00:00.000Z')], nu)).toBe(true)
  })

  it('negeert een backfill van eerdere dagen', () => {
    expect(
      raaktVandaag([new Date('2026-07-30T22:00:00.000Z'), new Date('2026-07-31T22:00:00.000Z')], nu),
    ).toBe(false)
  })

  it('is onwaar bij een lege sync', () => {
    expect(raaktVandaag([], nu)).toBe(false)
  })
})

describe('maybeNotifyRecoveryOnSync', () => {
  const vandaag = [new Date('2026-08-01T22:00:00.000Z')]
  const ochtend = ams('2026-08-02', 8, 35)

  it('stuurt de herstelmelding bij GREEN binnen het venster', async () => {
    const db = stubDb()
    const uitkomst = await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ochtend)
    expect(uitkomst).toBe('sent')
    expect(notifyRecovery).toHaveBeenCalledWith('u1', 'good')
  })

  it('stuurt de lage-herstelmelding bij RED', async () => {
    const db = stubDb({
      readinessSnapshot: { findFirst: vi.fn().mockResolvedValue({ band: 'RED' }) },
    })
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ochtend)).toBe('sent')
    expect(notifyRecovery).toHaveBeenCalledWith('u1', 'low')
  })

  it('zwijgt bij AMBER', async () => {
    const db = stubDb({
      readinessSnapshot: { findFirst: vi.fn().mockResolvedValue({ band: 'AMBER' }) },
    })
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ochtend)).toBe('geen-signaal')
    expect(notifyRecovery).not.toHaveBeenCalled()
  })

  it('zwijgt als er vandaag al een insight is gepusht', async () => {
    const db = stubDb({
      notification: { findMany: vi.fn().mockResolvedValue([{ data: { pushed: true } }]) },
    })
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ochtend)).toBe('al-verstuurd')
    expect(notifyRecovery).not.toHaveBeenCalled()
  })

  it('telt een door quiet hours onderdrukte melding niet als verstuurd', async () => {
    const db = stubDb({
      notification: { findMany: vi.fn().mockResolvedValue([{ data: { pushed: false } }]) },
    })
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ochtend)).toBe('sent')
  })

  it('zwijgt buiten het ochtendvenster', async () => {
    const db = stubDb()
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ams('2026-08-02', 13))).toBe(
      'buiten-venster',
    )
    expect(notifyRecovery).not.toHaveBeenCalled()
  })

  it('zwijgt als de sync vandaag niet raakt', async () => {
    const db = stubDb()
    const gisteren = [new Date('2026-07-31T22:00:00.000Z')]
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', gisteren, ochtend)).toBe('niet-vandaag')
    expect(notifyRecovery).not.toHaveBeenCalled()
  })

  it('zwijgt als elke behandelaar de patiënt heeft afgesloten', async () => {
    const db = stubDb({
      patientCareStatus: {
        findMany: vi.fn().mockResolvedValue([{ practiceId: 'p1', coachId: null }]),
      },
      patientTherapist: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ therapist: { id: 't1', role: 'THERAPIST', practiceId: 'p1' } }]),
      },
    })
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ochtend)).toBe('uitbehandeld')
    expect(notifyRecovery).not.toHaveBeenCalled()
  })

  it('stuurt wél bij een markering zonder actieve behandelaars', async () => {
    // Koper via shop.activateProgram: markering, maar niemand behandelt hem.
    const db = stubDb({
      patientCareStatus: {
        findMany: vi.fn().mockResolvedValue([{ practiceId: 'p1', coachId: null }]),
      },
      patientTherapist: { findMany: vi.fn().mockResolvedValue([]) },
    })
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ochtend)).toBe('sent')
  })

  it('laat een sync nooit klappen op een push-fout', async () => {
    vi.mocked(notifyRecovery).mockRejectedValueOnce(new Error('expo down'))
    const db = stubDb()
    expect(await maybeNotifyRecoveryOnSync(db, 'u1', vandaag, ochtend)).toBe('fout')
  })
})
