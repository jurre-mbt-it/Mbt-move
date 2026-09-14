import { describe, it, expect } from 'vitest'
import { kinventCategory, kinventLabel, kinventSource } from '@/lib/kinvent/labels'

/**
 * Kinvent geeft als titel van een ingebouwde oefening een i18n-sleutel terug
 * (`exercise_template_builtin_leg_knee_extension_60_text`), geen leesbare
 * naam. Eigen oefeningen komen wél als gewone tekst.
 */
describe('kinventLabel', () => {
  it('vertaalt de ingebouwde sleutels van Kinvent', () => {
    expect(kinventLabel('exercise_template_builtin_leg_knee_extension_60_text')).toBe('Knie-extensie 60°')
    expect(kinventLabel('exercise_template_builtin_leg_supine_hip_add_title')).toBe('Heupadductie (rugligging)')
    expect(kinventLabel('unipodal_counter_movement_jump_cmj')).toBe('CMJ eenbenig')
    expect(kinventLabel('imtp_title')).toBe('IMTP')
    expect(kinventLabel('exercise_template_builtin_leg_jump_analysis_sj_dynamic_bw_title')).toBe('Squat jump (dynamisch)')
  })

  it('maakt van een onbekende sleutel leesbare tekst', () => {
    expect(kinventLabel('exercise_template_builtin_arm_shoulder_flexion_text')).toBe('Arm shoulder flexion')
  })

  it('laat een eigen titel met rust', () => {
    expect(kinventLabel('Single Leg Squat ISO')).toBe('Single Leg Squat ISO')
  })

  it('heeft een terugval zonder titel', () => {
    expect(kinventLabel(null)).toBe('Kinvent-meting')
  })
})

describe('kinventCategory', () => {
  it('zet krachttests en sprongen in hun eigen categorie', () => {
    expect(kinventCategory('METER')).toBe('Kracht')
    expect(kinventCategory('TOTAL_EVALUATION')).toBe('Kracht')
    expect(kinventCategory('NORDIC_HAMSTRING')).toBe('Kracht')
    expect(kinventCategory('JUMP_ANALYSIS')).toBe('Sprong')
    expect(kinventCategory('SENSORLESS')).toBe('Overig')
  })
})

describe('kinventSource', () => {
  it('noemt apparaat en testsoort zoals het rapport dat al doet', () => {
    expect(kinventSource('MUSCLE_CONTROLLER', 'METER_ENDURANCE')).toBe('KINVENT K-PUSH · UITHOUDING')
    expect(kinventSource('LINK', 'METER')).toBe('KINVENT K-PULL · MAX')
    expect(kinventSource(null, 'TOTAL_EVALUATION')).toBe('KINVENT K-DELTAS · IMTP')
    expect(kinventSource(null, 'NORDIC_HAMSTRING')).toBe('KINVENT · NORDIC')
  })
})
