/**
 * Seed: Melbourne VKB Revalidatie Protocol 2.0
 * Bron: Cooper R. & Hughes M. (2024). Melbourne ACL Rehabilitation Protocol 2.0.
 *        Vertaald door The Knee Community (kneecommunity.nl).
 *
 * Idempotent — upsert per `key` / `(protocolId, order)`.
 */
import { PrismaClient, RehabCriterionInputType } from '@prisma/client'
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

type CriterionSeed = {
  name: string
  testDescription: string
  reference?: string
  targetValue: string
  targetUnit?: string
  inputType: RehabCriterionInputType
  isBonus?: boolean
}

type PhaseSeed = {
  order: number
  shortName: string
  name: string
  description?: string
  keyGoals: string[]
  // Indicatieve tijdlijn t.o.v. operatie (weken). Negatief = pre-op. null = ongoing.
  typicalStartWeek: number | null
  typicalEndWeek: number | null
  criteria: CriterionSeed[]
}

const PHASES: PhaseSeed[] = [
  {
    order: 0,
    shortName: 'Pre-op',
    name: 'Pre-operatieve fase — Blessureherstel & gereed zijn voor de operatie',
    description:
      'Patiënten die vóór de operatie volledige beweeglijkheid, goede kracht en minimale zwelling behalen, hebben tot minimaal twee jaar na de operatie betere resultaten.',
    keyGoals: [
      'Afname van zwelling',
      'Volledige beweeglijkheid behalen',
      'Herwinnen van 90% van de kracht van quadriceps en hamstrings in vergelijking met de andere zijde',
    ],
    typicalStartWeek: -12,
    typicalEndWeek: 0,
    criteria: [
      {
        name: 'Passieve Knie extensie',
        testDescription:
          'Ruglig met een grote goniometer. Benige referentiepunten: trochanter major, laterale femurcondyl en laterale malleolus.',
        reference: 'Norkin & White, 1995',
        targetValue: '0°',
        targetUnit: '°',
        inputType: 'NUMERIC',
      },
      {
        name: 'Passieve Knie Flexie',
        testDescription:
          'Ruglig met een grote goniometer. Benige referentiepunten: trochanter major, laterale femurcondyl en laterale malleolus.',
        reference: 'Norkin & White, 1995',
        targetValue: '>125°',
        targetUnit: '°',
        inputType: 'NUMERIC',
      },
      {
        name: 'Zwelling / Hydrops',
        testDescription:
          'Stroke Test. Nul = geen vocht na laterale strijking. Spoortje = kleine golf. 2+ = spontaan terug naar mediaal. 3+ = te veel om weg te strijken.',
        reference: 'Sturgill et al., 2009',
        targetValue: 'Nul tot 1+',
        inputType: 'TEXT',
      },
      {
        name: 'Kracht — quadriceps & hamstrings',
        testDescription:
          'Hand-held dynamometer. Quadriceps: zit met heup en knie in 90°; dynamometer op voorzijde scheenbeen. Hamstrings: zit met heup en knie in 90°; dynamometer op kuit.',
        reference: 'Mentiplay et al., 2015',
        targetValue: '≥90% vs andere zijde',
        targetUnit: '%',
        inputType: 'NUMERIC',
      },
      {
        name: 'Single Hop Test',
        testDescription:
          'Patiënt staat op één been en springt zo ver mogelijk voorwaarts en landt op hetzelfde been. Symmetrie-index = (aangedaan / niet-aangedaan) × 100.',
        reference: 'Reid et al., 2007',
        targetValue: '≥90% vs andere zijde',
        targetUnit: '%',
        inputType: 'NUMERIC',
      },
    ],
  },
  {
    order: 1,
    shortName: 'Fase 1',
    name: 'Fase 1 — Herstel na de operatie',
    description:
      'Reconstructie van de VKB is traumatisch voor de knie. Eerste 1-2 weken: rust, mobilisatie, quadriceps activatie, koelen en compressie.',
    keyGoals: [
      'De knie volledig strekken',
      'Afname van de zwelling naar "mild" (spoortje tot 1+)',
      'De quadriceps weer aan het "vuren" krijgen',
    ],
    typicalStartWeek: 0,
    typicalEndWeek: 2,
    criteria: [
      {
        name: 'Passieve Knie extensie',
        testDescription: 'Ruglig met goniometer.',
        reference: 'Norkin & White, 1995',
        targetValue: '0°',
        targetUnit: '°',
        inputType: 'NUMERIC',
      },
      {
        name: 'Passieve Knie Flexie',
        testDescription: 'Ruglig met goniometer.',
        reference: 'Norkin & White, 1995',
        targetValue: '>125°',
        targetUnit: '°',
        inputType: 'NUMERIC',
      },
      {
        name: 'Zwelling / Hydrops',
        testDescription: 'Stroke Test.',
        reference: 'Sturgill et al., 2009',
        targetValue: 'Nul tot 1+',
        inputType: 'TEXT',
      },
      {
        name: 'Quadriceps activatie (lag-test)',
        testDescription:
          'Patiënt zit op rand behandelbank. Fysiotherapeut brengt knie naar volledige passieve extensie; patiënt houdt extensie vast na loslaten.',
        reference: 'Stillman, 2004',
        targetValue: '0–5° lag',
        targetUnit: '°',
        inputType: 'NUMERIC',
      },
    ],
  },
  {
    order: 2,
    shortName: 'Fase 2',
    name: 'Fase 2 — Kracht en Neuromusculaire Controle',
    description:
      'Kenmerkende oefeningen: lunges, step-ups, squats, bridging, calf raises, heupabductoren, core stability, balans, loopscholing en cardiotraining.',
    keyGoals: [
      'Het grotendeels herwinnen van balans op 1 been',
      'Het grotendeels herwinnen van spierkracht',
      'Het uitvoeren van de 1-benige squat met juiste techniek en alignment',
    ],
    typicalStartWeek: 2,
    typicalEndWeek: 12,
    criteria: [
      {
        name: 'Passieve Knie Extensie (Prone hang)',
        testDescription:
          'Buiklig op behandelbank met onderbenen over rand. Verschil in hielhoogte wordt gemeten (1 cm ≈ 1°).',
        reference: 'Sachs et al., 1989',
        targetValue: 'Gelijk aan andere zijde',
        inputType: 'NUMERIC',
      },
      {
        name: 'Passieve Knie Flexie',
        testDescription: 'Ruglig met goniometer.',
        reference: 'Norkin & White, 1995',
        targetValue: '>125°',
        targetUnit: '°',
        inputType: 'NUMERIC',
      },
      {
        name: 'Zwelling / Hydrops',
        testDescription: 'Stroke Test.',
        reference: 'Sturgill et al., 2009',
        targetValue: 'Nul',
        inputType: 'TEXT',
      },
      {
        name: 'Functional Alignment Test (Single Leg Squat)',
        testDescription:
          'Staand op 1 been, armen gekruist, op 20 cm hoge box. 5 langzame 1-benige squats (2s per squat). Beoordeling goed/matig/slecht.',
        reference: 'Crossley et al., 2011',
        targetValue: 'Goed',
        inputType: 'TEXT',
      },
      {
        name: 'Single Leg Bridges',
        testDescription:
          'Ruglig, één hiel op box 60 cm, test-been in 20° flexie, andere been 90° heup+knie flexie. Herhaal zo vaak mogelijk tot de oorspronkelijke hoogte niet meer gehaald wordt.',
        reference: 'Freckleton et al., 2013',
        targetValue: '>85% vs andere zijde · drempel >20 reps',
        targetUnit: 'reps',
        inputType: 'NUMERIC',
      },
      {
        name: 'Single Leg Calf Raises',
        testDescription:
          'Staand op één been op rand stepblok. Calf raise over volledig ROM (2s per raise). Tot ROM of tempo niet meer gehaald wordt.',
        reference: 'Hébert et al., 2017',
        targetValue: '>85% vs andere zijde · drempel >20 reps',
        targetUnit: 'reps',
        inputType: 'NUMERIC',
      },
      {
        name: 'Side Bridge Endurance',
        testDescription:
          'Zijlig op oefenmat, gestrekte benen, bovenste voet voor onderste. Heupen omhoog tot rechte lijn; vasthouden zo lang mogelijk.',
        reference: 'McGill et al., 1999',
        targetValue: '>85% vs andere zijde · drempel 30 s',
        targetUnit: 's',
        inputType: 'NUMERIC',
      },
      {
        name: 'Single Leg Rise (squat-to-stand)',
        testDescription:
          'Zit op stoel, test-been 90° en 10 cm van rand. Armen gekruist op borst. Zo vaak mogelijk opstaan en gaan zitten.',
        reference: 'Culvenor et al., 2016 / Thorstensson et al., 2004',
        targetValue: '>85% vs andere zijde · drempel >10 reps per been',
        targetUnit: 'reps',
        inputType: 'NUMERIC',
      },
      {
        name: 'Balans — Unipedal Stance',
        testDescription:
          'Staan op 1 been, andere been opgetild, armen gekruist. (A) ogen open, (B) ogen dicht. Stopt bij armen/voet gebruik of 45s max.',
        reference: 'Springer et al., 2007',
        targetValue: 'A: 43 s (ogen open) · B: 9 s (ogen dicht)',
        targetUnit: 's',
        inputType: 'NUMERIC',
      },
      {
        name: '1RM Single Leg Press (bonus)',
        testDescription:
          '45° incline leg press, zit 90° t.o.v. slede, heupen in 90° flexie. Geldig wanneer knie tot 90° flexie zakt en volledig strekt.',
        reference: 'Campanholi Neto et al., 2015',
        targetValue: '1.5× lichaamsgewicht',
        targetUnit: '× BW',
        inputType: 'NUMERIC',
        isBonus: true,
      },
      {
        name: '1RM Squat (bonus)',
        testDescription:
          'Front/Back/Trap Bar squat met supervisor. Squat tot 90° knieflexie en volledige extensie.',
        targetValue: '1.5× lichaamsgewicht',
        targetUnit: '× BW',
        inputType: 'NUMERIC',
        isBonus: true,
      },
    ],
  },
  {
    order: 3,
    shortName: 'Fase 3',
    name: 'Fase 3 — Hardlopen, Behendigheid en Landen',
    description:
      'Terugkeer naar hardlopen, behendigheid, springen en hoppen. De knie moet vrij zijn van pijn en zwelling. Nadruk op landingstechniek en pivoterende bewegingen.',
    keyGoals: [
      'Bereiken van uitstekende hop-prestaties (techniek, afstand, uithoudingsvermogen)',
      'Succesvol doorlopen van een behendigheidsprogramma',
      'Herwin volledige kracht en balans',
    ],
    typicalStartWeek: 12,
    typicalEndWeek: 26,
    criteria: [
      {
        name: 'Single Hop Test',
        testDescription:
          'Staan op één been, zo ver mogelijk voorwaarts springen en landen op hetzelfde been. Gemiddelde van 2 sprongen. Symmetrie-index.',
        reference: 'Noyes et al., 1991',
        targetValue: '>95% vs andere zijde · ≥ pre-op resultaat',
        targetUnit: '%',
        inputType: 'NUMERIC',
      },
      {
        name: 'Triple Hop Test',
        testDescription:
          'Staan op één been, 3 opeenvolgende hops voorwaarts op hetzelfde been. Gemiddelde van 2 pogingen. Symmetrie-index.',
        reference: 'Noyes et al., 1991',
        targetValue: '>95% vs andere zijde',
        targetUnit: '%',
        inputType: 'NUMERIC',
      },
      {
        name: 'Triple Cross Over Hop Test',
        testDescription:
          'Vlakke ondergrond, 15 cm brede strip over 6 m. 3× hop op hetzelfde been zigzag over de strip.',
        reference: 'Noyes et al., 1991',
        targetValue: '>95% vs andere zijde',
        targetUnit: '%',
        inputType: 'NUMERIC',
      },
      {
        name: 'Side Hop Test',
        testDescription:
          'Handen achter rug, 30s zoveel mogelijk zijwaartse sprongen over 2 parallelle tape-stroken op 40 cm afstand.',
        reference: 'Gustavsson et al., 2006',
        targetValue: '>95% vs andere zijde',
        targetUnit: '%',
        inputType: 'NUMERIC',
      },
      {
        name: 'Single Leg Rise (F3-drempel)',
        testDescription: 'Zit op stoel, test-been 90°, 10 cm van rand. Handen achter rug. Zo vaak mogelijk opstaan/zitten.',
        reference: 'Culvenor et al., 2016 / Thorstensson et al., 2004',
        targetValue: 'Drempel >22 reps per been',
        targetUnit: 'reps',
        inputType: 'NUMERIC',
      },
      {
        name: 'Balans (Dynamisch) — Star Excursion Balance Test',
        testDescription:
          'SEBT in anterieur, posterolateraal en posteromediaal. Gezamenlijke score × richting. Symmetrie-index.',
        reference: 'Gribble et al., 2012',
        targetValue: '>95% vs andere zijde',
        targetUnit: '%',
        inputType: 'NUMERIC',
      },
      {
        name: 'Balans — Cooper & Hughes Sports Vestibular',
        testDescription:
          'Staan op 1 been, heup-knie-enkel gebogen, handen op taille. (1) zij-naar-zij hoofd 15s @60 bpm, (2) op-en-neer hoofd 15s @60 bpm. Geslaagd als handen op taille blijven.',
        targetValue: 'Slagen — beide benen',
        inputType: 'PASS_FAIL',
      },
      {
        name: '1RM Single Leg Press (bonus)',
        testDescription: '45° incline leg press, zit 90° t.o.v. slede, heupen 90° flexie.',
        reference: 'Campanholi Neto et al., 2015',
        targetValue: '1.8× lichaamsgewicht',
        targetUnit: '× BW',
        inputType: 'NUMERIC',
        isBonus: true,
      },
      {
        name: '1RM Squat (bonus)',
        testDescription: 'Front/Back/Trap Bar squat met supervisor, tot 90° knieflexie.',
        targetValue: '1.8× lichaamsgewicht',
        targetUnit: '× BW',
        inputType: 'NUMERIC',
        isBonus: true,
      },
    ],
  },
  {
    order: 4,
    shortName: 'Fase 4',
    name: 'Fase 4 — Return to Sport',
    description:
      'Sterk geïndividualiseerd. De knie moet stabiel en sterk zijn, met optimale neuromusculaire patronen. Minimaal 9 maanden post-op wordt geadviseerd.',
    keyGoals: [
      'Melbourne Return to Sport Score ≥ 95',
      'Patient voelt zich comfortabel, zelfverzekerd en gretig om sport te hervatten (ACL-RSI & IKDC)',
      'VKB-blessurepreventieprogramma besproken en geïmplementeerd',
    ],
    typicalStartWeek: 26,
    typicalEndWeek: 52,
    criteria: [
      {
        name: 'Melbourne Return to Sport Score (MRSS2.0)',
        testDescription:
          'Beoordelingsinstrument met 6 onderdelen: Klinisch onderzoek (10), IKDC+ACL-RSI (20), TSK-11 (drempel), Functionele Tests (50), Algemene Fitheid (drempel), Functioneel Testen onder Vermoeidheid (20). Totaal /100.',
        reference: 'Cooper & Hughes, 2024',
        targetValue: '≥95',
        targetUnit: 'punten',
        inputType: 'NUMERIC',
      },
      {
        name: 'ACL-RSI Psychologische Gereedheid',
        testDescription: 'Vragenlijst over zelfvertrouwen, angst en gretigheid om sport te hervatten. ACL-RSI ≥90%.',
        reference: 'Webster et al., 2008',
        targetValue: '≥90',
        targetUnit: '%',
        inputType: 'NUMERIC',
      },
      {
        name: 'TSK-11 Kinesiofobie',
        testDescription: 'Tampa Schaal voor Kinesiofobie (11 items). Score 11–18 = pass, >18 = fail.',
        reference: 'Woby et al., 2005',
        targetValue: 'Pass (11–18)',
        inputType: 'PASS_FAIL',
      },
      {
        name: 'Blessurepreventieprogramma geïmplementeerd',
        testDescription:
          'Een evidence-based VKB-preventieprogramma is besproken, ingezet (minimaal 15 min vóór iedere training/wedstrijd) en voortgezet tijdens sport.',
        targetValue: 'Actief',
        inputType: 'PASS_FAIL',
      },
    ],
  },
  {
    order: 5,
    shortName: 'Fase 5',
    name: 'Fase 5 — Preventie van Recidief-blessure',
    description:
      'Preventieprogramma moet plyometrie, balans en krachtoefeningen bevatten. Minimaal 10 minuten vóór iedere training/wedstrijd en blijvend voortgezet.',
    keyGoals: [
      'Plyometrie, balans en krachtoefeningen opgenomen in programma',
      'Programma wordt ≥10 minuten vóór iedere training en wedstrijd uitgevoerd',
      'Programma wordt minimaal 6 weken en meerdere keren per week voortgezet',
    ],
    typicalStartWeek: 52,
    typicalEndWeek: null,
    criteria: [
      {
        name: 'Plyometrie, balans en krachtoefeningen in programma',
        testDescription:
          'Eén van de 5 erkende preventieprogrammas (Sportsmetrics, FIFA 11+, PEP, KNEE Program, FootyFirst) of vergelijkbaar protocol is opgenomen.',
        targetValue: 'Aanwezig',
        inputType: 'PASS_FAIL',
      },
      {
        name: 'Voor elke training/wedstrijd uitgevoerd (10+ min)',
        testDescription: 'Patient voert het preventieprogramma ≥10 min vóór elke training en wedstrijd uit.',
        targetValue: 'Ja',
        inputType: 'PASS_FAIL',
      },
      {
        name: 'Programma wordt voortgezet',
        testDescription: 'Programma loopt minstens 6 weken en wordt daarna blijvend onderhouden.',
        targetValue: 'Ja',
        inputType: 'PASS_FAIL',
      },
    ],
  },
]

const PROTOCOL = {
  key: 'melbourne-acl-2',
  name: 'Melbourne VKB Revalidatie Protocol 2.0',
  description:
    'Evidence-based 6-fasen protocol voor revalidatie na voorste kruisband (VKB) reconstructie, doel-gebaseerd in plaats van tijd-gebaseerd.',
  specialty: 'knee_acl',
  sourceReference:
    'Cooper R. & Hughes M. (2024). Melbourne ACL Rehabilitation Protocol 2.0. NL-vertaling: The Knee Community (kneecommunity.nl).',
}

async function main() {
  console.log('Seeding rehab protocol:', PROTOCOL.name)
  const protocol = await prisma.rehabProtocol.upsert({
    where: { key: PROTOCOL.key },
    update: {
      name: PROTOCOL.name,
      description: PROTOCOL.description,
      specialty: PROTOCOL.specialty,
      sourceReference: PROTOCOL.sourceReference,
      isActive: true,
    },
    create: PROTOCOL,
  })
  console.log('Protocol id:', protocol.id)

  let phasesCreated = 0
  let phasesUpdated = 0
  let criteriaCreated = 0
  let criteriaUpdated = 0

  for (const p of PHASES) {
    const existingPhase = await prisma.rehabPhase.findUnique({
      where: { protocolId_order: { protocolId: protocol.id, order: p.order } },
    })
    const phase = existingPhase
      ? await prisma.rehabPhase.update({
          where: { id: existingPhase.id },
          data: {
            shortName: p.shortName,
            name: p.name,
            description: p.description,
            keyGoals: p.keyGoals,
            typicalStartWeek: p.typicalStartWeek,
            typicalEndWeek: p.typicalEndWeek,
          },
        })
      : await prisma.rehabPhase.create({
          data: {
            protocolId: protocol.id,
            order: p.order,
            shortName: p.shortName,
            name: p.name,
            description: p.description,
            keyGoals: p.keyGoals,
            typicalStartWeek: p.typicalStartWeek,
            typicalEndWeek: p.typicalEndWeek,
          },
        })
    if (existingPhase) phasesUpdated++
    else phasesCreated++

    for (let i = 0; i < p.criteria.length; i++) {
      const c = p.criteria[i]
      const existingCrit = await prisma.rehabCriterion.findUnique({
        where: { phaseId_order: { phaseId: phase.id, order: i } },
      })
      if (existingCrit) {
        await prisma.rehabCriterion.update({
          where: { id: existingCrit.id },
          data: {
            name: c.name,
            testDescription: c.testDescription,
            reference: c.reference ?? null,
            targetValue: c.targetValue,
            targetUnit: c.targetUnit ?? null,
            inputType: c.inputType,
            isBonus: c.isBonus ?? false,
          },
        })
        criteriaUpdated++
      } else {
        await prisma.rehabCriterion.create({
          data: {
            phaseId: phase.id,
            order: i,
            name: c.name,
            testDescription: c.testDescription,
            reference: c.reference ?? null,
            targetValue: c.targetValue,
            targetUnit: c.targetUnit ?? null,
            inputType: c.inputType,
            isBonus: c.isBonus ?? false,
          },
        })
        criteriaCreated++
      }
    }
  }

  console.log(`Phases:   ${phasesCreated} created, ${phasesUpdated} updated`)
  console.log(`Criteria: ${criteriaCreated} created, ${criteriaUpdated} updated`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
