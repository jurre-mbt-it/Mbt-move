/**
 * Eenmalig seed-script: voegt de meest gebruikte sportschool-machine
 * oefeningen toe — selectorized strength-machines, cable-stations en de
 * standaard cardio-apparaten — met realistische muscle-loads + parameters.
 *
 * Uitgevoerd als ADMIN → oefeningen worden globaal (`isPublic=true`) zonder
 * praktijk-scope. Niet-admin → praktijk-gescoped (isPublic=false).
 *
 * loadType = MACHINE voor alle krachtmachines en cable-stations (er is geen
 * aparte CABLE-waarde in de enum; een cable-tower is gym-apparatuur → MACHINE).
 * Cardio-apparaten krijgen category CARDIO + defaultRepUnit 'min'.
 *
 * Idempotent: skipt op exacte naam-match (case-insensitive).
 *
 * Run: npx tsx scripts/seed-machine-exercises.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local'), override: true })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

type Category = 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'
type BodyRegion = 'KNEE' | 'SHOULDER' | 'BACK' | 'ANKLE' | 'HIP' | 'FULL_BODY' | 'CERVICAL' | 'THORACIC' | 'LUMBAR' | 'ELBOW' | 'WRIST' | 'FOOT'
type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
type LoadType = 'BODYWEIGHT' | 'WEIGHTED' | 'MACHINE' | 'BAND'
type MovementPattern =
  | 'SQUAT' | 'LUNGE' | 'HINGE'
  | 'PUSH_HORIZONTAL' | 'PUSH_VERTICAL'
  | 'PULL_HORIZONTAL' | 'PULL_VERTICAL'
  | 'HIP_THRUST' | 'CALF_RAISE'
  | 'CORE' | 'ROTATION'
  | 'ISOLATION_UPPER' | 'ISOLATION_LOWER'
  | 'CARRY' | 'FULL_BODY'

type Spec = {
  name: string
  description: string
  category: Category
  bodyRegion: BodyRegion[]
  difficulty: Difficulty
  loadType: LoadType
  isUnilateral: boolean
  movementPattern: MovementPattern | null
  muscleLoads: Record<string, number>
  instructions: string[]
  tips: string[]
  tags: string[]
  /** Compound machine-lift → log werkgewicht / 1RM. */
  trackOneRepMax?: boolean
  /** 'min' voor cardio-apparaten, anders default 'reps'. */
  defaultRepUnit?: string
}

const SPECS: Spec[] = [
  // ─────────────────────────── BENEN / ONDERLICHAAM ───────────────────────────
  {
    name: 'Leg Press (Machine)',
    description: 'Zittende beenpers — duw het gewichtsplatform weg met beide benen. Belangrijkste compound-machine voor quadriceps, glutes en hamstrings met lage belasting op de rug.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE', 'HIP'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'SQUAT',
    muscleLoads: { 'Quadriceps': 5, 'Glutes': 4, 'Hamstrings': 3, 'Adductoren': 2 },
    instructions: [
      'Stel de rugleuning in zodat je heupen ~90° gebogen zijn.',
      'Plaats je voeten op schouderbreedte op het platform.',
      'Duw het platform weg tot je knieën bijna gestrekt zijn (niet op slot).',
      'Laat gecontroleerd terug tot ~90° kniebuiging, herhaal.',
    ],
    tips: ['Knieën in lijn met de tenen — niet naar binnen laten vallen.', 'Onderrug tegen de leuning houden; niet je bekken laten kantelen.'],
    tags: ['leg press', 'beenpers', 'quadriceps', 'glutes', 'machine', 'benen'],
    trackOneRepMax: true,
  },
  {
    name: 'Hack Squat (Machine)',
    description: 'Geleide squat onder een hoek op de hackmachine. Diepe quad-belasting met rugsteun en gefixeerd bewegingspad.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE', 'HIP'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'SQUAT',
    muscleLoads: { 'Quadriceps': 5, 'Glutes': 4, 'Hamstrings': 2 },
    instructions: [
      'Plaats je schouders onder de kussens en rug plat tegen de leuning.',
      'Voeten op schouderbreedte, iets naar voren op het platform.',
      'Ontgrendel de veiligheidspallen en zak gecontroleerd tot ~90°.',
      'Duw door de hielen omhoog tot bijna gestrekt, herhaal.',
    ],
    tips: ['Hou je hele rug tegen de leuning gedrukt.', 'Voeten hoger op het platform = meer glute/hamstring, lager = meer quad.'],
    tags: ['hack squat', 'squat', 'quadriceps', 'machine', 'benen'],
    trackOneRepMax: true,
  },
  {
    name: 'Leg Extension (Machine)',
    description: 'Zittende kniestrekking tegen weerstand — isolatie van de quadriceps. Veel gebruikt in knie-revalidatie voor gecontroleerde open-keten belasting.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Quadriceps': 5 },
    instructions: [
      'Ga zitten met de rolkussen net boven de enkels.',
      'Stel de rugleuning zo in dat je knie-as op de draaias van de machine ligt.',
      'Strek je knieën gecontroleerd tot volledige extensie.',
      'Laat langzaam terug tot ~90°, herhaal.',
    ],
    tips: ['Niet zwaaien — beweging puur vanuit de quadriceps.', 'Bij knieklachten ROM beperken op advies van de therapeut.'],
    tags: ['leg extension', 'kniestrekking', 'quadriceps', 'machine', 'knie revalidatie', 'open keten'],
  },
  {
    name: 'Lying Leg Curl (Machine)',
    description: 'Liggend de knie buigen tegen weerstand — isolatie van de hamstrings. Standaard bij hamstring-versterking en -revalidatie.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE', 'HIP'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Hamstrings': 5, 'Gluteus Maximus': 2 },
    instructions: [
      'Ga voorover liggen, rolkussen net boven de hielen.',
      'Pak de handvatten en houd je heupen tegen de bank.',
      'Buig je knieën en trek de hielen richting de billen.',
      'Laat gecontroleerd terug tot bijna gestrekt, herhaal.',
    ],
    tips: ['Hou je heupen op de bank — niet je billen omhoog laten komen.', 'Volledige controle in de excentrische fase.'],
    tags: ['leg curl', 'hamstring curl', 'hamstrings', 'machine', 'kniebuiging'],
  },
  {
    name: 'Seated Leg Curl (Machine)',
    description: 'Zittende variant van de hamstring curl. Gemakkelijker stabiliseren dan liggend; goede keuze voor hamstring-isolatie.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE', 'HIP'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Hamstrings': 5 },
    instructions: [
      'Ga zitten met de benen gestrekt, rolkussen onder de kuiten.',
      'Zet de heupkussen vast zodat je bekken niet kan optillen.',
      'Buig je knieën en duw de kussens naar beneden/achter.',
      'Laat gecontroleerd terug, herhaal.',
    ],
    tips: ['Bekken vast onder het kussen — stabiliteit eerst.', 'Knijp de hamstrings aan op het diepste punt.'],
    tags: ['leg curl', 'hamstring curl', 'hamstrings', 'machine', 'zittend'],
  },
  {
    name: 'Hip Abduction (Machine)',
    description: 'Zittende abductiemachine — benen tegen weerstand naar buiten duwen. Gericht op gluteus medius en de heupabductoren.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Gluteus Medius': 5, 'Abductoren': 4, 'Gluteus Maximus': 2 },
    instructions: [
      'Ga zitten met de kussens aan de buitenzijde van je dijen.',
      'Duw je knieën gecontroleerd naar buiten tot het eindbereik.',
      'Korte pauze, laat langzaam terug naar het midden.',
      'Herhaal volgens prescriptie.',
    ],
    tips: ['Romp rechtop, niet meeleunen.', 'Iets voorover leunen accentueert de gluteus medius.'],
    tags: ['hip abduction', 'abductie', 'gluteus medius', 'glute med', 'machine', 'heup'],
  },
  {
    name: 'Hip Adduction (Machine)',
    description: 'Zittende adductiemachine — benen tegen weerstand naar elkaar toe duwen. Versterkt de adductoren; veel gebruikt bij lies-/adductorklachten.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Adductoren': 5 },
    instructions: [
      'Ga zitten met de kussens aan de binnenzijde van je dijen.',
      'Begin met de benen gespreid in een comfortabele rek.',
      'Duw je knieën gecontroleerd naar elkaar toe.',
      'Laat langzaam terug naar gespreide stand, herhaal.',
    ],
    tips: ['Start-ROM rustig opbouwen bij liesklachten.', 'Geen schokkende bewegingen aan het eindbereik.'],
    tags: ['hip adduction', 'adductie', 'adductoren', 'machine', 'lies', 'heup'],
  },
  {
    name: 'Seated Calf Raise (Machine)',
    description: 'Zittende kuitheffing met gebogen knie — accentueert de soleus. Belangrijk voor enkel-/kuit-revalidatie en uithoudingsvermogen.',
    category: 'STRENGTH',
    bodyRegion: ['ANKLE', 'FOOT'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'CALF_RAISE',
    muscleLoads: { 'Soleus': 5, 'Gastrocnemius': 3 },
    instructions: [
      'Ga zitten met de voorvoeten op de tree, kussens op de dijen.',
      'Ontgrendel de pal en laat de hielen onder de tree zakken (rek).',
      'Duw door de voorvoeten omhoog tot maximale plantairflexie.',
      'Laat gecontroleerd terug, herhaal.',
    ],
    tips: ['Gebogen knie → soleus doet het meeste werk.', 'Volledige range: diep zakken, hoog opduwen.'],
    tags: ['calf raise', 'kuitheffing', 'soleus', 'kuit', 'machine', 'enkel'],
  },
  {
    name: 'Standing Calf Raise (Machine)',
    description: 'Staande kuitheffing met gestrekte knie op de machine — accentueert de gastrocnemius.',
    category: 'STRENGTH',
    bodyRegion: ['ANKLE', 'FOOT'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'CALF_RAISE',
    muscleLoads: { 'Gastrocnemius': 5, 'Soleus': 3 },
    instructions: [
      'Plaats je schouders onder de kussens, voorvoeten op de tree.',
      'Laat je hielen gecontroleerd onder de tree zakken voor de rek.',
      'Duw recht omhoog tot maximale plantairflexie, knieën gestrekt.',
      'Laat langzaam terug, herhaal.',
    ],
    tips: ['Knieën gestrekt → gastrocnemius onder spanning.', 'Niet wippen — gecontroleerd tempo.'],
    tags: ['calf raise', 'kuitheffing', 'gastrocnemius', 'kuit', 'machine', 'staand'],
  },
  {
    name: 'Glute Kickback (Machine)',
    description: 'Eén been tegen weerstand naar achter strekken op de glute-machine. Isolatie van de gluteus maximus.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: true,
    movementPattern: 'HIP_THRUST',
    muscleLoads: { 'Gluteus Maximus': 5, 'Glutes': 4, 'Hamstrings': 3 },
    instructions: [
      'Plaats de voet op het platform, romp tegen de steun.',
      'Strek het been gecontroleerd naar achter vanuit de heup.',
      'Knijp de bil aan op het eindbereik, korte pauze.',
      'Laat langzaam terug, wissel been na de set.',
    ],
    tips: ['Beweging vanuit de heup, niet vanuit de onderrug.', 'Geen holle rug op het topmoment.'],
    tags: ['glute kickback', 'heupextensie', 'gluteus maximus', 'bilspier', 'machine', 'heup'],
  },
  {
    name: 'Smith Machine Squat',
    description: 'Squat met de stang in het geleide pad van de Smith-machine. Stabieler dan een vrije squat; goed instappunt voor squat-belasting.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE', 'HIP'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'SQUAT',
    muscleLoads: { 'Quadriceps': 5, 'Glutes': 4, 'Hamstrings': 3, 'Core': 2 },
    instructions: [
      'Plaats de stang op je bovenrug, voeten iets voor de stang.',
      'Draai de stang los uit de haken.',
      'Zak gecontroleerd tot je dijen ~horizontaal zijn.',
      'Duw door de hielen omhoog, herhaal.',
    ],
    tips: ['Voeten iets naar voren → minder kniebelasting.', 'Vergrendel de stang direct als je rompvorm wegvalt.'],
    tags: ['smith machine', 'squat', 'quadriceps', 'glutes', 'machine', 'benen'],
    trackOneRepMax: true,
  },

  // ─────────────────────────── BOVENLICHAAM — DUWEN ───────────────────────────
  {
    name: 'Chest Press (Machine)',
    description: 'Zittende borstpers — duw de handvatten naar voren. Compound-machine voor de borst met gefixeerd, veilig bewegingspad.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PUSH_HORIZONTAL',
    muscleLoads: { 'Pectoralis Major': 5, 'Anterior Deltoid': 3, 'Triceps': 3 },
    instructions: [
      'Stel de stoel zo in dat de handvatten op borsthoogte zitten.',
      'Pak de handvatten, schouderbladen licht ingetrokken.',
      'Duw de handvatten naar voren tot bijna gestrekt (niet op slot).',
      'Laat gecontroleerd terug tot de borst rek voelt, herhaal.',
    ],
    tips: ['Schouderbladen tegen de leuning houden.', 'Polsen recht boven de ellebogen.'],
    tags: ['chest press', 'borstpers', 'pectoralis', 'borst', 'machine', 'duwen'],
    trackOneRepMax: true,
  },
  {
    name: 'Incline Chest Press (Machine)',
    description: 'Borstpers onder een opwaartse hoek — accentueert de bovenkant van de borst en de voorste schouders.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PUSH_HORIZONTAL',
    muscleLoads: { 'Pectoralis Major': 4, 'Anterior Deltoid': 4, 'Triceps': 3 },
    instructions: [
      'Ga zitten in de schuine borstpers, handvatten iets boven schouderhoogte.',
      'Schouderbladen tegen de leuning, romp stabiel.',
      'Duw schuin omhoog tot bijna gestrekt.',
      'Laat gecontroleerd terug, herhaal.',
    ],
    tips: ['Niet doordrukken op slot in de ellebogen.', 'Bij schouderklachten ROM beperken.'],
    tags: ['incline chest press', 'borstpers', 'bovenste borst', 'pectoralis', 'machine', 'duwen'],
    trackOneRepMax: true,
  },
  {
    name: 'Pec Deck / Butterfly (Machine)',
    description: 'Zittende borst-fly — armen gestrekt tegen weerstand naar elkaar toe brengen. Isolatie van de borst.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    muscleLoads: { 'Pectoralis Major': 5, 'Anterior Deltoid': 2 },
    instructions: [
      'Stel de stoel zo in dat de kussens op borsthoogte zitten.',
      'Onderarmen of handvatten tegen de kussens, ellebogen licht gebogen.',
      'Breng de kussens gecontroleerd naar elkaar toe vóór je borst.',
      'Laat langzaam terug tot de borst rek voelt, herhaal.',
    ],
    tips: ['Beweging vanuit de borst, niet uit de ellebogen knijpen.', 'Geen overstrekking achter het lichaam bij schouderklachten.'],
    tags: ['pec deck', 'butterfly', 'borst fly', 'pectoralis', 'machine', 'isolatie'],
  },
  {
    name: 'Shoulder Press (Machine)',
    description: 'Zittende schouderpers — duw de handvatten boven het hoofd. Compound-machine voor de schouders met rugsteun.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PUSH_VERTICAL',
    muscleLoads: { 'Anterior Deltoid': 5, 'Schouders lateraal': 3, 'Triceps': 3 },
    instructions: [
      'Stel de stoel zo in dat de handvatten op schouderhoogte starten.',
      'Pak de handvatten, rug tegen de leuning.',
      'Duw recht omhoog tot bijna gestrekt (niet op slot).',
      'Laat gecontroleerd terug tot schouderhoogte, herhaal.',
    ],
    tips: ['Onderrug neutraal tegen de leuning — niet hol trekken.', 'Schouders laag houden, niet optrekken naar de oren.'],
    tags: ['shoulder press', 'schouderpers', 'deltoideus', 'schouder', 'machine', 'duwen'],
    trackOneRepMax: true,
  },
  {
    name: 'Triceps Pushdown (Cable)',
    description: 'Staande triceps-pushdown aan de kabel — strek de ellebogen tegen weerstand naar beneden. Isolatie van de triceps.',
    category: 'STRENGTH',
    bodyRegion: ['ELBOW'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    muscleLoads: { 'Triceps': 5 },
    instructions: [
      'Stel de katrol hoog in, pak de stang of het touw.',
      'Ellebogen langs het lichaam, onderarmen horizontaal.',
      'Strek de ellebogen volledig naar beneden.',
      'Laat gecontroleerd terug tot ~90°, herhaal.',
    ],
    tips: ['Bovenarmen stil langs het lichaam — alleen de onderarm beweegt.', 'Niet voorover leunen om gewicht mee te duwen.'],
    tags: ['triceps pushdown', 'kabel', 'triceps', 'cable', 'isolatie', 'elleboog'],
  },
  {
    name: 'Triceps Extension (Machine)',
    description: 'Zittende triceps-machine — ellebogen tegen weerstand strekken. Geleide isolatie van de triceps.',
    category: 'STRENGTH',
    bodyRegion: ['ELBOW'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    muscleLoads: { 'Triceps': 5 },
    instructions: [
      'Ga zitten met de bovenarmen op het kussen, handvatten vast.',
      'Strek de ellebogen gecontroleerd tot vrijwel volledige extensie.',
      'Korte pauze, laat langzaam terug.',
      'Herhaal volgens prescriptie.',
    ],
    tips: ['Bovenarmen blijven op het kussen liggen.', 'Geen schokkende eindbeweging.'],
    tags: ['triceps extension', 'triceps', 'machine', 'isolatie', 'elleboog'],
  },
  {
    name: 'Assisted Dip (Machine)',
    description: 'Dip met geassisteerd tegengewicht — duw jezelf omhoog tussen de barren. De machine neemt een deel van je lichaamsgewicht over.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER', 'ELBOW'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PUSH_VERTICAL',
    muscleLoads: { 'Triceps': 4, 'Pectoralis Major': 4, 'Anterior Deltoid': 3 },
    instructions: [
      'Stel het assist-gewicht in (hoger = meer ondersteuning).',
      'Plaats knieën of voeten op het assist-platform, pak de barren.',
      'Zak gecontroleerd tot de ellebogen ~90° zijn.',
      'Duw jezelf omhoog tot bijna gestrekt, herhaal.',
    ],
    tips: ['Niet te diep zakken bij schouderklachten.', 'Meer assist-gewicht = lichtere oefening; bouw af naarmate je sterker wordt.'],
    tags: ['assisted dip', 'dips', 'triceps', 'borst', 'machine', 'geassisteerd'],
  },
  {
    name: 'Cable Fly',
    description: 'Staande borst-fly aan de dubbele kabel — armen vóór het lichaam naar elkaar toe brengen. Constante spanning over de hele beweging.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    muscleLoads: { 'Pectoralis Major': 5, 'Anterior Deltoid': 3 },
    instructions: [
      'Stel beide katrollen op borsthoogte in, pak een handvat in elke hand.',
      'Stap iets naar voren, ellebogen licht gebogen.',
      'Breng de handen in een boog naar elkaar toe vóór je borst.',
      'Laat gecontroleerd terug tot de borst rek voelt, herhaal.',
    ],
    tips: ['Vaste elleboog-hoek — beweging vanuit de schouder/borst.', 'Romp stabiel, niet meedraaien.'],
    tags: ['cable fly', 'kabel fly', 'borst', 'pectoralis', 'cable', 'isolatie'],
  },

  // ─────────────────────────── BOVENLICHAAM — TREKKEN ───────────────────────────
  {
    name: 'Lat Pulldown (Cable)',
    description: 'Zittende lat-pulldown — trek de stang naar je borst. Belangrijkste verticale trekoefening voor de latissimus en de bovenrug.',
    category: 'STRENGTH',
    bodyRegion: ['BACK', 'SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PULL_VERTICAL',
    muscleLoads: { 'Latissimus Dorsi': 5, 'Teres Major': 3, 'Biceps': 3, 'Posterior Deltoid': 2 },
    instructions: [
      'Zet de dijkussens vast, pak de stang iets breder dan schouderbreedte.',
      'Romp licht achterover, borst omhoog.',
      'Trek de stang naar je bovenborst, ellebogen naar beneden/achter.',
      'Laat gecontroleerd terug tot de armen gestrekt zijn, herhaal.',
    ],
    tips: ['Begin met het zakken van de schouderbladen, dán pas trekken.', 'Niet ver achterover zwaaien om gewicht mee te trekken.'],
    tags: ['lat pulldown', 'pulldown', 'latissimus', 'rug', 'cable', 'trekken', 'verticaal'],
    trackOneRepMax: true,
  },
  {
    name: 'Seated Cable Row',
    description: 'Zittende roeibeweging aan de kabel — trek het handvat naar je buik. Horizontale trekoefening voor de midden-rug.',
    category: 'STRENGTH',
    bodyRegion: ['BACK'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PULL_HORIZONTAL',
    muscleLoads: { 'Latissimus Dorsi': 4, 'Rhomboids': 4, 'Trapezius': 3, 'Biceps': 3, 'Posterior Deltoid': 2 },
    instructions: [
      'Ga zitten met de voeten op de steunen, lichte kniebuiging.',
      'Pak het handvat, rug recht en romp rechtop.',
      'Trek het handvat naar je onderbuik, knijp de schouderbladen samen.',
      'Laat gecontroleerd terug tot de armen gestrekt zijn, herhaal.',
    ],
    tips: ['Rug recht houden — niet vanuit de onderrug heen en weer wiegen.', 'Schouderbladen samenknijpen op het eindpunt.'],
    tags: ['seated row', 'cable row', 'roeien', 'rug', 'rhomboids', 'cable', 'trekken', 'horizontaal'],
    trackOneRepMax: true,
  },
  {
    name: 'Seated Row (Machine)',
    description: 'Zittende roeimachine met borststeun — trek de handvatten naar je toe. Horizontale trekoefening met gefixeerd pad en minder rugbelasting.',
    category: 'STRENGTH',
    bodyRegion: ['BACK'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PULL_HORIZONTAL',
    muscleLoads: { 'Latissimus Dorsi': 4, 'Rhomboids': 4, 'Trapezius': 3, 'Posterior Deltoid': 3, 'Biceps': 2 },
    instructions: [
      'Stel de borststeun zo in dat je net bij de handvatten kunt.',
      'Borst tegen het kussen, pak de handvatten.',
      'Trek de handvatten naar je toe, knijp de schouderbladen samen.',
      'Laat gecontroleerd terug, herhaal.',
    ],
    tips: ['Borst tegen de steun = onderrug ontlast.', 'Trek vanuit de rug, niet alleen met de armen.'],
    tags: ['seated row machine', 'roeimachine', 'rug', 'rhomboids', 'machine', 'trekken', 'horizontaal'],
    trackOneRepMax: true,
  },
  {
    name: 'Assisted Pull-up (Machine)',
    description: 'Pull-up met geassisteerd tegengewicht — trek jezelf op aan de stang terwijl de machine een deel van je gewicht overneemt.',
    category: 'STRENGTH',
    bodyRegion: ['BACK', 'SHOULDER'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PULL_VERTICAL',
    muscleLoads: { 'Latissimus Dorsi': 5, 'Biceps': 3, 'Teres Major': 3, 'Posterior Deltoid': 2 },
    instructions: [
      'Stel het assist-gewicht in (hoger = meer ondersteuning).',
      'Plaats de knieën of voeten op het assist-platform, pak de stang.',
      'Trek jezelf op tot je kin bij de stang is.',
      'Laat gecontroleerd zakken tot de armen gestrekt zijn, herhaal.',
    ],
    tips: ['Begin met het intrekken van de schouderbladen.', 'Bouw het assist-gewicht af naarmate je sterker wordt.'],
    tags: ['assisted pull-up', 'pull-up', 'optrekken', 'latissimus', 'rug', 'machine', 'geassisteerd'],
  },
  {
    name: 'Reverse Pec Deck (Machine)',
    description: 'Zittende rear-delt fly — armen tegen weerstand naar achter spreiden. Gericht op de achterste schouders en de bovenrug.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER', 'THORACIC'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    muscleLoads: { 'Posterior Deltoid': 5, 'Rhomboids': 3, 'Trapezius': 3 },
    instructions: [
      'Ga andersom zitten met de borst tegen het kussen.',
      'Pak de handvatten, armen vóór je gestrekt.',
      'Spreid de armen in een boog naar achter, knijp de schouderbladen.',
      'Laat gecontroleerd terug naar voren, herhaal.',
    ],
    tips: ['Lichte elleboogbuiging, vast gehouden.', 'Schouders laag — niet optrekken tijdens het spreiden.'],
    tags: ['reverse pec deck', 'rear delt', 'achterste schouder', 'rhomboids', 'machine', 'houding'],
  },
  {
    name: 'Biceps Curl (Machine)',
    description: 'Zittende biceps-machine met armsteun — buig de ellebogen tegen weerstand. Geleide isolatie van de biceps.',
    category: 'STRENGTH',
    bodyRegion: ['ELBOW'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    muscleLoads: { 'Biceps': 5, 'Wrist Flexors': 2 },
    instructions: [
      'Ga zitten met de bovenarmen op het schuine kussen.',
      'Pak de handvatten, armen vrijwel gestrekt.',
      'Buig de ellebogen en breng de handvatten omhoog.',
      'Laat langzaam terug tot bijna gestrekt, herhaal.',
    ],
    tips: ['Bovenarmen blijven op het kussen.', 'Volledige controle in de excentrische fase.'],
    tags: ['biceps curl', 'biceps', 'machine', 'isolatie', 'elleboog'],
  },
  {
    name: 'Cable Biceps Curl',
    description: 'Staande biceps-curl aan de kabel — buig de ellebogen tegen constante kabelspanning.',
    category: 'STRENGTH',
    bodyRegion: ['ELBOW'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    muscleLoads: { 'Biceps': 5, 'Wrist Flexors': 2 },
    instructions: [
      'Stel de katrol laag in, pak de stang met de handpalmen omhoog.',
      'Ellebogen langs het lichaam, romp rechtop.',
      'Buig de ellebogen en breng de stang naar de schouders.',
      'Laat gecontroleerd terug, herhaal.',
    ],
    tips: ['Ellebogen stil langs het lichaam.', 'Niet met de rug meezwaaien.'],
    tags: ['cable curl', 'biceps curl', 'biceps', 'cable', 'kabel', 'isolatie'],
  },
  {
    name: 'Face Pull (Cable)',
    description: 'Kabel-face-pull op gezichtshoogte — trek het touw naar het gezicht met hoge ellebogen. Versterkt de achterste schouders en bovenrug; populaire houdings-/schouderoefening.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER', 'THORACIC'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PULL_HORIZONTAL',
    muscleLoads: { 'Posterior Deltoid': 4, 'Rotator Cuff': 3, 'Trapezius': 3, 'Rhomboids': 3 },
    instructions: [
      'Stel de katrol op ~gezichtshoogte in, pak het touw met beide handen.',
      'Stap achteruit tot lichte spanning, armen gestrekt.',
      'Trek het touw naar je gezicht, ellebogen hoog en naar buiten.',
      'Laat gecontroleerd terug, herhaal.',
    ],
    tips: ['Ellebogen blijven hoog tijdens de trek.', 'Externe rotatie aan het eind activeert de rotator cuff.'],
    tags: ['face pull', 'kabel', 'achterste schouder', 'rotator cuff', 'houding', 'cable', 'schouder'],
  },

  // ─────────────────────────── RUG / CORE MACHINES ───────────────────────────
  {
    name: 'Back Extension (Machine)',
    description: 'Zittende rugextensie-machine — strek de romp tegen weerstand naar achter. Versterkt de rugstrekkers (erector spinae) op een geleid pad.',
    category: 'STRENGTH',
    bodyRegion: ['LUMBAR', 'BACK'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'HINGE',
    muscleLoads: { 'Erector Spinae': 5, 'Gluteus Maximus': 3, 'Hamstrings': 3 },
    instructions: [
      'Ga zitten met de bovenrug tegen het kussen, voeten vast.',
      'Duw de romp gecontroleerd naar achter tot lichte extensie.',
      'Korte pauze, laat langzaam terug naar voren.',
      'Herhaal volgens prescriptie.',
    ],
    tips: ['Geen overstrekking — rustig binnen comfortabele range.', 'Bij acute lage rugklachten alleen op advies inzetten.'],
    tags: ['back extension', 'rugextensie', 'erector spinae', 'lage rug', 'machine', 'rug'],
  },
  {
    name: 'Abdominal Crunch (Machine)',
    description: 'Zittende crunch-machine — buig de romp tegen weerstand naar voren. Geleide isolatie van de rechte buikspier.',
    category: 'STRENGTH',
    bodyRegion: ['LUMBAR'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'CORE',
    muscleLoads: { 'Rectus Abdominis': 5, 'Obliques': 3, 'Core': 3 },
    instructions: [
      'Ga zitten met het borstkussen of de handvatten vast.',
      'Buig de romp naar voren door de buikspieren aan te spannen.',
      'Korte pauze in de samentrekking.',
      'Laat gecontroleerd terug, herhaal.',
    ],
    tips: ['Beweging vanuit de buik — niet met de armen trekken.', 'Rustig tempo, geen schokken.'],
    tags: ['abdominal crunch', 'crunch', 'buikspieren', 'rectus abdominis', 'core', 'machine'],
  },
  {
    name: 'Rotary Torso (Machine)',
    description: 'Zittende rotatie-machine — draai de romp tegen weerstand. Gericht op de schuine buikspieren en romprotatie.',
    category: 'STRENGTH',
    bodyRegion: ['LUMBAR', 'THORACIC'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: true,
    movementPattern: 'ROTATION',
    muscleLoads: { 'Obliques': 5, 'Core': 4, 'Transversus Abdominis': 3 },
    instructions: [
      'Ga zitten met het bovenlichaam vastgezet tegen de kussens.',
      'Draai de romp gecontroleerd naar één kant.',
      'Korte pauze, draai langzaam terug naar het midden.',
      'Herhaal en wissel daarna van kant.',
    ],
    tips: ['Lichte, gecontroleerde range — geen geforceerde eindrotatie.', 'Voorzichtig bij lage rugklachten; alleen op advies.'],
    tags: ['rotary torso', 'rotatie', 'obliques', 'schuine buikspieren', 'core', 'machine'],
  },
  {
    name: 'Cable Woodchopper',
    description: 'Staande diagonale kabel-beweging — trek het handvat van hoog naar laag (of andersom) dwars over het lichaam. Functionele anti-rotatie/rotatie voor de core.',
    category: 'STRENGTH',
    bodyRegion: ['LUMBAR', 'THORACIC', 'FULL_BODY'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: true,
    movementPattern: 'ROTATION',
    muscleLoads: { 'Obliques': 5, 'Core': 4, 'Transversus Abdominis': 3, 'Schouders lateraal': 2 },
    instructions: [
      'Stel de katrol hoog in, pak het handvat met beide handen.',
      'Sta zijwaarts van de katrol, voeten op schouderbreedte.',
      'Trek het handvat diagonaal omlaag dwars over je lichaam.',
      'Keer gecontroleerd terug, wissel na de set van kant.',
    ],
    tips: ['Draai vanuit de romp, niet alleen met de armen.', 'Heupen en knieën mogen licht meedraaien.'],
    tags: ['woodchopper', 'kabel', 'rotatie', 'obliques', 'core', 'functioneel', 'cable'],
  },

  // ─────────────────────────── CARDIO-APPARATEN ───────────────────────────
  {
    name: 'Treadmill (Loopband)',
    description: 'Lopen of hardlopen op de loopband met instelbare snelheid en hellingshoek. Standaard cardio-apparaat voor conditie en loopbelasting-opbouw.',
    category: 'CARDIO',
    bodyRegion: ['FULL_BODY'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'FULL_BODY',
    muscleLoads: { 'Quadriceps': 3, 'Hamstrings': 3, 'Gastrocnemius': 3, 'Glutes': 3 },
    instructions: [
      'Stap op de band en start op een rustige wandelsnelheid.',
      'Bouw snelheid en/of helling geleidelijk op tot de doelintensiteit.',
      'Houd een rechtopstaande houding, blik vooruit.',
      'Bouw aan het eind af tot wandelen voor een cooldown.',
    ],
    tips: ['Niet aan de leuningen hangen — dat vermindert de belasting.', 'Helling verhogen is gewrichtsvriendelijker dan harder rennen.'],
    tags: ['treadmill', 'loopband', 'cardio', 'hardlopen', 'conditie', 'machine'],
    defaultRepUnit: 'min',
  },
  {
    name: 'Stationary Bike (Hometrainer)',
    description: 'Fietsen op de hometrainer met instelbare weerstand. Gewrichtsvriendelijke cardio; veel gebruikt in knie- en heuprevalidatie.',
    category: 'CARDIO',
    bodyRegion: ['FULL_BODY', 'KNEE'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'FULL_BODY',
    muscleLoads: { 'Quadriceps': 3, 'Hamstrings': 2, 'Glutes': 2, 'Gastrocnemius': 2 },
    instructions: [
      'Stel de zadelhoogte in zodat je knie licht gebogen is onderaan de trap.',
      'Begin met een lichte weerstand op een comfortabele cadans.',
      'Bouw weerstand of cadans op tot de doelintensiteit.',
      'Bouw aan het eind af voor een cooldown.',
    ],
    tips: ['Zadelhoogte goed instellen voorkomt knieklachten.', 'Soepel doortrappen, niet stampen.'],
    tags: ['stationary bike', 'hometrainer', 'fietsen', 'cardio', 'knie revalidatie', 'machine'],
    defaultRepUnit: 'min',
  },
  {
    name: 'Rowing Ergometer (Roeimachine)',
    description: 'Roeibeweging op de ergometer — full-body cardio die benen, romp en rug combineert in één vloeiende slag.',
    category: 'CARDIO',
    bodyRegion: ['FULL_BODY', 'BACK'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'FULL_BODY',
    muscleLoads: { 'Quadriceps': 3, 'Latissimus Dorsi': 3, 'Glutes': 3, 'Rhomboids': 2, 'Core': 2 },
    instructions: [
      'Zet je voeten vast, pak de handgreep, armen gestrekt (de "catch").',
      'Duw eerst krachtig af met de benen.',
      'Leun daarna licht achterover en trek de greep naar je onderste ribben.',
      'Keer de volgorde om — armen, romp, benen — en herhaal vloeiend.',
    ],
    tips: ['Volgorde: benen → romp → armen heen, en omgekeerd terug.', 'Kracht komt vooral uit de benen, niet uit de armen.'],
    tags: ['rowing', 'roeimachine', 'ergometer', 'cardio', 'full body', 'machine'],
    defaultRepUnit: 'min',
  },
  {
    name: 'Elliptical / Cross Trainer',
    description: 'Vloeiende loop-/stapbeweging op de crosstrainer met arm- en beensturing. Cardio met zeer lage impact op de gewrichten.',
    category: 'CARDIO',
    bodyRegion: ['FULL_BODY'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'FULL_BODY',
    muscleLoads: { 'Quadriceps': 3, 'Glutes': 3, 'Hamstrings': 2, 'Gastrocnemius': 2 },
    instructions: [
      'Plaats je voeten op de pedalen, pak de bewegende handvatten.',
      'Begin met een rustige, vloeiende beweging vooruit.',
      'Bouw weerstand of tempo op tot de doelintensiteit.',
      'Bouw aan het eind af voor een cooldown.',
    ],
    tips: ['Duw én trek met de armen voor een full-body inspanning.', 'Hielen op de pedalen houden, niet alleen op de tenen.'],
    tags: ['elliptical', 'crosstrainer', 'cross trainer', 'cardio', 'low impact', 'machine'],
    defaultRepUnit: 'min',
  },
  {
    name: 'Stairmaster (Traploper)',
    description: 'Aanhoudend traplopen op de stepmill. Cardio met sterke glute- en quad-belasting.',
    category: 'CARDIO',
    bodyRegion: ['FULL_BODY', 'HIP'],
    difficulty: 'INTERMEDIATE',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'FULL_BODY',
    muscleLoads: { 'Glutes': 3, 'Quadriceps': 3, 'Hamstrings': 2, 'Gastrocnemius': 2 },
    instructions: [
      'Stap op de bewegende treden en start op een rustig tempo.',
      'Houd je romp rechtop, blik vooruit.',
      'Bouw het tempo op tot de doelintensiteit.',
      'Bouw aan het eind af voor een cooldown.',
    ],
    tips: ['Niet op de leuningen leunen — sta rechtop.', 'Hele voet op de tree plaatsen voor een volledige stap.'],
    tags: ['stairmaster', 'traploper', 'stepmill', 'cardio', 'glutes', 'machine'],
    defaultRepUnit: 'min',
  },
]

async function main() {
  const me = await prisma.user.findUnique({
    where: { email: 'jurre@movementbasedtherapy.nl' },
    select: { id: true, role: true, practiceId: true },
  })
  if (!me) throw new Error('Jurre niet gevonden — pas email aan in script')
  console.log(`Creator: ${me.id} (${me.role})`)
  const isAdmin = me.role === 'ADMIN'

  console.log(`\n— ${SPECS.length} machine-oefeningen aanmaken —`)
  let created = 0, skipped = 0
  for (const spec of SPECS) {
    const existing = await prisma.exercise.findFirst({
      where: { name: { equals: spec.name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existing) {
      console.log(`  = ${spec.name} bestaat al — skip`)
      skipped++
      continue
    }
    await prisma.exercise.create({
      data: {
        id: crypto.randomUUID(),
        name: spec.name,
        description: spec.description,
        category: spec.category,
        bodyRegion: spec.bodyRegion,
        difficulty: spec.difficulty,
        loadType: spec.loadType,
        isUnilateral: spec.isUnilateral,
        movementPattern: spec.movementPattern,
        instructions: spec.instructions,
        tips: spec.tips,
        tags: spec.tags,
        trackOneRepMax: spec.trackOneRepMax ?? false,
        defaultRepUnit: spec.defaultRepUnit ?? 'reps',
        isPublic: isAdmin,
        practiceId: isAdmin ? null : me.practiceId ?? null,
        createdById: me.id,
        muscleLoads: {
          create: Object.entries(spec.muscleLoads).map(([muscle, load]) => ({
            id: crypto.randomUUID(),
            muscle,
            load,
          })),
        },
      },
    })
    console.log(`  ✓ ${spec.name}`)
    created++
  }
  console.log(`\nKlaar: ${created} aangemaakt, ${skipped} bestaand.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
