import { describe, expect, it } from 'vitest'

import {
  polarActivityToVitals, polarContinuousHrToDay, polarRechargeToVitals, polarSleepToNight,
} from '../polar/sync'

describe('polar wellness-mappers', () => {
  it('slaap: hypnogram → segmenten met stage-map en nacht-wrap', () => {
    const night = polarSleepToNight({
      date: '2026-08-20',
      sleep_start_time: '2026-08-19T23:30:00+02:00',
      sleep_end_time: '2026-08-20T07:00:00+02:00',
      hypnogram: { '23:30': 3, '23:45': 4, '00:30': 1, '06:30': 0 },
    })
    expect(night).not.toBeNull()
    expect(night!.date).toBe('2026-08-20')
    expect(night!.externalId).toBe('polar:sleep:2026-08-20')
    const stages = night!.segments.map(s => s.stage)
    expect(stages).toEqual(['light', 'deep', 'rem', 'awake'])
    // wrap: 00:30 hoort bij 20 aug, 23:45 nog bij 19 aug
    expect(night!.segments[1].endAt).toBe(new Date('2026-08-20T00:30:00+02:00').toISOString())
    // laatste segment eindigt op sleep_end_time
    expect(night!.segments[3].endAt).toBe(new Date('2026-08-20T07:00:00+02:00').toISOString())
  })

  it('slaap zonder hypnogram → null', () => {
    expect(
      polarSleepToNight({
        date: '2026-08-20',
        sleep_start_time: '2026-08-19T23:30:00+02:00',
        sleep_end_time: '2026-08-20T07:00:00+02:00',
      }),
    ).toBeNull()
  })

  it('nightly recharge → vitals met RMSSD', () => {
    expect(
      polarRechargeToVitals({
        date: '2026-08-20', heart_rate_avg: 52, heart_rate_variability_avg: 41, breathing_rate_avg: 13.4,
      }),
    ).toEqual({ date: '2026-08-20', restingHeartRate: 52, hrv: 41, hrvType: 'RMSSD', respiratoryRate: 13.4 })
  })

  it('nightly recharge zonder meetwaarden → null', () => {
    expect(polarRechargeToVitals({ date: '2026-08-20' })).toBeNull()
  })

  it('daily activity → stappen + actieve/basale kcal', () => {
    expect(
      polarActivityToVitals({
        start_time: '2026-08-20T00:00:00', calories: 2500, active_calories: 700, steps: 8823,
      }),
    ).toEqual({ date: '2026-08-20', steps: 8823, activeEnergyKcal: 700, basalEnergyKcal: 1800 })
  })

  it('continue HR → histogram (5-bpm-bins, dt uit sample-afstand, workouts inbegrepen)', () => {
    const day = polarContinuousHrToDay({
      date: '2026-08-20',
      heart_rate_samples: [
        { heart_rate: 63, sample_time: '00:00:00' },
        { heart_rate: 64, sample_time: '00:05:00' },
        { heart_rate: 158, sample_time: '00:10:00' },
      ],
    })
    expect(day).toEqual({
      date: '2026-08-20',
      // stress blijft bewust Apple-only: rust-periodes zijn hier niet
      // betrouwbaar van workouts te scheiden, dus geen intraday-buckets.
      buckets: [],
      histogram: { '60': 600, '155': 300 }, // 63+64 → bin 60; laatste sample default 300s
    })
  })

  it('continue HR: leeg → null', () => {
    expect(polarContinuousHrToDay({ date: '2026-08-20', heart_rate_samples: [] })).toBeNull()
  })
})
