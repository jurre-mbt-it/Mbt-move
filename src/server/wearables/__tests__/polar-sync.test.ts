import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import {
  buildSeriesFromPolarSamples, mapPolarSport, parseIsoDuration, polarStartToDate, syncPolarExercises,
} from '../polar/sync'
import { encryptPolarToken } from '../polar/config'

describe('polar/sync mappers', () => {
  it('parseIsoDuration', () => {
    expect(parseIsoDuration('PT2H44M45S')).toBe(2 * 3600 + 44 * 60 + 45)
    expect(parseIsoDuration('PT30M')).toBe(1800)
    expect(parseIsoDuration('PT4.5S')).toBe(5) // afronden op hele seconden
    expect(parseIsoDuration('kapot')).toBeNull()
    expect(parseIsoDuration(undefined)).toBeNull()
  })

  it('mapPolarSport: detailed_sport_info wint, substrings dekken de varianten', () => {
    expect(mapPolarSport('TREADMILL_RUNNING', 'RUNNING')).toBe('RUNNING')
    expect(mapPolarSport('INDOOR_CYCLING', undefined)).toBe('CYCLING')
    expect(mapPolarSport('NORDIC_WALKING', undefined)).toBe('WALKING')
    expect(mapPolarSport('OPEN_WATER_SWIMMING', undefined)).toBe('SWIMMING')
    expect(mapPolarSport('INDOOR_ROWING', undefined)).toBe('ROWING')
    expect(mapPolarSport('ELLIPTICAL', undefined)).toBe('CROSSTRAINER')
    expect(mapPolarSport('STAIR_CLIMBING', undefined)).toBe('STAIRCLIMBER')
    expect(mapPolarSport('STRENGTH_TRAINING', undefined)).toBe('OTHER')
    expect(mapPolarSport(undefined, 'RUNNING')).toBe('RUNNING')
    expect(mapPolarSport(undefined, undefined)).toBe('OTHER')
  })

  it('polarStartToDate: lokale tijd + offset in minuten → UTC-instant', () => {
    // 10:40 lokaal op +180 min = 07:40Z
    expect(polarStartToDate('2026-08-13T10:40:02', 180).toISOString()).toBe('2026-08-13T07:40:02.000Z')
    // zonder offset: als UTC behandelen
    expect(polarStartToDate('2026-08-13T10:40:02', undefined).toISOString()).toBe('2026-08-13T10:40:02.000Z')
    // string met eigen offset wint
    expect(polarStartToDate('2026-08-13T10:40:02+02:00', 180).toISOString()).toBe('2026-08-13T08:40:02.000Z')
  })

  it('buildSeriesFromPolarSamples: HR (type 0) + snelheid (type 1, km/h→m/s) per minuut gebucket', () => {
    const hr = Array.from({ length: 24 }, (_, i) => 100 + i).join(',') // 24 samples à 5s = 2 min
    const spd = Array.from({ length: 24 }, () => '10.8').join(',') // 10.8 km/h = 3 m/s
    const series = buildSeriesFromPolarSamples(
      [
        { 'recording-rate': 5, 'sample-type': '0', data: hr },
        { 'recording-rate': 5, 'sample-type': '1', data: spd },
      ],
      120,
    )
    expect(series).toHaveLength(2)
    // eerste minuut: samples 100..111 → gemiddelde 105.5 → afgerond 106
    expect(series![0]).toEqual({ t: 0, hr: 106, spd: 3 })
    expect(series![1].hr).toBe(118)
    expect(series![1].spd).toBe(3)
  })

  it('buildSeriesFromPolarSamples: null-gaten en <2 HR-punten → undefined', () => {
    expect(buildSeriesFromPolarSamples([{ 'recording-rate': 60, 'sample-type': '0', data: '100' }], 60)).toBeUndefined()
    expect(buildSeriesFromPolarSamples(undefined, 600)).toBeUndefined()
    expect(
      buildSeriesFromPolarSamples([{ 'recording-rate': 5, 'sample-type': '1', data: '10,10,10' }], 15),
    ).toBeUndefined()
  })
})

describe('syncPolarExercises', () => {
  beforeEach(() => {
    process.env.POLAR_CLIENT_ID = 'cid'
    process.env.POLAR_CLIENT_SECRET = 'csecret'
    process.env.NEXT_PUBLIC_APP_URL = 'https://getbase.coach'
  })
  afterEach(() => {
    delete process.env.POLAR_CLIENT_ID
    delete process.env.POLAR_CLIENT_SECRET
    vi.unstubAllGlobals()
  })

  function stubDb(overrides?: { connection?: Record<string, unknown> }) {
    const connection = {
      userId: 'user-1',
      polarUserId: '627139',
      accessToken: encryptPolarToken('tok'),
      expiresAt: new Date(Date.now() + 86_400_000),
      needsReauth: false,
      ...overrides?.connection,
    }
    const db = {
      polarConnection: {
        findUnique: vi.fn().mockResolvedValue(connection),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ maxHeartRate: 190, restingHeartRate: 50, dateOfBirth: null }),
      },
      cardioLog: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
      },
    }
    return db
  }

  it('schrijft een exercise als CardioLog met source POLAR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: '2AC312F',
              start_time: '2026-08-20T18:00:00',
              start_time_utc_offset: 120,
              duration: 'PT30M',
              calories: 320,
              distance: 5000,
              heart_rate: { average: 140, maximum: 168 },
              sport: 'RUNNING',
              detailed_sport_info: 'RUNNING',
            },
          ]),
          { status: 200 },
        ),
      ),
    )
    const db = stubDb()
    const synced = await syncPolarExercises(db as never, 'user-1')

    expect(synced).toBe(1)
    const created = db.cardioLog.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(created.data.externalId).toBe('polar:2AC312F')
    expect(created.data.source).toBe('POLAR')
    expect(created.data.durationSec).toBe(1800)
    expect(created.data.activity).toBe('RUNNING')
    expect((created.data.completedAt as Date).toISOString()).toBe('2026-08-20T16:00:00.000Z')
    expect(created.data.rpe).not.toBeNull()
    expect(db.polarConnection.update).toHaveBeenCalled()
  })

  it('zet needsReauth bij een 401 van Polar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nee', { status: 401 })))
    const db = stubDb()
    await expect(syncPolarExercises(db as never, 'user-1')).rejects.toThrow('polar_needs_reauth')
    expect(db.polarConnection.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { needsReauth: true },
    })
  })
})
