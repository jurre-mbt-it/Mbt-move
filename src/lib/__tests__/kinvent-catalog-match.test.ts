import { describe, it, expect } from 'vitest'
import { countPending, suggestCatalogItem, type CatalogusOptie } from '@/lib/kinvent/catalog-match'

/**
 * Een geïmporteerde meting werkt een rehab-criterium alleen bij als de
 * rapportregel aan een catalogustest hangt. Het voorstel welke test dat is
 * komt hiervandaan; de therapeut kan het altijd wijzigen.
 */
const catalogus: CatalogusOptie[] = [
  { id: 'quad', name: 'Quadriceps (isometrisch)', category: 'Kracht', kind: 'BILATERAL', unitPrimary: 'N' },
  { id: 'ham', name: 'Hamstrings (isometrisch)', category: 'Kracht', kind: 'BILATERAL', unitPrimary: 'N' },
  { id: 'kuit', name: 'Kuit (plantairflexie isometrisch)', category: 'Kracht', kind: 'BILATERAL', unitPrimary: 'N' },
  { id: 'cmj', name: 'CMJ hoogte (countermovement jump · dubbelbenig)', category: 'Power', kind: 'SINGLE', unitPrimary: 'cm' },
  { id: 'hop', name: 'Single leg hop (afstand)', category: 'Power', kind: 'BILATERAL', unitPrimary: 'cm' },
]

describe('suggestCatalogItem', () => {
  it('herkent quadriceps, hamstrings en kuit aan de Kinvent-titel', () => {
    expect(suggestCatalogItem({ kind: 'STRENGTH', exerciseType: 'METER', title: 'exercise_template_builtin_leg_knee_extension_60_text', bilateral: true }, catalogus)).toBe('quad')
    expect(suggestCatalogItem({ kind: 'STRENGTH', exerciseType: 'METER_ENDURANCE', title: 'exercise_template_builtin_leg_knee_90_flexion_text', bilateral: true }, catalogus)).toBe('ham')
    expect(suggestCatalogItem({ kind: 'STRENGTH', exerciseType: 'NORDIC_HAMSTRING', title: 'nordic_hamstring_title', bilateral: true }, catalogus)).toBe('ham')
    expect(suggestCatalogItem({ kind: 'STRENGTH', exerciseType: 'METER', title: 'Kuit plantairflexie zittend', bilateral: true }, catalogus)).toBe('kuit')
  })

  it('stelt alleen een bilaterale catalogustest voor bij een meting met twee zijden', () => {
    expect(suggestCatalogItem({ kind: 'STRENGTH', exerciseType: 'METER', title: 'exercise_template_builtin_leg_knee_extension_60_text', bilateral: false }, catalogus)).toBeNull()
  })

  it('koppelt een tweebenige CMJ aan de CMJ-hoogte en een eenbenige niet', () => {
    expect(suggestCatalogItem({ kind: 'JUMP', exerciseType: 'JUMP_ANALYSIS', title: 'exercise_template_builtin_leg_jump_analysis_cmj_title', bilateral: true, jumpType: 'CMJ' }, catalogus)).toBe('cmj')
    expect(suggestCatalogItem({ kind: 'JUMP', exerciseType: 'JUMP_ANALYSIS', title: 'unipodal_counter_movement_jump_cmj', bilateral: false, jumpType: 'CMJ' }, catalogus)).toBeNull()
    expect(suggestCatalogItem({ kind: 'JUMP', exerciseType: 'JUMP_ANALYSIS', title: 'exercise_template_builtin_leg_jump_analysis_drop_title', bilateral: true, jumpType: 'DROP' }, catalogus)).toBeNull()
  })

  it('geeft niets terug voor een oefening zonder catalogustest', () => {
    expect(suggestCatalogItem({ kind: 'STRENGTH', exerciseType: 'METER_ENDURANCE', title: 'exercise_template_builtin_leg_supine_hip_add_title', bilateral: true }, catalogus)).toBeNull()
  })
})

describe('countPending', () => {
  it('telt protocollen die nog niet in BASE staan', () => {
    expect(countPending([{ code: 'a' }, { code: 'b' }, { code: 'c' }], new Set(['b']))).toBe(2)
    expect(countPending([], new Set())).toBe(0)
  })
})
