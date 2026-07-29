import { describe, expect, it } from 'vitest'

import { plannedVolume, type PlannedLoadInput } from '../planned-load'

/** Eén stap in blokken-vorm; `parseStructured` eist id, kind en een doel. */
function cardio(
  activity: string,
  stappen: { durationSec?: number; distanceM?: number }[],
) {
  return {
    version: 1,
    activity,
    blocks: stappen.map((s, i) => ({
      id: `s${i}`,
      kind: 'ACTIVE',
      ...s,
      target: { type: 'RPE', min: 4 },
    })),
  }
}

const workout = (extra: Partial<PlannedLoadInput>): PlannedLoadInput => ({
  kind: 'WORKOUT',
  quickCategory: 'CARDIO',
  ...extra,
})

describe('plannedVolume', () => {
  it('telt afstand-sessies en tijd-sessies bij elkaar op als kilometers', () => {
    // De kern van het probleem: een marathonweek schrijft de lange duurloop in
    // km voor en de intervalsessie in minuten. Alleen de expliciete km tonen
    // ("13 km") verzwijgt de helft van het hardloopwerk, dus de tijd-stappen
    // worden op het aangenomen tempo omgerekend en het getal krijgt een ~.
    const v = plannedVolume([
      workout({ quickActivity: 'RUNNING', cardioParams: cardio('RUNNING', [{ distanceM: 13_000 }]) }),
      // 39 min op 6:30/km = precies 6 km.
      workout({ quickActivity: 'RUNNING', cardioParams: cardio('RUNNING', [{ durationSec: 39 * 60 }]) }),
    ])

    const hardlopen = v.byActivity.find((a) => a.key === 'RUNNING')
    expect(hardlopen?.distanceM).toBe(19_000)
    expect(hardlopen?.distanceEstimated).toBe(true)
    expect(hardlopen?.count).toBe(2)
  })

  it('laat afstand weg voor een activiteit die alleen in tijd is gepland', () => {
    // Fietsen staat in dit plan overal in minuten. Er dan "~93 km" bij zetten
    // is een verzinsel van de app, niet iets wat de therapeut voorschreef.
    const v = plannedVolume([
      workout({ quickActivity: 'CYCLING', cardioParams: cardio('CYCLING', [{ durationSec: 60 * 60 }]) }),
    ])

    const fietsen = v.byActivity.find((a) => a.key === 'CYCLING')
    expect(fietsen?.distanceM).toBeNull()
    expect(fietsen?.durationSec).toBe(3600)
  })

  it('houdt activiteiten uit elkaar in plaats van km bij elkaar op te tellen', () => {
    const v = plannedVolume([
      workout({ quickActivity: 'RUNNING', cardioParams: cardio('RUNNING', [{ distanceM: 10_000 }]) }),
      workout({ quickActivity: 'CYCLING', cardioParams: cardio('CYCLING', [{ durationSec: 90 * 60 }]) }),
    ])

    expect(v.byActivity.map((a) => a.key).sort()).toEqual(['CYCLING', 'RUNNING'])
    // Zwaarste eerst, zodat de samenvatting met de hoofdmoot opent.
    expect(v.byActivity[0].key).toBe('CYCLING')
  })

  it('telt kracht in tijd en geeft die geen kilometers', () => {
    const v = plannedVolume([
      {
        kind: 'WORKOUT',
        quickCategory: 'STRENGTH',
        plannedDurationSec: 45 * 60,
        plannedRpe: 7,
      },
    ])

    const kracht = v.byActivity.find((a) => a.key === 'STRENGTH')
    expect(kracht?.distanceM).toBeNull()
    expect(kracht?.durationSec).toBe(2700)
    expect(v.load).toBe(45 * 7)
  })

  it('slaat rustdagen en notities over', () => {
    const v = plannedVolume([
      { kind: 'REST' },
      { kind: 'NOTE' },
      workout({ quickActivity: 'RUNNING', cardioParams: cardio('RUNNING', [{ durationSec: 30 * 60 }]) }),
    ])

    expect(v.itemCount).toBe(1)
    expect(v.byActivity).toHaveLength(1)
  })
})
