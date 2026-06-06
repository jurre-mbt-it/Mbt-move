/**
 * Seed-data voor de Testrapport-catalogus + batterijen.
 *
 * De 11 tests uit het MBT-template (Return to Sport · VKB) met hun assen,
 * zone-drempels en eenheden, plus één kant-en-klare batterij. Idempotent
 * geseed op `key` via scripts/seed-test-catalog.ts.
 */

type Kind = 'BILATERAL' | 'SINGLE'
type Metric = 'LSI' | 'RIGHT' | 'LEFT' | 'VALUE'

export type CatalogSeed = {
  key: string
  category: string
  categoryOrder: number
  name: string
  subtitle?: string | null
  source?: string | null
  kind: Kind
  metric: Metric
  unitPrimary?: string | null
  unitSecondary?: string | null
  plotUnit: string
  axisMin: number
  axisMax: number
  zoneOrangeMin: number
  zoneGreenMin: number
  higherIsBetter: boolean
  order: number
}

const KRACHT = 'KINVENT K-PULL · ISOMETRISCH'
const POWER = 'KINVENT K-DELTAS · FORCE PLATES'
const KLINISCH = 'KLINISCHE METINGEN'

export const TEST_CATALOG: CatalogSeed[] = [
  // ── 01 Kracht ────────────────────────────────────────────────────────────
  {
    key: 'quadriceps-iso', category: 'Kracht', categoryOrder: 1,
    name: 'Quadriceps', subtitle: 'isometrisch', source: KRACHT,
    kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'kg', unitSecondary: 'Nm/kg',
    plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90,
    higherIsBetter: true, order: 0,
  },
  {
    key: 'hamstrings-iso', category: 'Kracht', categoryOrder: 1,
    name: 'Hamstrings', subtitle: 'isometrisch', source: KRACHT,
    kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'kg', unitSecondary: 'Nm/kg',
    plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90,
    higherIsBetter: true, order: 1,
  },
  {
    key: 'hq-ratio', category: 'Kracht', categoryOrder: 1,
    name: 'H:Q ratio', subtitle: 'rechts (geopereerd)', source: KRACHT,
    kind: 'BILATERAL', metric: 'RIGHT', unitPrimary: null, unitSecondary: null,
    plotUnit: '', axisMin: 0.4, axisMax: 0.9, zoneOrangeMin: 0.5, zoneGreenMin: 0.6,
    higherIsBetter: true, order: 2,
  },
  {
    key: 'calf-iso', category: 'Kracht', categoryOrder: 1,
    name: 'Kuit', subtitle: 'plantairflexie isometrisch', source: KRACHT,
    kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'kg', unitSecondary: 'Nm/kg',
    plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90,
    higherIsBetter: true, order: 3,
  },

  // ── 02 Power ──────────────────────────────────────────────────────────────
  {
    key: 'cmj-height', category: 'Power', categoryOrder: 2,
    name: 'CMJ hoogte', subtitle: 'countermovement jump · dubbelbenig', source: POWER,
    kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'cm', unitSecondary: null,
    plotUnit: 'cm', axisMin: 15, axisMax: 40, zoneOrangeMin: 25, zoneGreenMin: 30,
    higherIsBetter: true, order: 0,
  },
  {
    key: 'single-leg-hop', category: 'Power', categoryOrder: 2,
    name: 'Single leg hop', subtitle: 'afstand', source: POWER,
    kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'cm', unitSecondary: null,
    plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90,
    higherIsBetter: true, order: 1,
  },
  {
    key: 'triple-hop', category: 'Power', categoryOrder: 2,
    name: 'Triple hop', subtitle: 'afstand', source: POWER,
    kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'cm', unitSecondary: null,
    plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90,
    higherIsBetter: true, order: 2,
  },
  {
    key: 'side-hop', category: 'Power', categoryOrder: 2,
    name: 'Side hop', subtitle: 'reps in 30 sec', source: POWER,
    kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'reps', unitSecondary: null,
    plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90,
    higherIsBetter: true, order: 3,
  },

  // ── 03 Mobiliteit & controle ──────────────────────────────────────────────
  {
    key: 'knee-to-wall', category: 'Mobiliteit', categoryOrder: 3,
    name: 'Knee-to-wall', subtitle: 'enkel dorsaalflexie', source: KLINISCH,
    kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'cm', unitSecondary: null,
    plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90,
    higherIsBetter: true, order: 0,
  },
  {
    key: 'single-leg-balance', category: 'Mobiliteit', categoryOrder: 3,
    name: 'Single leg balance', subtitle: 'ogen dicht · sec', source: KLINISCH,
    kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'sec', unitSecondary: null,
    plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90,
    higherIsBetter: true, order: 1,
  },
  {
    key: 'knee-flexion-rom', category: 'Mobiliteit', categoryOrder: 3,
    name: 'Knieflexie ROM', subtitle: 'rechts · extensie symmetrisch 0°', source: KLINISCH,
    kind: 'BILATERAL', metric: 'RIGHT', unitPrimary: '°', unitSecondary: null,
    plotUnit: '°', axisMin: 110, axisMax: 150, zoneOrangeMin: 130, zoneGreenMin: 135,
    higherIsBetter: true, order: 2,
  },
]

export type BatterySeed = { key: string; name: string; description?: string; itemKeys: string[] }

export const TEST_BATTERIES: BatterySeed[] = [
  {
    key: 'rts-vkb',
    name: 'Return to Sport · VKB',
    description: 'Volledige voortgangsmeting na VKB-reconstructie: kracht, power en mobiliteit.',
    itemKeys: TEST_CATALOG.map((t) => t.key),
  },
]
