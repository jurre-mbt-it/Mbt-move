import { describe, expect, it, vi } from 'vitest'

import { ingestWearableData, type SyncPayload } from '../ingest'

type Db = Parameters<typeof ingestWearableData>[0]

/**
 * Minimale stub: een lege payload raakt alleen het profiel en de
 * connection-upsert. De overige modellen zijn lege objecten — raakt de code
 * ze onverwacht toch, dan klapt de test hard (TypeError) in plaats van stil
 * te slagen.
 */
function stubDb() {
  const upsert = vi.fn().mockResolvedValue({})
  const db = {
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ maxHeartRate: null, restingHeartRate: null, dateOfBirth: null }),
    },
    wearableConnection: { upsert },
    // Max-HR-vangnet kijkt ook bij een lege payload naar gemeten workouts.
    cardioLog: { findFirst: vi.fn().mockResolvedValue(null) },
    sleepEntry: {},
    vitalsEntry: {},
    stressEntry: {},
    exertionEntry: {},
  } as unknown as Db
  return { db, upsert }
}

const legePayload: SyncPayload = {
  device: { model: 'Apple Watch' },
  workouts: [],
  sleep: [],
  vitals: [],
  hrIntraday: [],
}

describe('ingestWearableData · connection-upsert', () => {
  it('zet `enabled` weer aan bij een actieve sync', async () => {
    // Regressietest voor de vast-uit-vlag: loskoppelen zette `enabled` op
    // false, maar oude app-builds (≤77) zetten hem bij opnieuw koppelen nooit
    // terug. Het toestel bleef gewoon syncen terwijl alle schermen "koppeling
    // staat uit" toonden en de readiness-cron de gebruiker oversloeg. Een
    // aankomende sync ís het bewijs dat de koppeling actief is (de app synct
    // alleen met een lokaal gezette koppelvlag), dus de ingest hoort de vlag
    // dan aan te zetten — net als de Strava-claim dat al doet.
    const { db, upsert } = stubDb()

    await ingestWearableData(db, 'user-1', legePayload)

    expect(upsert).toHaveBeenCalledTimes(1)
    const call = upsert.mock.calls[0][0] as {
      update: Record<string, unknown>
      create: Record<string, unknown>
    }
    expect(call.update.enabled).toBe(true)
    // De create-tak mag op de schema-default (true) vertrouwen, maar moet 'm
    // in elk geval niet op false zetten.
    expect(call.create.enabled).not.toBe(false)
  })
})

describe('ingestWearableData · source/provider-opties', () => {
  it('zonder opts blijft het HealthKit-gedrag exact gelijk (APPLE_HEALTH)', async () => {
    const { db, upsert } = stubDb()
    await ingestWearableData(db, 'user-1', legePayload)
    const call = upsert.mock.calls[0][0] as { where: { userId_provider: { provider: string } } }
    expect(call.where.userId_provider.provider).toBe('APPLE_HEALTH')
  })

  it('met opts landt de connection onder de opgegeven provider', async () => {
    // Polar hergebruikt deze pijplijn voor slaap/vitals/dag-HR; de bron mag
    // dan niet als Apple-koppeling geregistreerd worden.
    const { db, upsert } = stubDb()
    await ingestWearableData(db, 'user-1', legePayload, {
      source: 'POLAR',
      provider: 'POLAR',
      deviceModel: 'Polar',
    })
    const call = upsert.mock.calls[0][0] as {
      where: { userId_provider: { provider: string } }
      create: Record<string, unknown>
    }
    expect(call.where.userId_provider.provider).toBe('POLAR')
    expect(call.create.provider).toBe('POLAR')
    expect(call.create.deviceModel).toBe('Polar')
  })
})
