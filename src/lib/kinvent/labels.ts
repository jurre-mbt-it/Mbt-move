/**
 * Leesbare namen voor wat Kinvent teruggeeft.
 *
 * De titel van een ingebouwde Kinvent-oefening is een i18n-sleutel
 * (`exercise_template_builtin_leg_knee_extension_60_text`), geen tekst. Eigen
 * oefeningen van de praktijk komen wél als gewone tekst. Hieronder de sleutels
 * die in onze praktijkdata voorkomen; de rest wordt netjes leesbaar gemaakt
 * en kan de therapeut in het rapport zelf hernoemen.
 *
 * Bewust in de Engelse vakterminologie, zoals de KINVENT-app en de literatuur
 * ze gebruiken (Jurre, 2026-09-14): "flight time" is voor een fysiotherapeut
 * een begrip, "vluchttijd" niet.
 */

const BEKEND: Record<string, string> = {
  exercise_template_builtin_leg_supine_hip_add_title: 'Hip adduction (supine)',
  exercise_template_builtin_leg_supine_abd_title: 'Hip abduction (supine)',
  exercise_template_builtin_leg_sitting_knee_extension_90_title: 'Knee extension 90° (seated)',
  exercise_template_builtin_leg_knee_90_flexion_text: 'Knee flexion 90°',
  exercise_template_builtin_leg_knee_45_flexion_text: 'Knee flexion 45°',
  exercise_template_builtin_leg_knee_flexion_30_text: 'Knee flexion 30°',
  exercise_template_builtin_leg_knee_flexion_30_endurance_text: 'Knee flexion 30° (endurance)',
  exercise_template_builtin_leg_knee_extension_60_text: 'Knee extension 60°',
  exercise_template_builtin_leg_knee_extension_60_endurance_text: 'Knee extension 60° (endurance)',
  exercise_template_builtin_leg_jump_analysis_cmj_title: 'CMJ',
  exercise_template_builtin_leg_jump_analysis_sj_title: 'Squat jump',
  exercise_template_builtin_leg_jump_analysis_drop_title: 'Drop jump',
  exercise_template_builtin_leg_jump_analysis_sj_dynamic_bw_title: 'Squat jump (dynamic)',
  exercise_template_builtin_leg_jump_analysis_sj_dynamic_bw_text: 'Squat jump (dynamic)',
  unipodal_counter_movement_jump_cmj: 'CMJ unilateral',
  unipodal_squat_jump_sj: 'Squat jump unilateral',
  unipodal_drop_jump_dj: 'Drop jump unilateral',
  multiple_jumps_activity_title: 'Multiple jumps',
  exercise_template_builtin_body_weight_calculation: 'Body weight',
  imtp_title: 'IMTP',
  exercise_template_builtin_aclrsi_text: 'ACL-RSI',
}

export function kinventLabel(title: string | null | undefined): string {
  if (!title) return 'Kinvent-meting'
  const bekend = BEKEND[title]
  if (bekend) return bekend
  // Eigen titels bevatten spaties of hoofdletters; sleutels niet.
  if (!/^[a-z0-9_]+$/.test(title)) return title
  const kaal = title
    .replace(/^exercise_template_builtin_/, '')
    .replace(/_(title|text)$/, '')
    .replace(/_activity$/, '')
  const woorden = kaal.split('_').filter(Boolean).join(' ')
  return woorden.charAt(0).toUpperCase() + woorden.slice(1)
}

const KRACHT = new Set(['METER', 'METER_ENDURANCE', 'MAX_EVALUATION', 'TOTAL_EVALUATION', 'NORDIC_HAMSTRING', 'ISOMETRIC'])

/** Categorie in het testrapport. */
export function kinventCategory(exerciseType: string | null | undefined): string {
  if (exerciseType === 'JUMP_ANALYSIS') return 'Sprong'
  if (exerciseType && KRACHT.has(exerciseType)) return 'Kracht'
  return 'Overig'
}

const APPARAAT: Record<string, string> = {
  MUSCLE_CONTROLLER: 'K-PUSH',
  LINK: 'K-PULL',
  KFORCE_GRIP: 'K-GRIP',
  SENS: 'K-MOVE',
  BUBBLE: 'K-BUBBLE',
  PLATES_LEFT: 'K-DELTAS',
  PLATES_RIGHT: 'K-DELTAS',
  HEXAS_LEFT: 'K-DELTAS',
  HEXAS_RIGHT: 'K-DELTAS',
  DELTAS_3D_LEFT: 'K-DELTAS 3D',
  DELTAS_3D_RIGHT: 'K-DELTAS 3D',
  KPOWER: 'K-POWER',
  'K-DELTA': 'K-DELTAS',
}

/** Families die altijd op de platen gedaan worden, ook zonder apparaat in de respons. */
const FAMILIE_APPARAAT: Record<string, string> = {
  TOTAL_EVALUATION: 'K-DELTAS',
  JUMP_ANALYSIS: 'K-DELTAS',
}

const SOORT: Record<string, string> = {
  METER: 'MAX',
  MAX_EVALUATION: 'MAX',
  METER_ENDURANCE: 'UITHOUDING',
  TOTAL_EVALUATION: 'IMTP',
  NORDIC_HAMSTRING: 'NORDIC',
  ISOMETRIC: 'ISOMETRISCH',
  JUMP_ANALYSIS: 'SPRONG',
}

/** Bronvermelding in het rapport, in de stijl die er al staat ("KINVENT K-PULL · ISOMETRISCH"). */
export function kinventSource(deviceType: string | null | undefined, exerciseType: string | null | undefined): string {
  const apparaat = (deviceType && APPARAAT[deviceType]) ?? (exerciseType && FAMILIE_APPARAAT[exerciseType]) ?? null
  const soort = exerciseType ? (SOORT[exerciseType] ?? exerciseType) : null
  return ['KINVENT', apparaat].filter(Boolean).join(' ') + (soort ? ` · ${soort}` : '')
}
