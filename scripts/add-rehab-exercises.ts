/**
 * Voegt nieuwe oefeningen toe aan de database zonder bestaande te overschrijven.
 * Upsert-strategie: als naam al bestaat → skip, anders create met isPublic=true
 * gekoppeld aan admin user.
 *
 * Muscle-loads schattingen gebaseerd op:
 * - Copenhagen adduction EMG: Serner 2014, Thorborg 2014 (adductor longus >100% MVIC)
 * - Pallof press / anti-rotation: Lehman 2007 (oblique activation 40-55% MVIC)
 * - Side plank variants: McGill 2010 (quadratus lumborum + obliques hoog)
 * - Superman / prone extension: Callaghan 1998 (erector spinae 35-45% MVIC)
 * - Terminal knee extension: Escamilla 2001 (VMO > VL in late extension)
 * - Glute band walks: Distefano 2009 (gluteus medius 60-80% MVIC in sidestep)
 *
 * Run:  cd ~/mbt-move && npx tsx scripts/add-rehab-exercises.ts
 */
import { PrismaClient, ExerciseCategory, BodyRegion, LoadType, MovementPattern } from '@prisma/client'
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

type NewExercise = {
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

const NEW_EXERCISES: NewExercise[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // PALLOF / ANTI-ROTATION & ROTATION CORE
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Single Leg Pallof Press',
    description: 'Pallof press staand op één been — combineert anti-rotatie kracht van core met proprioceptie en heup-stabilisatie. Ideaal voor terugkeer naar sport na knie- of enkelrevalidatie.',
    category: 'STABILITY',
    bodyRegion: ['HIP', 'KNEE', 'LUMBAR'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BAND',
    isUnilateral: true,
    movementPattern: 'CORE',
    tags: ['anti-rotatie', 'core', 'balans', 'revalidatie', 'sport'],
    instructions: [
      'Sta zijwaarts t.o.v. een kabel/band op buikhoogte',
      'Hef het been op dat het verst van de kabel staat',
      'Houd de band voor je borst met beide handen',
      'Druk de band langzaam recht voor je uit, weersta de rotatiekracht',
      'Houd 2 sec vast, breng gecontroleerd terug',
    ],
    muscleLoads: { Core: 4, Glutes: 3, Quadriceps: 2, Abductoren: 3 },
  },
  {
    name: 'Half Kneeling Pallof Press with Rotation',
    description: 'Half-geknielde pallof met actieve thoracale rotatie. Combineert core-kracht met thoracale mobiliteit — nuttig bij rug- en schouderklachten.',
    category: 'STABILITY',
    bodyRegion: ['LUMBAR', 'THORACIC'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BAND',
    isUnilateral: false,
    movementPattern: 'ROTATION',
    tags: ['core', 'rotatie', 'thoracaal', 'half-knielend'],
    instructions: [
      'Kniel op één knie (voorste been 90°) zijwaarts t.o.v. de kabel',
      'Houd de band voor je borst, druk recht voor je uit',
      'Roteer vanuit de borstwervelkolom weg van de kabel',
      'Keer gecontroleerd terug naar het midden',
      'Houd de onderste rug neutraal, roteer alleen boven',
    ],
    muscleLoads: { Core: 4, Obliques: 4, Glutes: 2, Bovenrug: 2 },
  },
  {
    name: 'Half Kneeling Windmill',
    description: 'Half-geknielde windmill — unilaterale core-oefening die heup-mobiliteit, schouder-stabiliteit en zijwaartse core-kracht traint.',
    category: 'STABILITY',
    bodyRegion: ['HIP', 'SHOULDER', 'THORACIC'],
    difficulty: 'INTERMEDIATE',
    loadType: 'WEIGHTED',
    isUnilateral: true,
    movementPattern: 'ROTATION',
    tags: ['windmill', 'core', 'schouder-stabiliteit', 'heup-mobiliteit'],
    instructions: [
      'Kniel half — achterste knie op de grond, voorste voet plat',
      'Houd een kettlebell/dumbbell recht boven met gestrekte arm',
      'Kijk naar het gewicht, buig zijdelings richting voorste knie',
      'Raak de grond met andere hand of knie (afhankelijk van mobiliteit)',
      'Keer langzaam terug naar rechtop',
    ],
    muscleLoads: { Obliques: 4, Core: 3, Schouders: 3, Glutes: 2, Rotatorcuff: 3 },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SIDE PLANK VARIATIONS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Side Plank with Top Leg Raise',
    description: 'Zijplank gecombineerd met abductie van het bovenste been. Zeer hoge activatie van gluteus medius én obliques — sleutel-oefening voor lateral hip stability bij knie-/heup-revalidatie.',
    category: 'STABILITY',
    bodyRegion: ['HIP', 'LUMBAR'],
    difficulty: 'ADVANCED',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    tags: ['side plank', 'gluteus medius', 'core', 'lateral chain'],
    instructions: [
      'Ga in zijplank met onderarm op de grond',
      'Lijn schouder-heup-enkel in rechte lijn',
      'Hef langzaam het bovenste been op tot ~30-45 graden',
      'Houd 1-2 sec vast, laat gecontroleerd zakken',
      'Houd heupen hoog gedurende de hele set',
    ],
    muscleLoads: { Obliques: 5, Abductoren: 4, Glutes: 3, Core: 4, Schouders: 2 },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // KOPENHAGEN ADDUCTION VARIATIONS
  // Extreem hoge adductor-activatie (adductor longus >100% MVIC, Serner 2014)
  // Beschermend tegen liesblessures in voetbal, hockey, basketbal
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Copenhagen Adduction (Long Lever)',
    description: 'Zijplank met bovenste enkel op bank, volle body lever. Hoogste adductor-activatie van alle oefeningen (adductor longus 108% MVIC, Serner 2014). Eerste keuze voor lieskracht & -preventie bij sport.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'ADVANCED',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    tags: ['kopenhagen', 'adductoren', 'lies', 'preventie', 'voetbal'],
    instructions: [
      'Ga in zijplank, leg de bovenste enkel op een bank of box',
      'Onderste been houdt je iets boven de grond',
      'Hef het onderste been op tot het de bank raakt',
      'Laat gecontroleerd zakken zonder de grond te raken',
      'Houd heupen en romp in rechte lijn',
    ],
    muscleLoads: { Adductoren: 5, Obliques: 4, Core: 4, Glutes: 3 },
  },
  {
    name: 'Copenhagen Adduction (Short Lever)',
    description: 'Regressie met de knie (ipv enkel) op de bank — kortere hefboom = lagere belasting. Goede start voor patiënten terugkerend uit lies-/adductor-blessure.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    tags: ['kopenhagen', 'adductoren', 'regressie', 'revalidatie'],
    instructions: [
      'Ga in zijplank, leg de bovenste knie op een bank (in plaats van enkel)',
      'Hef het onderste been op tot tegen de bank',
      'Laat gecontroleerd zakken',
      'Knie blijft gebogen op de bank gedurende de beweging',
    ],
    muscleLoads: { Adductoren: 4, Obliques: 3, Core: 3, Glutes: 2 },
  },
  {
    name: 'Copenhagen Adduction (Isometric Hold)',
    description: 'Statische hold in de top-positie — submaximale isometrische contractie, effectief voor beginfase revalidatie na blessure (pijnvrij laad-interval).',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    tags: ['kopenhagen', 'adductoren', 'isometrisch', 'pijnvrije belasting'],
    instructions: [
      'Ga in zijplank met bovenste enkel/knie op bank',
      'Til het onderste been op en druk tegen de bank',
      'Houd de contractie vast (start 10 sec, bouw op naar 30-45 sec)',
      'Focus op constante adductor-spanning',
    ],
    muscleLoads: { Adductoren: 4, Obliques: 3, Core: 3 },
  },
  {
    name: 'Copenhagen Adduction (Eccentric Only)',
    description: 'Alleen de excentrische (neerlatende) fase met assistentie bij het omhoog komen. Hoogste eccentric-adductor activatie, gebruikt in Thorborg protocol voor liesblessure-preventie.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    tags: ['kopenhagen', 'eccentric', 'adductoren', 'Thorborg-protocol'],
    instructions: [
      'Ga in zijplank met bovenste enkel op bank',
      'Gebruik je handen om omhoog te komen naar topstand',
      'Laat het onderste been heel langzaam zakken (3-5 sec)',
      'Herhaal — alleen neerlaten is de trainingsprikkel',
    ],
    muscleLoads: { Adductoren: 5, Obliques: 3, Core: 3 },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LOWER BACK / CORE
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Superman',
    description: 'Prone back extension met gelijktijdige arm- en beenhef. Activeert erector spinae, gluteus maximus en achterste schouderketen. Basis-oefening voor onderrugkracht.',
    category: 'STRENGTH',
    bodyRegion: ['LUMBAR', 'BACK'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: false,
    movementPattern: 'HINGE',
    tags: ['superman', 'onderrug', 'erector spinae', 'glutes', 'basis'],
    instructions: [
      'Ga plat op je buik liggen, armen gestrekt voor je',
      'Hef tegelijk armen, borst en benen op van de grond',
      'Houd 2 seconden vast in de bovenste positie',
      'Laat gecontroleerd zakken',
      'Houd de nek in lijn met de rug (kijk naar beneden)',
    ],
    muscleLoads: { Onderrug: 4, Glutes: 3, Bovenrug: 2, Hamstrings: 2 },
  },
  {
    name: 'Alternating Superman (Bird Dog prone)',
    description: 'Afwisselend tegenovergestelde arm + been heffen in prone-positie. Regressie van Superman — ideaal voor beginners of acute rug-revalidatie.',
    category: 'STRENGTH',
    bodyRegion: ['LUMBAR', 'BACK'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'HINGE',
    tags: ['superman', 'regressie', 'onderrug', 'coördinatie'],
    instructions: [
      'Lig plat op je buik, armen gestrekt',
      'Hef tegelijk rechterarm + linkerbeen',
      'Houd 2 sec vast, wissel naar links-rechts',
      'Blijf rustig ademen, houd heupen op de grond',
    ],
    muscleLoads: { Onderrug: 3, Glutes: 3, Bovenrug: 2 },
  },
  {
    name: 'McGill Curl-Up',
    description: 'Speciale ab-crunch variant ontwikkeld door Stuart McGill. Minimale shear-stress op lumbale wervels — veilig alternatief voor sit-ups bij rugklachten.',
    category: 'STRENGTH',
    bodyRegion: ['LUMBAR', 'BACK'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: false,
    movementPattern: 'CORE',
    tags: ['McGill', 'rugveilig', 'core', 'onderrug-vriendelijk'],
    instructions: [
      'Ga op de rug liggen, één knie gebogen, ander been gestrekt',
      'Handen onder de onderrug (behoud natuurlijke kromming)',
      'Til alleen het hoofd en bovenrug licht op (kin in)',
      'Onderrug BLIJFT tegen je handen drukken — geen lumbale flexie',
      'Hou 7-10 sec vast, wissel benen halverwege',
    ],
    muscleLoads: { Core: 4, Obliques: 2 },
  },
  {
    name: 'Prone Press-Up (Cobra)',
    description: 'McKenzie extensie-oefening: liggend op buik, armen strekken om rug te extenderen. Bevordert nucleus pulposus-migratie naar anterior; eerste keus bij lumbale discus-klachten met beenpijn.',
    category: 'MOBILITY',
    bodyRegion: ['LUMBAR', 'BACK'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: false,
    movementPattern: 'HINGE',
    tags: ['McKenzie', 'extensie', 'discus', 'mobiliteit', 'onderrug'],
    instructions: [
      'Lig plat op je buik, handen onder schouders',
      'Duw bovenlijf omhoog door armen te strekken',
      'Laat heupen en benen op de grond blijven',
      'Adem uit, voel de extensie in de onderrug',
      'Houd 1-3 sec, herhaal 10 keer langzaam',
    ],
    muscleLoads: { Onderrug: 1, Bovenrug: 1 },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MOBILITY
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Scorpion Stretch',
    description: 'Prone rotatiestretch waarbij één been over het lichaam zwaait naar de tegenovergestelde hand. Opent heup-flexoren, thoracale wervelkolom en voorste schouderketen.',
    category: 'MOBILITY',
    bodyRegion: ['HIP', 'THORACIC', 'LUMBAR'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'ROTATION',
    tags: ['mobiliteit', 'rotatie', 'heup-flexoren', 'thoracaal', 'dynamisch'],
    instructions: [
      'Lig plat op je buik, armen in T-positie gespreid',
      'Zwaai rechterbeen over je lichaam richting linkerhand',
      'Probeer rechtervoet de linkerhand te laten raken',
      'Keer terug, wissel naar andere zijde',
      'Houd schouders zo plat mogelijk op de grond',
    ],
    muscleLoads: { Obliques: 1, Core: 1 },
  },
  {
    name: 'Open Book / Sidelying T-Spine Rotation',
    description: 'Zijlig met knieën opgetrokken, bovenste arm "opent" als een boek naar de tegenovergestelde zijde. Gerichte thoracale mobiliteit zonder lumbale compensatie.',
    category: 'MOBILITY',
    bodyRegion: ['THORACIC', 'BACK'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'ROTATION',
    tags: ['open book', 'thoracaal', 'mobiliteit', 'zijlig'],
    instructions: [
      'Lig op je zij, knieën 90° opgetrokken, handen samen voor je',
      'Houd knieën bij elkaar op de grond',
      'Open de bovenste arm in een boog naar achter — "open het boek"',
      'Volg je hand met je blik; voel de rotatie in de borstwervelkolom',
      'Houd 2 sec vast in eindpositie, herhaal 10x per zijde',
    ],
    muscleLoads: { Bovenrug: 1, Obliques: 1 },
  },
  {
    name: 'Quadruped T-Spine Rotation (Thread the Needle)',
    description: 'Vanuit vierkant, één arm onder het lichaam door "threaden" en vervolgens naar boven roteren. Activeert thoracale rotatoren en schouder-mobiliteit gelijktijdig.',
    category: 'MOBILITY',
    bodyRegion: ['THORACIC', 'SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'ROTATION',
    tags: ['mobiliteit', 'thoracaal', 'quadruped', 'thread the needle'],
    instructions: [
      'Ga in vierstand (handen onder schouders, knieën onder heupen)',
      'Schuif rechter-arm onder het lichaam door, schouder naar grond',
      'Daarna roteer open naar het plafond, arm richting boven',
      'Volg je hand met je blik, beweeg vanuit de borstwervelkolom',
      '5-8 keer per zijde, rustig tempo',
    ],
    muscleLoads: { Bovenrug: 1, Rotatorcuff: 1 },
  },
  {
    name: 'Pigeon Stretch',
    description: 'Klassieke hip-opener uit yoga. Diepe rek op gluteus maximus en piriformis van het voorste been — effectief bij lage rugpijn, ischias en heup-impingement.',
    category: 'MOBILITY',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: null,
    tags: ['mobiliteit', 'heup', 'piriformis', 'glutes', 'ischias'],
    instructions: [
      'Vanuit vierstand: breng rechterbeen naar voren, knie 90°',
      'Strek linkerbeen ver naar achter, wreef op grond',
      'Laat de heupen zakken richting grond (niet kantelen)',
      'Buig voorover over voorste been voor diepere rek',
      '30-60 sec per zijde',
    ],
    muscleLoads: { Glutes: 1 },
  },
  {
    name: 'World\'s Greatest Stretch',
    description: 'Dynamische multi-plane mobiliteits-flow: lunge + thoracale rotatie + hamstring-rek. Warm-up standaard bij sport-revalidatie.',
    category: 'MOBILITY',
    bodyRegion: ['HIP', 'THORACIC', 'FULL_BODY'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'LUNGE',
    tags: ['warming-up', 'mobiliteit', 'dynamisch', 'full-body'],
    instructions: [
      'Stap ver uit in een lunge (rechts voor)',
      'Plaats linkerhand naast de rechtervoet',
      'Roteer de rechterarm open naar het plafond',
      'Plaats rechterhand terug, druk heupen omhoog (downward dog)',
      'Stap met links voor door, herhaal andere zijde',
    ],
    muscleLoads: { Hamstrings: 1, Obliques: 1, Glutes: 1 },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // KNEE / HIP REHAB
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Terminal Knee Extension (TKE)',
    description: 'Isolatie van vastus medialis in laatste 30° extensie. Klassieke oefening voor patellofemorale klachten en post-ACL revalidatie om VMO te activeren.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE'],
    difficulty: 'BEGINNER',
    loadType: 'BAND',
    isUnilateral: true,
    movementPattern: 'ISOLATION_LOWER',
    tags: ['VMO', 'TKE', 'knie', 'patellofemoraal', 'ACL-revalidatie'],
    instructions: [
      'Maak een band vast op kniehoogte achter je',
      'Stap voor de band, leg de band achter de knie',
      'Knie licht gebogen starten (30°)',
      'Strek de knie volledig uit tegen de weerstand',
      'Houd 2 sec vast in extensie, laat langzaam terug',
    ],
    muscleLoads: { Quadriceps: 4 },
  },
  {
    name: 'Monster Walks (Banded Lateral Walks)',
    description: 'Zijwaarts stappen met weerstandsband om de knieën/enkels. Hoge gluteus medius activatie (58-67% MVIC, Distefano 2009) — sleutel voor heup-stabiliteit bij knie- en heupklachten.',
    category: 'STRENGTH',
    bodyRegion: ['HIP', 'KNEE'],
    difficulty: 'BEGINNER',
    loadType: 'BAND',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    tags: ['gluteus medius', 'heup-stabiliteit', 'band', 'knie-revalidatie'],
    instructions: [
      'Plaats een lus-band om je enkels of net boven de knieën',
      'Zak in halve squat-positie met lichte knie-flexie',
      'Stap 10-15 stappen zijwaarts, houd spanning op de band',
      'Keer terug met stappen in de andere richting',
      'Knieën blijven boven voeten — laat ze niet naar binnen vallen',
    ],
    muscleLoads: { Abductoren: 4, Glutes: 3, Quadriceps: 2, Core: 2 },
  },
  {
    name: 'Banded Monster Walk Forward',
    description: 'Band om enkels, vooruit stappen met brede stappen. Combineert gluteus medius + heup extensoren. Variatie op lateral walks.',
    category: 'STRENGTH',
    bodyRegion: ['HIP', 'KNEE'],
    difficulty: 'BEGINNER',
    loadType: 'BAND',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    tags: ['gluteus medius', 'monster walk', 'heup', 'band'],
    instructions: [
      'Band om enkels, kleine squat-positie',
      'Stap voorwaarts met brede pas (voeten wijd)',
      'Houd spanning op band tijdens elke stap',
      '10-15 stappen, dan terug',
    ],
    muscleLoads: { Abductoren: 3, Glutes: 3, Quadriceps: 2 },
  },
  {
    name: 'Banded Box Step-Down',
    description: 'Excentrische knie-controle: langzaam van een box of trede afzakken. Train VMO en heup-stabiliteit gelijktijdig; essentieel voor runners knee en post-meniscus revalidatie.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE', 'HIP'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'LUNGE',
    tags: ['step-down', 'excentrisch', 'knie-controle', 'runners knee'],
    instructions: [
      'Sta op een trede/box (20-30 cm)',
      'Eén voet naar voren over de rand',
      'Zak langzaam (3-4 sec) door steun-knie te buigen',
      'Raak de grond licht met de hiel',
      'Kom terug door actief door steun-voet te drukken',
    ],
    muscleLoads: { Quadriceps: 4, Glutes: 3, Core: 2, Abductoren: 2 },
  },
  {
    name: 'Quadruped Hip Extension (Donkey Kick)',
    description: 'Geïsoleerde gluteus maximus activatie vanuit vierstand. Veilig begin-punt voor heup-extensie bij rug- of bekkeninstabiliteit.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'HIP_THRUST',
    tags: ['glutes', 'heup-extensie', 'quadruped', 'beginners'],
    instructions: [
      'Ga in vierstand — handen onder schouders, knieën onder heupen',
      'Houd knie 90° gebogen, hef been omhoog',
      'Duw hiel richting plafond zonder onderrug te kantelen',
      'Houd 1-2 sec in top, laat gecontroleerd zakken',
      'Houd core aangespannen gedurende de set',
    ],
    muscleLoads: { Glutes: 4, Hamstrings: 2, Core: 2 },
  },
  {
    name: 'Fire Hydrant',
    description: 'Vanuit vierstand heup in abductie brengen (alsof een hond bij een brandkraan). Isoleert gluteus medius en externe heup-rotatoren.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'ISOLATION_LOWER',
    tags: ['fire hydrant', 'gluteus medius', 'abductie', 'heup'],
    instructions: [
      'Ga in vierstand met knie 90° gebogen',
      'Hef knie zijwaarts op zonder lichaam mee te kantelen',
      'Stop wanneer dij parallel is aan de grond',
      'Houd 1-2 sec, laat langzaam zakken',
      'Houd heupen vierkant, geen rotatie van de romp',
    ],
    muscleLoads: { Abductoren: 4, Glutes: 3, Core: 2 },
  },
  {
    name: 'Single Leg Wall Sit',
    description: 'Wall sit op één been — progressie van dubbele wall sit. Hoge isometrische VMO-activatie; gebruikt bij late-stage patellofemorale revalidatie.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'SQUAT',
    tags: ['isometrisch', 'VMO', 'knie', 'wall sit', 'progressie'],
    instructions: [
      'Leun met rug tegen muur in wall sit (90°)',
      'Hef één been van de grond en strek recht naar voren',
      'Houd positie vast — start met 10-15 sec per been',
      'Knie van steun-been boven enkel, niet naar voor geschoven',
    ],
    muscleLoads: { Quadriceps: 5, Glutes: 2, Core: 2 },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ANKLE REHAB
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Banded Ankle Eversion',
    description: 'Band om voet, evertie tegen weerstand — isoleert peroneus longus/brevis. Hoofd-oefening bij chronische enkel-instabiliteit na verstuiking.',
    category: 'STRENGTH',
    bodyRegion: ['ANKLE', 'FOOT'],
    difficulty: 'BEGINNER',
    loadType: 'BAND',
    isUnilateral: true,
    movementPattern: 'ISOLATION_LOWER',
    tags: ['peroneus', 'enkel', 'eversie', 'verstuiking', 'stabiliteit'],
    instructions: [
      'Zit met been gestrekt, band om voorvoet vastgemaakt aan andere zijde',
      'Draai voet naar buiten tegen de weerstand van de band',
      'Houd 1 sec vast, laat gecontroleerd terug',
      '15-20 reps per set',
    ],
    muscleLoads: { Calves: 3 },
  },
  {
    name: 'Banded Ankle Inversion',
    description: 'Band om voet, inversie tegen weerstand — tibialis posterior. Belangrijk bij post-tibial tendon dysfunctie en platvoet-klachten.',
    category: 'STRENGTH',
    bodyRegion: ['ANKLE', 'FOOT'],
    difficulty: 'BEGINNER',
    loadType: 'BAND',
    isUnilateral: true,
    movementPattern: 'ISOLATION_LOWER',
    tags: ['tibialis posterior', 'enkel', 'inversie', 'platvoet'],
    instructions: [
      'Zit met been gestrekt, band aan vaste punt aan buitenzijde',
      'Draai voet naar binnen tegen weerstand',
      'Langzame, gecontroleerde beweging',
      '15-20 reps per set',
    ],
    muscleLoads: { Calves: 3 },
  },
  {
    name: 'Heel Walks',
    description: 'Lopen op de hielen — versterkt tibialis anterior. Gebruikt bij shin splints, voet-drop en post-enkelrevalidatie voor dorsiflexie-kracht.',
    category: 'STRENGTH',
    bodyRegion: ['ANKLE', 'FOOT'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    tags: ['tibialis anterior', 'hiel', 'shin splints', 'enkel'],
    instructions: [
      'Hef de voorvoet zover mogelijk op',
      'Loop 20-30 meter alleen op de hielen',
      'Houd de tenen goed omhoog',
      'Rust en herhaal 3-4 sets',
    ],
    muscleLoads: { Calves: 2 },
  },
  {
    name: 'Toe Walks',
    description: 'Lopen op de tenen — plantarflexoren (gastrocnemius/soleus) en voet-intrinsieken. Nuttig bij Achilles-revalidatie in latere fase.',
    category: 'STRENGTH',
    bodyRegion: ['ANKLE', 'FOOT'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    tags: ['gastrocnemius', 'soleus', 'tenen', 'Achilles', 'enkel'],
    instructions: [
      'Ga op de voorvoet staan, hielen hoog',
      'Loop 20-30 meter op je tenen',
      'Houd core aangespannen voor balans',
      'Rust en herhaal 3-4 sets',
    ],
    muscleLoads: { Calves: 3 },
  },
  {
    name: 'Single Leg Balance (Stork Stand)',
    description: 'Balanceren op één been — proprioceptie en enkel-stabiliteit. Progressie door ogen dicht of op kussen/balance pad te staan.',
    category: 'STABILITY',
    bodyRegion: ['ANKLE', 'KNEE', 'HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: null,
    tags: ['balans', 'proprioceptie', 'enkel', 'stabiliteit'],
    instructions: [
      'Sta op één been, ander been 90° opgetrokken',
      'Houd 30-60 sec vast',
      'Progressie: ogen dicht, dan op kussen/balance pad',
      'Knie-as zacht — niet op slot',
    ],
    muscleLoads: { Calves: 2, Quadriceps: 2, Glutes: 2, Core: 2 },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SHOULDER / SCAPULAR
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Wall Slides',
    description: 'Gecontroleerde scapulaire opwaartse rotatie tegen de muur — activeert lower trapezius en serratus anterior. Basis-oefening voor schouder-impingement en houdingscorrectie.',
    category: 'MOBILITY',
    bodyRegion: ['SHOULDER', 'THORACIC'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: false,
    movementPattern: 'PUSH_VERTICAL',
    tags: ['scapula', 'wall slide', 'schouder', 'impingement', 'houding'],
    instructions: [
      'Sta met rug tegen de muur, voeten 15 cm weg van muur',
      'Onderrug, bovenrug, achterhoofd tegen muur',
      'Elbow 90°, handen tegen muur (W-positie)',
      'Schuif armen langzaam omhoog richting Y-positie',
      'Houd contact met muur gedurende de beweging',
    ],
    muscleLoads: { Bovenrug: 3, Schouders: 2, Rotatorcuff: 2 },
  },
]

async function main() {
  console.log(`🌱 Adding ${NEW_EXERCISES.length} new rehab exercises...`)

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  })

  if (!admin) {
    throw new Error('No admin user found. Run seed.ts first.')
  }

  let created = 0
  let skipped = 0

  for (const ex of NEW_EXERCISES) {
    const existing = await prisma.exercise.findFirst({
      where: { name: { equals: ex.name, mode: 'insensitive' } },
    })

    if (existing) {
      console.log(`  ⏭  Skipped (exists): ${ex.name}`)
      skipped++
      continue
    }

    await prisma.exercise.create({
      data: {
        name: ex.name,
        description: ex.description,
        category: ex.category as ExerciseCategory,
        bodyRegion: ex.bodyRegion as BodyRegion[],
        difficulty: ex.difficulty as never,
        loadType: ex.loadType as LoadType,
        isUnilateral: ex.isUnilateral,
        movementPattern: ex.movementPattern as MovementPattern | null,
        instructions: ex.instructions,
        tags: ex.tags,
        isPublic: true,
        createdById: admin.id,
        muscleLoads: {
          create: Object.entries(ex.muscleLoads).map(([muscle, load]) => ({
            muscle,
            load,
          })),
        },
      },
    })
    created++
    console.log(`  ✔ Added: ${ex.name}`)
  }

  console.log(`\n✅ Done — ${created} new, ${skipped} already existed.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
