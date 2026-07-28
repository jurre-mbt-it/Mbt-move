/**
 * Importeer een JSON-trainingsplan als herbruikbaar plan-sjabloon
 * (WeekPlanTemplate + sjabloon-weken), zodat je het vanaf
 * /therapist/plans op de kalender van een atleet kunt zetten.
 *
 * Het bronformaat is `base-week-schedule-cardio-import-v1`: kalenderweken met
 * items die één-op-één op WeekScheduleDayItem passen, en `cardioParams` in het
 * StructuredCardio v1-formaat uit src/lib/cardio-workout.ts.
 *
 * BELANGRIJK — dit maakt géén patiëntdata aan. Een sjabloon heeft
 * `patientId: null` en `isTemplate: true`; toepassen op een atleet is een
 * aparte stap in de UI en maakt een kopie (`planTemplates.applyToPatient`).
 * De kalenderdatums uit de JSON worden dus NIET overgenomen: een sjabloon
 * kent alleen week 1..N. De volgorde van de weken en de dag-van-de-week
 * blijven behouden, dus ankeren op de streefdatum legt alles weer goed.
 *
 * Idempotent via `importMarker`: staat die al in de description van een
 * bestaand sjabloon, dan stopt het script in plaats van een duplicaat te maken.
 *
 * Draaien:
 *   node --env-file=.env.local --import tsx \
 *     scripts/import-plan-template-json.ts <bestand.json> [--owner <e-mail>] [--commit]
 * Zonder --commit is het een dry-run die alleen rapporteert.
 */
import { readFileSync } from 'node:fs'
import { prisma } from '../src/lib/prisma'
import { itemPlannedLoad } from '../src/lib/planned-load'
import { parseStructured, legacySummaryFields } from '../src/lib/cardio-workout'

/** Platte samenvattingsvelden bij een blokken-workout; {} als hij niet parst. */
function cardioLegacyFields(raw: unknown): Record<string, unknown> {
  const parsed = parseStructured(raw)
  return parsed ? legacySummaryFields(parsed) : {}
}

const createId = () => crypto.randomUUID()

// ── Bronformaat ───────────────────────────────────────────────────────────
type SourceItem = {
  sourceId?: string
  date: string
  /** 1 = maandag .. 7 = zondag. De DB telt 0..6, dus hier gaat er 1 af. */
  dayOfWeek: number
  kind: 'WORKOUT' | 'REST'
  quickCategory: string | null
  quickActivity: string | null
  quickName: string | null
  quickDurationSec: number | null
  plannedDurationSec: number | null
  plannedRpe: number | null
  notes: string | null
  cardioParams: unknown | null
}
type SourceWeek = {
  programWeek: number
  startDateLocal: string
  endDateLocal: string
  phaseType: string | null
  isDeload: boolean
  weekNote: string | null
  items: SourceItem[]
}
type Source = {
  schemaVersion: string
  importMarker: string
  program: { name: string; description?: string; startDate?: string; endDate?: string; raceDate?: string }
  weeks: SourceWeek[]
}

const VALID_KIND = new Set(['WORKOUT', 'REST'])
const VALID_CATEGORY = new Set(['STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY'])
const VALID_ACTIVITY = new Set([
  'RUNNING', 'CYCLING', 'ROWING', 'SWIMMING', 'CROSSTRAINER', 'WALKING',
  'SKIERG', 'ASSAULT_BIKE', 'WATTBIKE', 'STAIRCLIMBER', 'OTHER',
])
/** Vrije string in de DB, maar dit is de set waar de UI een label + kleur voor heeft. */
const KNOWN_PHASES = new Set(['ACCUMULATION', 'INTENSIFICATION', 'REALIZATION', 'DELOAD', 'TAPER'])
const DAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

async function main() {
  const [file, ...flags] = process.argv.slice(2)
  if (!file) fail('Geef een JSON-bestand mee.')
  const commit = flags.includes('--commit')
  const ownerEmail = flags[flags.indexOf('--owner') + 1]
  if (flags.includes('--owner') && !ownerEmail) fail('--owner verwacht een e-mailadres.')

  const src = JSON.parse(readFileSync(file, 'utf8')) as Source

  // ── Validatie vóór alles ────────────────────────────────────────────────
  if (src.schemaVersion !== 'base-week-schedule-cardio-import-v1') {
    fail(`Onbekende schemaVersion: ${src.schemaVersion}`)
  }
  if (!src.importMarker) fail('importMarker ontbreekt.')
  if (!Array.isArray(src.weeks) || src.weeks.length === 0) fail('Geen weken in het bestand.')

  const problems: string[] = []
  for (const w of src.weeks) {
    if (w.phaseType && !KNOWN_PHASES.has(w.phaseType)) {
      problems.push(`week ${w.programWeek}: onbekende phaseType "${w.phaseType}"`)
    }
    for (const it of w.items) {
      const where = `${it.date} (${it.quickName ?? it.kind})`
      if (!VALID_KIND.has(it.kind)) problems.push(`${where}: kind "${it.kind}" niet ondersteund`)
      if (it.quickCategory && !VALID_CATEGORY.has(it.quickCategory)) {
        problems.push(`${where}: quickCategory "${it.quickCategory}" bestaat niet`)
      }
      if (it.quickActivity && !VALID_ACTIVITY.has(it.quickActivity)) {
        problems.push(`${where}: quickActivity "${it.quickActivity}" bestaat niet`)
      }
      // Integer-check vóór de range-check: de schrijver matcht straks met
      // `it.dayOfWeek - 1 === dow`, en NaN/undefined/"maandag"/3.5 matchen daar
      // nooit. Een bare range-vergelijking laat die allemaal door (elke
      // vergelijking met NaN is false), waarna het item stil nergens wordt
      // aangemaakt terwijl de transactie gewoon slaagt.
      if (!Number.isInteger(it.dayOfWeek) || it.dayOfWeek < 1 || it.dayOfWeek > 7) {
        problems.push(`${where}: dayOfWeek ${JSON.stringify(it.dayOfWeek)} is geen geheel getal 1..7`)
      }
      if (it.plannedRpe != null && (!Number.isFinite(it.plannedRpe) || it.plannedRpe < 1 || it.plannedRpe > 10)) {
        problems.push(`${where}: plannedRpe ${JSON.stringify(it.plannedRpe)} valt buiten 1..10`)
      }
      for (const [veld, waarde] of [
        ['plannedDurationSec', it.plannedDurationSec],
        ['quickDurationSec', it.quickDurationSec],
      ] as const) {
        if (waarde != null && (!Number.isInteger(waarde) || waarde < 0)) {
          problems.push(`${where}: ${veld} ${JSON.stringify(waarde)} is geen geheel getal >= 0`)
        }
      }
      // Cardio-blokken moeten parsen, anders landt er een cardio-item in de DB
      // dat bij élke lezing als "geen workout" terugkomt.
      if (it.cardioParams != null && !parseStructured(it.cardioParams)) {
        problems.push(`${where}: cardioParams is geen geldige blokken-workout`)
      }
    }
  }
  if (problems.length) fail(`Bron niet importeerbaar:\n  - ${problems.join('\n  - ')}`)

  // ── Wie wordt de eigenaar? ──────────────────────────────────────────────
  // Sjablonen zijn praktijk-breed (AGENTS.md); de creator bepaalt de praktijk.
  // Zonder --owner pakken we niet zomaar de eerste de beste: dan moet er
  // precies één therapeut met praktijk zijn, anders is de keuze een gok.
  const candidates = await prisma.user.findMany({
    where: {
      // ADMIN telt mee: de eigenaren van de praktijk draaien op die rol.
      role: { in: ['THERAPIST', 'ADMIN'] },
      practiceId: { not: null },
      ...(ownerEmail ? { email: ownerEmail } : {}),
    },
    select: { id: true, name: true, email: true, practiceId: true },
  })
  if (candidates.length === 0) {
    fail(ownerEmail
      ? `Geen therapeut met praktijk gevonden voor ${ownerEmail}.`
      : 'Geen therapeut met een praktijk gevonden om het plan aan te hangen.')
  }
  if (candidates.length > 1) {
    fail(`Meerdere therapeuten mogelijk — kies er één met --owner:\n  - ${
      candidates.map(c => c.email).join('\n  - ')}`)
  }
  const owner = candidates[0]

  // ── Al geïmporteerd? ────────────────────────────────────────────────────
  // Scope op de eigen praktijk: Prisma draait als owner en bypasst RLS, dus
  // zonder dit filter blokkeert (en toont) een gelijknamige import van een
  // ándere praktijk deze import.
  const dup = await prisma.weekPlanTemplate.findFirst({
    where: { description: { contains: src.importMarker }, practiceId: owner.practiceId },
    select: { id: true, name: true },
  })

  // ── Rapport ─────────────────────────────────────────────────────────────
  const allItems = src.weeks.flatMap(w => w.items)
  const workouts = allItems.filter(i => i.kind === 'WORKOUT')
  const rests = allItems.filter(i => i.kind === 'REST')
  const dates = allItems.map(i => i.date).sort()
  const zeroLoad = workouts.filter(i => itemPlannedLoad({
    kind: i.kind,
    plannedDurationSec: i.plannedDurationSec,
    plannedRpe: i.plannedRpe,
    quickCategory: i.quickCategory,
    quickDurationSec: i.quickDurationSec,
    // Zonder dit telt een op afstand voorgeschreven duurloop voor 0 en beweert
    // de dry-run iets anders dan de app na de import laat zien.
    cardioParams: i.cardioParams,
  }).load === 0)

  console.log(`\n${commit ? 'IMPORT' : 'DRY-RUN'} — ${src.program.name}`)
  console.log(`  marker      ${src.importMarker}`)
  console.log(`  eigenaar    ${owner.name ?? owner.email} (praktijk ${owner.practiceId})`)
  console.log(`  weken       ${src.weeks.length}`)
  console.log(`  items       ${allItems.length} (${workouts.length} WORKOUT, ${rests.length} REST)`)
  console.log(`  brondatums  ${dates[0]} t/m ${dates[dates.length - 1]}`)
  console.log(`  0-belasting ${zeroLoad.length} workouts zonder duur (afstand-only)`)
  console.log('')
  for (const [i, w] of src.weeks.entries()) {
    const perDay = Array.from({ length: 7 }, (_, d) =>
      w.items.filter(it => it.dayOfWeek - 1 === d).length)
    const load = w.items.reduce((s, it) => s + itemPlannedLoad({
      kind: it.kind,
      plannedDurationSec: it.plannedDurationSec,
      plannedRpe: it.plannedRpe,
      quickCategory: it.quickCategory,
      quickDurationSec: it.quickDurationSec,
      cardioParams: it.cardioParams,
    }).load, 0)
    console.log(
      `  week ${String(i + 1).padStart(2)} ${(w.phaseType ?? '—').padEnd(16)}` +
      `${w.isDeload ? 'deload ' : '       '}` +
      `${perDay.map((n, d) => (n ? DAY_SHORT[d] : ' ·')).join(' ')}   ` +
      `${String(w.items.length).padStart(2)} items · ${String(load).padStart(4)} AU`,
    )
  }

  if (dup) {
    console.log(`\n✓ Al geïmporteerd als "${dup.name}" (${dup.id}). Niets gedaan.\n`)
    return
  }
  if (!commit) {
    console.log('\nDry-run: er is niets weggeschreven. Draai opnieuw met --commit.\n')
    return
  }

  // ── Schrijven ───────────────────────────────────────────────────────────
  const templateId = createId()
  await prisma.$transaction(async tx => {
    await tx.weekPlanTemplate.create({
      data: {
        id: templateId,
        name: src.program.name,
        // De marker hoort in een veld dat we kunnen doorzoeken voor de
        // duplicaat-check hierboven; er is geen apart importkolom.
        description: [src.program.description, `[import: ${src.importMarker}]`]
          .filter(Boolean).join('\n\n'),
        goal: src.program.raceDate ? `Wedstrijd ${src.program.raceDate}` : null,
        weeks: src.weeks.length,
        creatorId: owner.id,
        practiceId: owner.practiceId,
      },
    })

    for (const [i, w] of src.weeks.entries()) {
      const weekId = createId()
      await tx.weekSchedule.create({
        data: {
          id: weekId,
          name: `${src.program.name} · week ${i + 1}`,
          creatorId: owner.id,
          practiceId: owner.practiceId,
          patientId: null,
          isTemplate: true,
          planTemplateId: templateId,
          weekNumber: i + 1,
          // Sjabloon-weken hebben bewust geen datum: applyToPatient bepaalt
          // die op basis van de ankerdatum die de therapeut kiest.
          startDate: null,
          endDate: null,
          phaseType: w.phaseType,
          isDeload: w.isDeload,
          weekNote: w.weekNote,
        },
      })

      for (let dow = 0; dow < 7; dow++) {
        const dayId = createId()
        await tx.weekScheduleDay.create({
          data: { id: dayId, weekScheduleId: weekId, dayOfWeek: dow },
        })
        const items = w.items.filter(it => it.dayOfWeek - 1 === dow)
        let order = 0
        for (const it of items) {
          await tx.weekScheduleDayItem.create({
            data: {
              dayId,
              order: order++,
              kind: it.kind as 'WORKOUT' | 'REST',
              quickCategory: (it.quickCategory ?? null) as never,
              quickActivity: (it.quickActivity ?? null) as never,
              quickName: it.quickName,
              quickDurationSec: it.quickDurationSec,
              plannedDurationSec: it.plannedDurationSec,
              plannedRpe: it.plannedRpe,
              notes: it.notes,
              // Zoals `setItemCardio`: de afgeleide platte velden meeschrijven
              // (activity/durationSec/distanceM/zone). Lezers die het
              // blokkenmodel nog niet kennen — WeekTotals en de iOS-app — zien
              // een cardio-item zonder die velden namelijk als leeg.
              cardioParams: (it.cardioParams
                ? { ...(it.cardioParams as object), ...cardioLegacyFields(it.cardioParams) }
                : undefined) as never,
            },
          })
        }
      }
    }
  }, { timeout: 60_000 })

  console.log(`\n✓ Aangemaakt als plan-sjabloon ${templateId}\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
