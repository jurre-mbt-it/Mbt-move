/**
 * Seed extra mobility & strength oefeningen op prod:
 *   - ~36 mobility drills uit Kelly Starrett "Becoming a Supple Leopard" (2015)
 *   - ~10 protocol-specifieke revalidatie oefeningen (Alfredson, Pallof, bird dog, etc.)
 *
 * Idempotent: upsert op name (case-insensitive).
 * isPublic = true, createdBy = eerste ADMIN.
 */
import { PrismaClient, UserRole } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

type Seed = {
  name: string
  description: string
  category: 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'
  bodyRegion: string[]
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  loadType: 'BODYWEIGHT' | 'WEIGHTED' | 'MACHINE' | 'BAND'
  isUnilateral: boolean
  movementPattern: string | null
  tags: string[]
  instructions: string[]
  muscleLoads: Record<string, number>
}

// ─── Kelly Starrett — Becoming a Supple Leopard (2015) ─────────────────────

const SUPPLE_LEOPARD: Seed[] = [
  // AREA 1 — Jaw, Head, Neck
  {
    name: 'Jaw Mob',
    description: 'Self-massage van de masseter en TMJ met lacrosse ball of duimen; bij kaakklemmen en spanningshoofdpijn.',
    category: 'MOBILITY', bodyRegion: ['CERVICAL'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'tmj', 'kaak', 'hoofdpijn'],
    instructions: [
      'Plaats lacrosse ball of vinger op de masseter (tussen oor en kaakhoek)',
      'Druk drukgevoelige plek stevig in',
      'Open en sluit de mond langzaam 10-15x',
      'Werk 1-2 min per zijde',
    ],
    muscleLoads: { Masseter: 3 },
  },
  {
    name: 'Posterior Neck Mob',
    description: 'Mobilisatie van suboccipitalen en cervicale extensoren met lacrosse ball tegen de muur.',
    category: 'MOBILITY', bodyRegion: ['CERVICAL'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'suboccipitaal', 'nek', 'hoofdpijn'],
    instructions: [
      'Lacrosse ball tegen muur, ter hoogte basis schedel',
      'Leun in en voel de drukgevoelige plek',
      'Knik hoofd langzaam ja-nee-ja patroon',
      '1-2 min totaal',
    ],
    muscleLoads: { Suboccipitalen: 4, 'Cervical Extensors': 3 },
  },

  // AREA 2 — Upper Back / T-spine
  {
    name: 'T-Spine Roller Extension Smash',
    description: 'Thoracale extensie-mobilisatie op foam roller — foundation drill voor bureau-houding en overhead-mobiliteit.',
    category: 'MOBILITY', bodyRegion: ['THORACIC', 'BACK'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'thoracic', 'foam-roll', 'bureau-houding'],
    instructions: [
      'Ga ruglings op foam roller ter hoogte thoracale wervels',
      'Handen achter hoofd, ellebogen samen',
      'Laat het hoofd richting de grond zakken — thoracale extensie',
      'Schuif de roller 2-3 cm en herhaal door de T-spine segmenten',
      '10 contracties per segment',
    ],
    muscleLoads: { 'Thoracic Extensors': 4, Trapezius: 2 },
  },
  {
    name: 'T-Spine Overhead Extension Smash',
    description: 'Foam roller + armen overhead — combineert thoracale mobiliteit met lat-rek. Kritisch voor overhead squat en press archetype.',
    category: 'MOBILITY', bodyRegion: ['THORACIC', 'SHOULDER'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'thoracic', 'overhead', 'latissimus'],
    instructions: [
      'Ruglings op foam roller, armen gestrekt boven het hoofd',
      'Laat armen richting grond zakken',
      'Thoracale extensie + lat-rek simultaan',
      'Hou 5-10 sec per segment',
    ],
    muscleLoads: { 'Thoracic Extensors': 4, Latissimus: 3 },
  },
  {
    name: 'Trap Scrub',
    description: 'Upper trap mobilisatie met lacrosse ball tegen muur of op barbell; voor bureau-spanning en nekklachten.',
    category: 'MOBILITY', bodyRegion: ['CERVICAL', 'THORACIC'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'trapezius', 'nek-schouder'],
    instructions: [
      'Lacrosse ball tegen muur ter hoogte upper trap',
      'Leun in tot drukgevoelig punt',
      'Beweeg arm over en achter het hoofd in arc-patroon',
      '1-2 min per zijde',
    ],
    muscleLoads: { Trapezius: 4 },
  },
  {
    name: 'First Rib Mobilization',
    description: 'Mobilisatie van de eerste rib met lacrosse ball of duim; vaak beperkend bij overhead positie en thoracic outlet.',
    category: 'MOBILITY', bodyRegion: ['CERVICAL', 'THORACIC', 'SHOULDER'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'eerste-rib', 'thoracic-outlet', 'overhead'],
    instructions: [
      'Druk lacrosse ball tegen de eerste rib (boven claviculair, achter trapezius)',
      'Laat arm omlaag hangen en zak in de druk',
      'Breng arm langzaam in flexie + buitenrotatie',
      '60-90 sec per zijde',
    ],
    muscleLoads: { 'Scalene': 3, Trapezius: 3 },
  },

  // AREA 3 — Posterior Shoulder, Lat, Serratus
  {
    name: 'Lat Mobilization',
    description: 'Lacrosse ball smash of banded lat-rek — essentieel voor overhead-mobiliteit na bureau- of pull-dominante training.',
    category: 'MOBILITY', bodyRegion: ['BACK', 'SHOULDER'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'latissimus', 'overhead'],
    instructions: [
      'Ga op zij met lacrosse ball onder de oksel-lat',
      'Arm overhead gestrekt',
      'Druk in en rol door de lat-vezels',
      'Werk 1-2 min per zijde',
    ],
    muscleLoads: { Latissimus: 5, 'Teres Major': 3 },
  },
  {
    name: 'Shoulder Flexion in Prone',
    description: 'Passieve shoulder flexion in buiklig met stok of PVC — test + mobilisatie voor volledig armen-overhead archetype.',
    category: 'MOBILITY', bodyRegion: ['SHOULDER'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'shoulder-flexion', 'overhead-archetype'],
    instructions: [
      'Buiklig met voorhoofd op de grond',
      'PVC-stok in beide handen, armen gestrekt vooruit',
      'Til de stok zo hoog mogelijk zonder rug te bewegen',
      'Houd 10-20 sec, 5 reps',
    ],
    muscleLoads: { 'Posterior Deltoid': 3, Latissimus: 3 },
  },
  {
    name: 'Serratus Smash',
    description: 'Mobilisatie van de serratus anterior met lacrosse ball tegen ribkast — cruciaal voor scapulothoracale rhythm.',
    category: 'MOBILITY', bodyRegion: ['SHOULDER', 'THORACIC'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'serratus', 'scapula'],
    instructions: [
      'Zijlig met lacrosse ball onder de axillaire ribben (rond rib 5-7)',
      'Arm overhead gestrekt',
      'Druk in en maak kleine armcirkels',
      '1-2 min per zijde',
    ],
    muscleLoads: { 'Serratus Anterior': 4 },
  },

  // AREA 4 — Anterior Shoulder, Chest
  {
    name: 'Pec Mobilization',
    description: 'Lacrosse ball of foam roll smash op de pectoralis major/minor — corrigeert voorste schouderrol bij bureauwerkers.',
    category: 'MOBILITY', bodyRegion: ['SHOULDER'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'pectoralis', 'houding'],
    instructions: [
      'Buiklig met lacrosse ball tegen de pec (subclaviculair)',
      'Draai licht naar de ball-zijde voor druk',
      'Beweeg arm langzaam in arc-patroon',
      '1-2 min per zijde',
    ],
    muscleLoads: { Pectoralis: 5 },
  },
  {
    name: 'Banded Shoulder Distraction',
    description: 'Band-tractie op de glenohumeraal gewricht — capsule-distractie om GH-space te maken.',
    category: 'MOBILITY', bodyRegion: ['SHOULDER'], difficulty: 'INTERMEDIATE', loadType: 'BAND',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'shoulder-distraction', 'gh-capsule'],
    instructions: [
      'Bevestig band hoog, arm in band ter hoogte elleboog',
      'Loop achteruit tot spanning',
      'Zak in knielzit, arm gedistractied',
      'Beweeg langzaam in flexie/rotatie 2 min per zijde',
    ],
    muscleLoads: { 'Posterior Capsule': 3, Latissimus: 2 },
  },
  {
    name: 'Anterior Shoulder Mob (PVC / Light Bar)',
    description: 'PVC-stok achter de rug — pec + anterior capsule rek. Verbetert front rack en pull-up positie.',
    category: 'MOBILITY', bodyRegion: ['SHOULDER'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'pec-rek', 'front-rack'],
    instructions: [
      'Sta rechtop, PVC-stok achter de rug in brede greep',
      'Til de stok langzaam omhoog weg van het lichaam',
      'Houd de ribben naar beneden (geen lumbale extensie)',
      'Houd 20-30 sec, 3 reps',
    ],
    muscleLoads: { Pectoralis: 3, 'Anterior Deltoid': 2 },
  },

  // AREA 5 — Arm / Elbow / Wrist
  {
    name: 'Triceps Extension Smash',
    description: 'Foam roll of lacrosse ball over de triceps brachii; vaak beperkend bij overhead position en lockout.',
    category: 'MOBILITY', bodyRegion: ['ELBOW', 'SHOULDER'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'triceps', 'elleboog'],
    instructions: [
      'Plaats triceps op foam roller',
      'Rol van elleboog tot schouder in kleine segmenten',
      'Bij drukpunt: buig en strek elleboog 5-10x',
      '1-2 min per arm',
    ],
    muscleLoads: { Triceps: 4 },
  },
  {
    name: 'Wrist Distraction with Banded Flossing',
    description: 'Banded tractie op de pols — voor pols-pijn bij push-up, front rack of pistol squat.',
    category: 'MOBILITY', bodyRegion: ['WRIST'], difficulty: 'INTERMEDIATE', loadType: 'BAND',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'pols', 'front-rack'],
    instructions: [
      'Bevestig band laag, hand door lus',
      'Stap weg tot spanning op de pols (tractie)',
      'Beweeg pols in flexie/extensie/deviatie',
      '1-2 min per zijde',
    ],
    muscleLoads: { 'Wrist Flexors': 3, 'Wrist Extensors': 3 },
  },

  // AREA 6 — Trunk / Psoas / Low Back
  {
    name: 'Psoas Smash and Floss',
    description: 'Diepe psoas-mobilisatie met kettlebell of lacrosse ball in buiklig — voor lage rug en hip flexor tightness.',
    category: 'MOBILITY', bodyRegion: ['LUMBAR', 'HIP'], difficulty: 'ADVANCED', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'psoas', 'lage-rug'],
    instructions: [
      'Buiklig met kettlebell of lacrosse ball net mediaal van SIAS',
      'Zink in de bal',
      'Buig + strek de gelijkzijdige knie langzaam',
      '1-2 min per zijde (niet op nuchtere maag)',
    ],
    muscleLoads: { Psoas: 5, 'Iliacus': 4 },
  },
  {
    name: 'Low Back Mobilization',
    description: 'QL en paraspinaal-mobilisatie met lacrosse ball; voor chronische lage rugspanning.',
    category: 'MOBILITY', bodyRegion: ['LUMBAR'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'ql', 'lage-rug'],
    instructions: [
      'Ruglings met lacrosse ball naast de wervelkolom (niet erop)',
      'Zakken tot drukgevoelige plek',
      'Breng dezelfde-zijde knie naar borst en los weer',
      '1-2 min per zijde',
    ],
    muscleLoads: { 'Quadratus Lumborum': 4, 'Erector Spinae': 3 },
  },
  {
    name: 'Oblique Mobilization',
    description: 'Side-plank smash met foam roller op de obliques — voor rotatie-beperkingen in torso.',
    category: 'MOBILITY', bodyRegion: ['LUMBAR', 'THORACIC'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'obliques', 'rotatie'],
    instructions: [
      'Zijlig met foam roller onder de zijkant van de romp',
      'Steun op onderste elleboog',
      'Rol 2-3 cm op en neer over de obliques',
      '1-2 min per zijde',
    ],
    muscleLoads: { Obliques: 4 },
  },

  // AREA 7 — Glutes, Hip Capsules
  {
    name: 'High Glute Smash and Floss',
    description: 'Lacrosse ball in de upper glute — voor SI-pijn en lage rug overflow.',
    category: 'MOBILITY', bodyRegion: ['HIP', 'LUMBAR'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'glute', 'si-pijn'],
    instructions: [
      'Ruglings met lacrosse ball in de upper glute',
      'Zakken in de bal tot drukpunt',
      'Beweeg hetzelfde-been in cirkels',
      '1-2 min per zijde',
    ],
    muscleLoads: { 'Gluteus Medius': 4, 'Gluteus Maximus': 3 },
  },
  {
    name: 'Banded Hip Distraction',
    description: 'Band-tractie op de heupkop in diverse standen — creëert capsule-space. Fundamenteel bij squat en pistol archetype.',
    category: 'MOBILITY', bodyRegion: ['HIP'], difficulty: 'INTERMEDIATE', loadType: 'BAND',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'hip-capsule', 'squat-archetype'],
    instructions: [
      'Bevestig band laag, loop door tot in de heupplooi',
      'Stap weg tot sterke spanning (tractie)',
      'Zak in half-knielende positie',
      'Beweeg langzaam in flexie/abductie/rotatie',
      '2 min per zijde',
    ],
    muscleLoads: { 'Hip Capsule': 3 },
  },
  {
    name: '90/90 Hip Stretch',
    description: 'Zittend met voorste been 90° geflecteerd + abducted, achterste been 90° gebogen zijwaarts — test + mobiliseert hip IR/ER.',
    category: 'MOBILITY', bodyRegion: ['HIP'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'hip-rotatie', 'internal-rotation'],
    instructions: [
      'Zit op de grond, voorste been 90° voor je, onderbeen horizontaal',
      'Achterste been 90° zijwaarts gebogen',
      'Leun voorover over het voorste been (ER-rek)',
      'Wissel — 1-2 min per zijde',
    ],
    muscleLoads: { 'Hip External Rotators': 4, 'Gluteus Maximus': 3, Piriformis: 3 },
  },
  {
    name: 'Single-Leg Flexion with External Rotation',
    description: 'Hip flexion + ER rek in ruglig met band — voor squat-diepte en deep lunge archetype.',
    category: 'MOBILITY', bodyRegion: ['HIP'], difficulty: 'BEGINNER', loadType: 'BAND',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'hip-flexion', 'squat-diepte'],
    instructions: [
      'Ruglig met band om het voorste deel van de voet',
      'Trek de knie naar de borst + buitenrotatie',
      'Duw zachtjes met tegenovergestelde hand op de binnenkant knie',
      '1-2 min per zijde',
    ],
    muscleLoads: { 'Gluteus Maximus': 3, 'Hip External Rotators': 4 },
  },

  // AREA 8 — Hip Flexors, Quadriceps
  {
    name: 'Couch Stretch',
    description: 'Kelly Starrett-signature mobilisatie: hip flexor + quadriceps rek met knie tegen muur/bank. Corrigeert anterior pelvic tilt.',
    category: 'MOBILITY', bodyRegion: ['HIP', 'KNEE'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'hip-flexor', 'quadriceps', 'couch-stretch'],
    instructions: [
      'Plaats 1 knie tegen muur/bank-rand, voet tegen de muur',
      'Andere voet in lunge voor het lichaam',
      'Squeeze glute — duw heupen naar voren',
      'Borst omhoog, geen lumbale extensie',
      '2 min per zijde',
    ],
    muscleLoads: { 'Hip Flexors': 5, Quadriceps: 4, Psoas: 4 },
  },
  {
    name: 'Quad Smash',
    description: 'Foam roller of kettlebell over de quadriceps — voor VMO-activatie en patellofemorale pijn.',
    category: 'MOBILITY', bodyRegion: ['HIP', 'KNEE'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'quadriceps', 'knie'],
    instructions: [
      'Buiklig met foam roller onder de quadriceps',
      'Rol van heup tot vlak boven de knie',
      'Bij drukpunt: buig en strek de knie 5-10x',
      '1-2 min per been',
    ],
    muscleLoads: { Quadriceps: 5 },
  },
  {
    name: 'Banded Hip Extension Lunge',
    description: 'Lunge met band achter de heup die het dijbeen naar voren trekt — creëert extensie-tractie tijdens functionele beweging.',
    category: 'MOBILITY', bodyRegion: ['HIP'], difficulty: 'INTERMEDIATE', loadType: 'BAND',
    isUnilateral: true, movementPattern: 'LUNGE',
    tags: ['supple-leopard', 'kelly-starrett', 'hip-extension', 'band'],
    instructions: [
      'Bevestig band laag, stap in tot hoog in de heupplooi (voorkant)',
      'Stap met dat been naar voren in lunge',
      'Squeeze glute en push heup naar voren',
      '10-15 reps per zijde',
    ],
    muscleLoads: { 'Gluteus Maximus': 4, 'Hip Flexors': 3 },
  },

  // AREA 9 — Adductors
  {
    name: 'Super Frog Stretch',
    description: 'Vier-punt kniel met gespreide knieën — passieve adductor-rek in comfortabele flexed positie.',
    category: 'MOBILITY', bodyRegion: ['HIP'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'adductoren', 'frog-stretch'],
    instructions: [
      'Vier-punt kniel, knieën zo breed mogelijk',
      'Voeten in dorsiflexie, onderbenen parallel',
      'Duw zitbeenderen naar achter (richting hielen)',
      'Hou 2 min, geleidelijk verder zakken',
    ],
    muscleLoads: { Adductors: 5 },
  },
  {
    name: 'Banded Adductor Mobilization',
    description: 'Band-tractie op de heupkop met been in abductie; creëert capsule-space in frog-positie.',
    category: 'MOBILITY', bodyRegion: ['HIP'], difficulty: 'INTERMEDIATE', loadType: 'BAND',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'adductoren', 'heupcapsule'],
    instructions: [
      'Bevestig band laag, plaats lus hoog op dijbeen',
      'Vier-punt kniel, knieën breed',
      'Band trekt dijbeen lateraal — capsule distractie',
      '2 min per zijde',
    ],
    muscleLoads: { Adductors: 4, 'Hip Capsule': 3 },
  },

  // AREA 10 — Hamstrings
  {
    name: 'Hamstring Smash and Floss',
    description: 'Lacrosse ball of barbell op de hamstring-belly; belangrijk bij lage rug + sprint problemen.',
    category: 'MOBILITY', bodyRegion: ['HIP', 'KNEE'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'hamstrings'],
    instructions: [
      'Zittend met hamstring op hoge box of bar',
      'Lacrosse ball onder drukpunt',
      'Buig en strek de knie 10-15x',
      '1-2 min per been',
    ],
    muscleLoads: { Hamstrings: 5 },
  },
  {
    name: 'Banded Hamstring Mobilization',
    description: 'Ruglings met band over voet; passieve hamstring-rek met actieve heup-flexie. Gouden standaard voor hamstring lengte.',
    category: 'MOBILITY', bodyRegion: ['HIP', 'KNEE'], difficulty: 'BEGINNER', loadType: 'BAND',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'hamstrings', 'band'],
    instructions: [
      'Ruglig, band om de bal van de voet',
      'Trek been gestrekt omhoog tot spanning',
      'Punt en flex voet afwisselend (nervus floss)',
      '1-2 min per zijde',
    ],
    muscleLoads: { Hamstrings: 4, Calves: 2 },
  },

  // AREA 11 — Knee
  {
    name: 'Knee Flexion Gapping',
    description: 'Lacrosse ball tussen kuit en bovenbeen in diepe squat — creëert ruimte voor volledige knieflexie.',
    category: 'MOBILITY', bodyRegion: ['KNEE'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'knie-flexie', 'squat-diepte'],
    instructions: [
      'Zet lacrosse ball in de knieplooi',
      'Buig diep (hiel naar zitvlak)',
      'Knijp actief om de bal',
      '1-2 min per zijde',
    ],
    muscleLoads: { Hamstrings: 3, Gastrocnemius: 3 },
  },
  {
    name: 'Patellar Mobilization',
    description: 'Handmatige glide-mobilisatie van de patella in alle 4 richtingen — cruciaal na knie-immobilisatie.',
    category: 'MOBILITY', bodyRegion: ['KNEE'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'patella', 'postoperatief'],
    instructions: [
      'Zit met gestrekt been, quadriceps ontspannen',
      'Duw patella zacht superior, inferior, mediaal, lateraal',
      '10 glides per richting',
      '2-3 sets',
    ],
    muscleLoads: { Quadriceps: 1 },
  },

  // AREA 12 — Shin
  {
    name: 'Shin Smash and Floss',
    description: 'Foam roller of lacrosse ball op de tibialis anterior; voor shin splints en dorsiflexie-beperking.',
    category: 'MOBILITY', bodyRegion: ['ANKLE'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'shin-splints', 'tibialis-anterior'],
    instructions: [
      'Knielend met foam roller onder scheen',
      'Zak op de roller met lichaamsgewicht',
      'Bij drukpunt: puntigen en flex de voet',
      '1-2 min per been',
    ],
    muscleLoads: { 'Tibialis Anterior': 4 },
  },

  // AREA 13 — Calf
  {
    name: 'Calf Smash',
    description: 'Foam roll of lacrosse ball op gastrocnemius/soleus; verhoogt dorsiflexie ROM binnen 60 seconden.',
    category: 'MOBILITY', bodyRegion: ['ANKLE', 'KNEE'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'calves', 'dorsiflexie'],
    instructions: [
      'Zit met kuit op foam roller, andere been op het bovenliggende been',
      'Til heupen een paar cm van de grond',
      'Rol van achillespees tot knieplooi',
      '1-2 min per been',
    ],
    muscleLoads: { Calves: 4 },
  },
  {
    name: 'Banded Calf Mobilization',
    description: 'Band-tractie op de enkel tijdens dorsiflexie-rek; verbetert anterior ankle impingement en ROM.',
    category: 'MOBILITY', bodyRegion: ['ANKLE'], difficulty: 'INTERMEDIATE', loadType: 'BAND',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'ankle', 'dorsiflexie'],
    instructions: [
      'Bevestig band laag, lus over voorkant enkel',
      'Stap weg tot spanning (tractie naar achter)',
      'Lunge-positie, duw knie over tenen',
      '15-20 reps + 30s hold, per zijde',
    ],
    muscleLoads: { 'Ankle Capsule': 3, Calves: 3 },
  },

  // AREA 14 — Ankle, Foot, Toes
  {
    name: 'Forefoot Mobilization',
    description: 'Distractie + mobilisatie van metatarsal joints met duimen; voor voorvoet-stijfheid en turf toe.',
    category: 'MOBILITY', bodyRegion: ['FOOT'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'voorvoet', 'turf-toe'],
    instructions: [
      'Zit met enkel op tegenovergesteld knie',
      'Pak grote teen en MTP-gewricht',
      'Circumductie + tractie 10-15x per teen',
      '2-3 min per voet',
    ],
    muscleLoads: { 'Foot Intrinsics': 2 },
  },
  {
    name: 'Ankle Mobilization',
    description: 'Anterior-posterior glide van de talus in dorsiflexie met overpressure; voor post-sprain stijfheid.',
    category: 'MOBILITY', bodyRegion: ['ANKLE'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'enkel', 'post-sprain'],
    instructions: [
      'Half-knielpositie met voorste voet plat op de grond',
      'Knie voorbij tenen drukken in lunge',
      'Handen op knie voor overpressure',
      '20-30 reps per zijde',
    ],
    muscleLoads: { 'Ankle Capsule': 3 },
  },
  {
    name: 'Foot Smash',
    description: 'Lacrosse ball of tennisbal onder de voetzool — voor plantair fasciitis en voorkomen platvoet.',
    category: 'MOBILITY', bodyRegion: ['FOOT'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['supple-leopard', 'kelly-starrett', 'plantar-fascia', 'voetboog'],
    instructions: [
      'Staand met 1 voet op de bal',
      'Rol langzaam van hiel naar tenen',
      'Bij drukpunt: 10s statische druk',
      '2-3 min per voet',
    ],
    muscleLoads: { 'Plantar Fascia': 4, 'Foot Intrinsics': 2 },
  },
]

// ─── Protocol-mentioned strength/control oefeningen die nog ontbraken ─────

const PROTOCOL_EXTRA: Seed[] = [
  {
    name: 'Alfredson heel drop (eccentric)',
    description: 'Excentrische calf raise protocol: zwaar belast op gestrekte én gebogen knie, 3×15 per been, 2x/dag, 12 weken. Gouden standaard bij midportion achillestendinopathie en post-ruptuur [Alfredson 1998].',
    category: 'STRENGTH', bodyRegion: ['ANKLE'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: 'CALF_RAISE',
    tags: ['alfredson', 'eccentric', 'achilles', 'tendinopathie', 'evidence-based'],
    instructions: [
      'Sta op rand van trede op voorvoet van aangedane been',
      'Push omhoog met beide benen',
      'Til gezonde been op',
      'Zak langzaam op alleen het aangedane been (excentrisch, 3-4 sec)',
      '3×15 met gestrekte knie + 3×15 met 30° flexie, 2x daags',
    ],
    muscleLoads: { Calves: 5, 'Achillespees': 5 },
  },
  {
    name: 'Copenhagen adductor hold',
    description: 'Isometrische adductor-hold in zijplank; evidence-based preventie van adductor-strains (Harøy et al., 2019).',
    category: 'STRENGTH', bodyRegion: ['HIP'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: 'ISOLATION_LOWER',
    tags: ['adductoren', 'preventie', 'lies-blessure', 'voetbal'],
    instructions: [
      'Zijlig, steun op elleboog',
      'Bovenste been op bank/partner (voet of knie)',
      'Til heupen op + onderste been tegen bank drukken',
      'Houd 20-30s per zijde, 3 sets',
    ],
    muscleLoads: { Adductors: 5, Obliques: 3 },
  },
  {
    name: 'Pallof press',
    description: 'Anti-rotatie core-oefening met kabel of band; versterkt rompstabiliteit zonder lumbale flexie/extensie.',
    category: 'STABILITY', bodyRegion: ['LUMBAR', 'FULL_BODY'], difficulty: 'BEGINNER', loadType: 'BAND',
    isUnilateral: true, movementPattern: 'ROTATION',
    tags: ['core', 'anti-rotatie', 'band', 'lage-rug'],
    instructions: [
      'Sta zijwaarts ten opzichte van band-anker',
      'Pak band met beide handen tegen borst',
      'Strek armen recht vooruit (band wil roteren — weersta)',
      'Houd 2-3s, trek terug',
      '10-15 reps per zijde',
    ],
    muscleLoads: { Obliques: 4, Core: 4, 'Gluteus Medius': 2 },
  },
  {
    name: 'Bird dog',
    description: 'Vier-punt kniel met contralaterale arm+been extensie; core-stabiliteit en coördinatie voor lage rug rehab.',
    category: 'STABILITY', bodyRegion: ['LUMBAR', 'FULL_BODY'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: 'CORE',
    tags: ['core', 'lage-rug', 'mckenzie', 'neutral-spine'],
    instructions: [
      'Vier-punt kniel, neutrale rug',
      'Strek rechter arm + linker been tegelijk',
      'Houd 2-3s, neutrale rug behouden',
      'Wissel, 8-12 reps per zijde',
    ],
    muscleLoads: { 'Erector Spinae': 3, Glutes: 3, 'Anterior Deltoid': 2, Core: 3 },
  },
  {
    name: 'Dead bug',
    description: 'Ruglings met contralaterale arm+been extensie; leert core-bracing tijdens extremiteit-beweging.',
    category: 'STABILITY', bodyRegion: ['LUMBAR'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: 'CORE',
    tags: ['core', 'lage-rug', 'bracing', 'diafragma'],
    instructions: [
      'Ruglig, armen recht omhoog, knieën 90° en heupen 90°',
      'Strek rechter arm + linker been richting grond',
      'Lage rug plat tegen de grond houden',
      'Wissel, 8-12 reps per zijde',
    ],
    muscleLoads: { Core: 4, 'Transversus Abdominis': 4, 'Hip Flexors': 2 },
  },
  {
    name: 'Wall slide',
    description: 'Staand tegen muur met armen in W-positie — scapulothoracale opdrukkracht en ROM voor shoulder impingement.',
    category: 'MOBILITY', bodyRegion: ['SHOULDER', 'THORACIC'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: null,
    tags: ['scapulothoracaal', 'shoulder-impingement', 'serratus'],
    instructions: [
      'Sta tegen muur, voeten 10cm van muur',
      'Armen in W (90° elleboog, duimen richting muur)',
      'Schuif armen omhoog naar Y, houd contact met muur',
      'Keer gecontroleerd terug, 10-12 reps',
    ],
    muscleLoads: { 'Serratus Anterior': 4, Trapezius: 3, 'Rotator Cuff': 3 },
  },
  {
    name: 'Sleeper stretch',
    description: 'Zijlig met schouder 90° geflecteerd + elleboog 90°; passieve IR-rek voor posterior capsule tightness (overhead sporters).',
    category: 'MOBILITY', bodyRegion: ['SHOULDER'], difficulty: 'INTERMEDIATE', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['shoulder-ir', 'posterior-capsule', 'overhead-sport', 'werpen'],
    instructions: [
      'Zijlig op aangedane kant, schouder 90° flexie',
      'Elleboog 90° gebogen, onderarm omhoog',
      'Met tegenovergestelde hand duw onderarm richting grond (IR-rek)',
      'Houd 30s, 3 reps per zijde',
    ],
    muscleLoads: { 'Posterior Deltoid': 3, 'Rotator Cuff': 3 },
  },
  {
    name: 'Pendulum swing',
    description: 'Codman-pendulum: voorover gebogen, arm hangt, swing in cirkels; post-operatief schouder om gewrichtsvoeding te bevorderen zonder actieve rotator cuff belasting.',
    category: 'MOBILITY', bodyRegion: ['SHOULDER'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: true, movementPattern: null,
    tags: ['codman', 'postoperatief', 'rotator-cuff', 'vroege-fase'],
    instructions: [
      'Voorover gebogen steunen op niet-aangedane arm op tafel',
      'Aangedane arm hangt ontspannen',
      'Beweeg romp zodat arm cirkels maakt (passief)',
      '10 cirkels klokwise + 10 tegenklok, 2-3x per dag',
    ],
    muscleLoads: { 'Rotator Cuff': 1 },
  },
  {
    name: 'Y-T-W raise',
    description: 'Prone I-Y-T-W scapulaire retractie op bank of vloer — versterkt mid+lower traps, rhomboids voor scapulothoracale stabiliteit.',
    category: 'STRENGTH', bodyRegion: ['SHOULDER', 'THORACIC'], difficulty: 'BEGINNER', loadType: 'BODYWEIGHT',
    isUnilateral: false, movementPattern: 'ISOLATION_UPPER',
    tags: ['scapulothoracaal', 'rotator-cuff', 'lower-trap'],
    instructions: [
      'Buiklig op bank of vloer, armen hangen',
      'Y: armen in V omhoog, duimen omhoog',
      'T: armen zijwaarts op schouderhoogte',
      'W: ellebogen 90°, squeeze schouderbladen',
      '8-12 reps per letter, 2-3 sets',
    ],
    muscleLoads: { Trapezius: 4, Rhomboids: 4, 'Posterior Deltoid': 3 },
  },
  {
    name: 'Banded shoulder IR / ER',
    description: 'Banded internal en external rotation voor rotator cuff versterking; kern van schouder-revalidatie.',
    category: 'STRENGTH', bodyRegion: ['SHOULDER'], difficulty: 'BEGINNER', loadType: 'BAND',
    isUnilateral: true, movementPattern: 'ISOLATION_UPPER',
    tags: ['rotator-cuff', 'band', 'ir-er', 'schouder-rehab'],
    instructions: [
      'Bevestig band op elleboog-hoogte',
      'Elleboog 90° tegen het lichaam, onderarm horizontaal',
      'Externe rotatie: rol onderarm weg van buik',
      'Interne rotatie: rol onderarm richting buik',
      '2×15 per richting per zijde',
    ],
    muscleLoads: { 'Rotator Cuff': 4, 'Posterior Deltoid': 2 },
  },
]

async function main() {
  const owner = await prisma.user.findFirst({
    where: { role: { in: [UserRole.ADMIN, UserRole.THERAPIST] } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  if (!owner) throw new Error('Geen ADMIN of THERAPIST gevonden als owner.')
  console.log(`Owner: ${owner.email}`)

  const all = [...SUPPLE_LEOPARD, ...PROTOCOL_EXTRA]
  console.log(`Seeding ${all.length} oefeningen (${SUPPLE_LEOPARD.length} mobility + ${PROTOCOL_EXTRA.length} protocol)...`)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const ex of all) {
    const existing = await prisma.exercise.findFirst({
      where: { name: { equals: ex.name, mode: 'insensitive' } },
    })
    if (existing) {
      if (existing.createdById !== owner.id) {
        skipped++
        continue
      }
      await prisma.muscleLoad.deleteMany({ where: { exerciseId: existing.id } })
      await prisma.exercise.update({
        where: { id: existing.id },
        data: {
          description: ex.description,
          category: ex.category as never,
          bodyRegion: ex.bodyRegion as never,
          difficulty: ex.difficulty as never,
          loadType: ex.loadType as never,
          isUnilateral: ex.isUnilateral,
          movementPattern: (ex.movementPattern ?? null) as never,
          instructions: ex.instructions,
          tags: ex.tags,
          muscleLoads: {
            create: Object.entries(ex.muscleLoads).map(([muscle, load]) => ({ muscle, load })),
          },
        },
      })
      updated++
    } else {
      await prisma.exercise.create({
        data: {
          name: ex.name,
          description: ex.description,
          category: ex.category as never,
          bodyRegion: ex.bodyRegion as never,
          difficulty: ex.difficulty as never,
          loadType: ex.loadType as never,
          isUnilateral: ex.isUnilateral,
          movementPattern: (ex.movementPattern ?? null) as never,
          instructions: ex.instructions,
          tags: ex.tags,
          isPublic: true,
          createdById: owner.id,
          muscleLoads: {
            create: Object.entries(ex.muscleLoads).map(([muscle, load]) => ({ muscle, load })),
          },
        },
      })
      created++
    }
  }
  console.log(`Oefeningen: ${created} created, ${updated} updated, ${skipped} skipped (owned by someone else)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
