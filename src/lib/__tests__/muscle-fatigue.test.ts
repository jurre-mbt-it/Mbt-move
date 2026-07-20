import { describe, it, expect } from 'vitest'
import {
  computeMuscleFatigue,
  damageFactor,
  tauFor,
  MUSCLE_TAU_BASE,
  MUSCLE_REGIONS,
  type StrengthStimulus,
  type CardioStimulus,
} from '../muscle-fatigue'
import { collapseMuscleLoadsToRegions } from '../muscle-region-map'

const NOW = new Date('2026-07-20T12:00:00Z')

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000)
}

function pct(states: ReturnType<typeof computeMuscleFatigue>, muscle: string): number {
  const s = states.find((x) => x.muscle === muscle)
  if (!s) throw new Error(`no state for ${muscle}`)
  return s.recoveryPercent
}

// ── §1.6 worked calibration examples (±3 percentage points) ──────────────────

describe('calibration examples (§1.6)', () => {
  it('1. Heavy squat, just finished → ~20% fatigued', () => {
    const strength: StrengthStimulus[] = [
      {
        muscleLoads: { Quadriceps: 4 },
        sets: 4,
        reps: 5,
        repUnit: 'reps',
        rpe: 8,
        completedAt: hoursAgo(2),
        movementPattern: 'SQUAT',
      },
    ]
    const states = computeMuscleFatigue(strength, [], NOW)
    expect(pct(states, 'Quadriceps')).toBeGreaterThanOrEqual(17)
    expect(pct(states, 'Quadriceps')).toBeLessThanOrEqual(23)
    expect(states.find((s) => s.muscle === 'Quadriceps')!.status).toBe('fatigued')
  })

  it('2. Same squat, 48h later → ~74% recovering', () => {
    const strength: StrengthStimulus[] = [
      {
        muscleLoads: { Quadriceps: 4 },
        sets: 4,
        reps: 5,
        repUnit: 'reps',
        rpe: 8,
        completedAt: hoursAgo(48),
        movementPattern: 'SQUAT',
      },
    ]
    const states = computeMuscleFatigue(strength, [], NOW)
    expect(pct(states, 'Quadriceps')).toBeGreaterThanOrEqual(71)
    expect(pct(states, 'Quadriceps')).toBeLessThanOrEqual(77)
    expect(states.find((s) => s.muscle === 'Quadriceps')!.status).toBe('recovering')
  })

  it('3. Two hard hamstring sessions 3 days apart → stacks to ~16% fatigued', () => {
    const mk = (h: number): StrengthStimulus => ({
      muscleLoads: { Hamstrings: 4 },
      sets: 3,
      reps: 6,
      repUnit: 'reps',
      rpe: 8,
      completedAt: hoursAgo(h),
      movementPattern: 'HINGE',
    })
    const states = computeMuscleFatigue([mk(72), mk(0)], [], NOW)
    expect(pct(states, 'Hamstrings')).toBeGreaterThanOrEqual(13)
    expect(pct(states, 'Hamstrings')).toBeLessThanOrEqual(19)
  })

  it('4. Isometric wall-sit → barely registers, ~81% recovered', () => {
    const strength: StrengthStimulus[] = [
      {
        muscleLoads: { Quadriceps: 3 },
        sets: 3,
        reps: 45,
        repUnit: 'sec',
        rpe: 6,
        completedAt: hoursAgo(2),
        movementPattern: 'SQUAT',
      },
    ]
    const states = computeMuscleFatigue(strength, [], NOW)
    expect(pct(states, 'Quadriceps')).toBeGreaterThanOrEqual(78)
    expect(pct(states, 'Quadriceps')).toBeLessThanOrEqual(84)
  })

  it('5. Easy 30-min cycle, rpe 3 → negligible, ~97% recovered', () => {
    const cardio: CardioStimulus[] = [
      { activity: 'CYCLING', durationMin: 30, rpe: 3, completedAt: hoursAgo(2) },
    ]
    const states = computeMuscleFatigue([], cardio, NOW)
    expect(pct(states, 'Quadriceps')).toBeGreaterThanOrEqual(94)
    expect(pct(states, 'Quadriceps')).toBeLessThanOrEqual(100)
  })

  it('6. Hard 60-min run, rpe 7 → legs loaded meaningfully', () => {
    const cardio: CardioStimulus[] = [
      { activity: 'RUNNING', durationMin: 60, rpe: 7, completedAt: hoursAgo(2) },
    ]
    const states = computeMuscleFatigue([], cardio, NOW)
    // Onderbeen ~75% recovering
    expect(pct(states, 'Onderbeen')).toBeGreaterThanOrEqual(72)
    expect(pct(states, 'Onderbeen')).toBeLessThanOrEqual(78)
    // Quadriceps ~80% border
    expect(pct(states, 'Quadriceps')).toBeGreaterThanOrEqual(77)
    expect(pct(states, 'Quadriceps')).toBeLessThanOrEqual(83)
  })
})

// ── Structural / invariant tests ─────────────────────────────────────────────

describe('structure', () => {
  it('every region in MUSCLE_REGIONS has a τ_base (12/12)', () => {
    expect(MUSCLE_REGIONS.length).toBe(12)
    for (const region of MUSCLE_REGIONS) {
      expect(MUSCLE_TAU_BASE[region]).toBeGreaterThan(0)
    }
    expect(Object.keys(MUSCLE_TAU_BASE).length).toBe(12)
  })

  it('mobility / involvement-0 regions produce no state', () => {
    const strength: StrengthStimulus[] = [
      {
        muscleLoads: {}, // mobility resolves to {} upstream
        sets: 3,
        reps: 10,
        repUnit: 'reps',
        completedAt: hoursAgo(1),
        category: 'MOBILITY',
      },
      {
        muscleLoads: { Quadriceps: 0, Glutes: 3 },
        sets: 3,
        reps: 8,
        repUnit: 'reps',
        rpe: 8,
        completedAt: hoursAgo(1),
        movementPattern: 'SQUAT',
      },
    ]
    const states = computeMuscleFatigue(strength, [], NOW)
    expect(states.find((s) => s.muscle === 'Quadriceps')).toBeUndefined()
    expect(states.find((s) => s.muscle === 'Glutes')).toBeDefined()
  })

  it('monotonicity: larger Δt → higher recoveryPercent', () => {
    const mk = (h: number): StrengthStimulus => ({
      muscleLoads: { Quadriceps: 4 },
      sets: 4,
      reps: 5,
      repUnit: 'reps',
      rpe: 8,
      completedAt: hoursAgo(h),
      movementPattern: 'SQUAT',
    })
    const early = computeMuscleFatigue([mk(4)], [], NOW)
    const late = computeMuscleFatigue([mk(72)], [], NOW)
    expect(pct(late, 'Quadriceps')).toBeGreaterThan(pct(early, 'Quadriceps'))
  })

  it('damageFactor: ISO hold < concave patterns, clamped', () => {
    const iso = damageFactor({ movementPattern: 'SQUAT', repUnit: 'sec' })
    const squat = damageFactor({ movementPattern: 'SQUAT', repUnit: 'reps' })
    const hinge = damageFactor({ movementPattern: 'HINGE', repUnit: 'reps' })
    expect(iso).toBeLessThan(squat)
    expect(hinge).toBeGreaterThan(squat)
    expect(iso).toBeGreaterThanOrEqual(0.5)
    expect(hinge).toBeLessThanOrEqual(1.6)
  })

  it('tauFor stretches τ_base by damage', () => {
    expect(tauFor('Quadriceps', 1.15)).toBeCloseTo(41.2, 1)
    expect(tauFor('Hamstrings', 1.3)).toBeCloseTo(42.4, 1)
  })
})

describe('region collapse (§1.0 backfill)', () => {
  it('collapses 22 groups → regions with MAX per region', () => {
    // Biceps + Triceps both → Armen; max wins.
    const { regions } = collapseMuscleLoadsToRegions({ Biceps: 2, Triceps: 4, Borst: 3 })
    expect(regions.Armen).toBe(4)
    expect(regions.Borst).toBe(3)
  })

  it('is idempotent: collapse(collapse(x)) === collapse(x)', () => {
    const once = collapseMuscleLoadsToRegions({
      Quadriceps: 4,
      Adductoren: 3, // → Quadriceps (max keeps 4)
      Calves: 2, // → Onderbeen
      Lats: 5, // → Bovenrug
    }).regions
    const twice = collapseMuscleLoadsToRegions(once as Record<string, number>).regions
    expect(twice).toEqual(once)
    expect(once.Quadriceps).toBe(4)
    expect(once.Onderbeen).toBe(2)
    expect(once.Bovenrug).toBe(5)
  })

  it('surfaces unmapped keys and skips zero loads', () => {
    const { regions, unmapped } = collapseMuscleLoadsToRegions({
      Quadriceps: 0, // skipped
      'Ankle Capsule': 3, // not a muscle load → unmapped
      Glutes: 4,
    })
    expect(regions.Quadriceps).toBeUndefined()
    expect(regions.Glutes).toBe(4)
    expect(unmapped).toContain('Ankle Capsule')
  })
})
