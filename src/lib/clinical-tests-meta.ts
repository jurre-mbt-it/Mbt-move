/**
 * UI-metadata voor de Clinical Tests library — Nederlandstalige labels en
 * kleur-tinten per construct en body-region. Server-side enums blijven Engels
 * voor stabiliteit; deze tabellen vertalen alleen voor weergave.
 */
import { P } from '@/components/dark-ui'

export type ClinicalTestConstruct =
  | 'STRENGTH'
  | 'ROM'
  | 'POWER'
  | 'BALANCE'
  | 'ENDURANCE'
  | 'PROVOCATION'
  | 'NEURODYNAMIC'
  | 'MOVEMENT_QUALITY'
  | 'SENSORIMOTOR'
  | 'FUNCTIONAL'
  | 'SPORT_SPECIFIC'
  | 'SENSIBILITY'
  | 'RESPIRATORY'
  | 'EFFUSION'
  | 'DECISION_RULE'

export const CONSTRUCT_LABEL: Record<ClinicalTestConstruct, string> = {
  STRENGTH: 'Kracht',
  ROM: 'Mobiliteit',
  POWER: 'Power',
  BALANCE: 'Balans',
  ENDURANCE: 'Uithoudingsvermogen',
  PROVOCATION: 'Provocatie',
  NEURODYNAMIC: 'Neurodynamiek',
  MOVEMENT_QUALITY: 'Bewegingskwaliteit',
  SENSORIMOTOR: 'Sensomotoriek',
  FUNCTIONAL: 'Functioneel',
  SPORT_SPECIFIC: 'Sportspecifiek',
  SENSIBILITY: 'Sensibiliteit',
  RESPIRATORY: 'Ademhaling',
  EFFUSION: 'Hydrops',
  DECISION_RULE: 'Beslisregel',
}

export const CONSTRUCT_COLOR: Record<ClinicalTestConstruct, string> = {
  STRENGTH: P.lime,
  ROM: P.ice,
  POWER: P.gold,
  BALANCE: P.purple,
  ENDURANCE: P.limeMid,
  PROVOCATION: P.danger,
  NEURODYNAMIC: P.orange,
  MOVEMENT_QUALITY: P.brand,
  SENSORIMOTOR: P.purple,
  FUNCTIONAL: P.ice,
  SPORT_SPECIFIC: P.lime,
  SENSIBILITY: P.ice,
  RESPIRATORY: P.gold,
  EFFUSION: P.danger,
  DECISION_RULE: P.inkMuted,
}

export const CONSTRUCTS: ClinicalTestConstruct[] = [
  'STRENGTH',
  'ROM',
  'POWER',
  'BALANCE',
  'ENDURANCE',
  'PROVOCATION',
  'NEURODYNAMIC',
  'MOVEMENT_QUALITY',
  'SENSORIMOTOR',
  'FUNCTIONAL',
  'SPORT_SPECIFIC',
  'SENSIBILITY',
  'RESPIRATORY',
  'EFFUSION',
  'DECISION_RULE',
]

export type ClinicalTestBodyRegion =
  | 'KNEE'
  | 'SHOULDER'
  | 'BACK'
  | 'ANKLE'
  | 'HIP'
  | 'FULL_BODY'
  | 'CERVICAL'
  | 'THORACIC'
  | 'LUMBAR'
  | 'ELBOW'
  | 'WRIST'
  | 'FOOT'

export const BODY_REGION_LABEL: Record<ClinicalTestBodyRegion, string> = {
  KNEE: 'Knie',
  SHOULDER: 'Schouder',
  BACK: 'Rug',
  ANKLE: 'Enkel',
  HIP: 'Heup',
  FULL_BODY: 'Full body',
  CERVICAL: 'Cervicaal',
  THORACIC: 'Thoracaal',
  LUMBAR: 'Lumbaal',
  ELBOW: 'Elleboog',
  WRIST: 'Pols',
  FOOT: 'Voet',
}

export const BODY_REGIONS: ClinicalTestBodyRegion[] = [
  'KNEE',
  'HIP',
  'ANKLE',
  'FOOT',
  'SHOULDER',
  'ELBOW',
  'WRIST',
  'CERVICAL',
  'THORACIC',
  'LUMBAR',
  'BACK',
  'FULL_BODY',
]

/** Sub-regio-tags die buiten de Prisma BodyRegion-enum vallen. */
export const SUB_REGION_TAGS = ['SI_JOINT', 'GROIN', 'CORE'] as const
export type SubRegionTag = (typeof SUB_REGION_TAGS)[number]
export const SUB_REGION_LABEL: Record<SubRegionTag, string> = {
  SI_JOINT: 'SI-gewricht',
  GROIN: 'Lies',
  CORE: 'Core',
}

export function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
}

/** Fase-codes 0–5 → korte humane omschrijving (consistent met seed-data).
 *  Fase 0 = pre-operatieve rehab (Pre-OK), bv. weken voor ACLR/TKA/THA.
 *  Pure screening-tests (DVJ/LESS/FMS) hebben geen fase — hun screening-context
 *  staat in applicableTo (bv. "team-screening", "ACL preventie/RTS"). */
export const PHASE_LABEL: Record<number, string> = {
  0: 'Pre-OK',
  1: 'Acuut / bescherming',
  2: 'ROM / basisfunctie',
  3: 'Kracht / neuromusc.',
  4: 'Running / sport-load',
  5: 'RTS / performance',
}
