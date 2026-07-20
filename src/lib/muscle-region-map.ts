/**
 * 22-groep → 12-regio migratiemap (docs/plan-muscle-fatigue-v2.md §1.0).
 *
 * Eén bron voor zowel de data-backfill (scripts/migrate-muscle-loads-to-regions.ts)
 * als het seeden van verse DB's (prisma/seed.ts). Waar meerdere oude spieren op
 * één regio vallen, wordt de regio-belasting = MAX van de leden.
 *
 * Sleutels worden case-/spatie-ongevoelig genormaliseerd, zodat historische
 * varianten (bv. "Hip flexors" vs "Hip Flexors", "ErectorSpinae" vs
 * "Erector Spinae") allemaal landen.
 */

import { MUSCLE_REGIONS, type MuscleRegion } from './exercise-constants'

function norm(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '')
}

// genormaliseerde oude-spiernaam → regio
const RAW_MAP: Record<string, MuscleRegion> = {
  // benen — groot
  quadriceps: 'Quadriceps',
  adductoren: 'Quadriceps',
  adductors: 'Quadriceps',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  gluteusmaximus: 'Glutes',
  gluteusmedius: 'Glutes',
  abductoren: 'Glutes',
  hipexternalrotators: 'Glutes',
  piriformis: 'Glutes',
  // onderbeen
  calves: 'Onderbeen',
  gastrocnemius: 'Onderbeen',
  soleus: 'Onderbeen',
  tibialisanterior: 'Onderbeen',
  achillespees: 'Onderbeen',
  // voeten
  intriniekevoetspieren: 'Voeten',
  intrinsiekevoetspieren: 'Voeten',
  footintrinsics: 'Voeten',
  plantarfascia: 'Voeten',
  // core
  core: 'Core',
  hipflexors: 'Core',
  iliacus: 'Core',
  psoas: 'Core',
  obliques: 'Core',
  rectusabdominis: 'Core',
  transversusabdominis: 'Core',
  serratusanterior: 'Core',
  // onderrug
  onderrug: 'Onderrug',
  erectorspinae: 'Onderrug',
  quadratuslumborum: 'Onderrug',
  // bovenrug
  bovenrug: 'Bovenrug',
  lats: 'Bovenrug',
  latissimus: 'Bovenrug',
  latissimusdorsi: 'Bovenrug',
  rhomboids: 'Bovenrug',
  trapezius: 'Bovenrug',
  teresmajor: 'Bovenrug',
  thoracicextensors: 'Bovenrug',
  // borst
  borst: 'Borst',
  pectoralis: 'Borst',
  pectoralismajor: 'Borst',
  // schouders
  schouders: 'Schouders',
  schoudersanterieur: 'Schouders',
  schouderslateraal: 'Schouders',
  schoudersposterieur: 'Schouders',
  anteriordeltoid: 'Schouders',
  posteriordeltoid: 'Schouders',
  rotatorcuff: 'Schouders',
  // armen
  armen: 'Armen',
  biceps: 'Armen',
  triceps: 'Armen',
  onderarmen: 'Armen',
  forearms: 'Armen',
  wristextensors: 'Armen',
  wristflexors: 'Armen',
  // nek
  nek: 'Nek',
  diepehalsflexoren: 'Nek',
  cervicalextensors: 'Nek',
  scalene: 'Nek',
  suboccipitalen: 'Nek',
}

// identiteit voor de 12 regio's zelf (voor de zekerheid)
for (const r of MUSCLE_REGIONS) RAW_MAP[norm(r)] = r

/**
 * Map één oude spiernaam naar een regio, of null als hij niet herkend wordt
 * (bv. gewrichtskapsels of test-doelweefsels die geen spierbelasting zijn).
 */
export function regionForMuscle(name: string): MuscleRegion | null {
  return RAW_MAP[norm(name)] ?? null
}

/**
 * Collapse een muscleLoads-record (22 groepen) naar de 12 regio's, waarbij
 * per regio de MAX van de leden wordt genomen. Onbekende sleutels landen in
 * `unmapped` voor audit/logging.
 */
export function collapseMuscleLoadsToRegions(loads: Record<string, number>): {
  regions: Partial<Record<MuscleRegion, number>>
  unmapped: string[]
} {
  const regions: Partial<Record<MuscleRegion, number>> = {}
  const unmapped: string[] = []
  for (const [muscle, load] of Object.entries(loads)) {
    if (!(load > 0)) continue
    const region = regionForMuscle(muscle)
    if (!region) {
      unmapped.push(muscle)
      continue
    }
    regions[region] = Math.max(regions[region] ?? 0, load)
  }
  return { regions, unmapped }
}
