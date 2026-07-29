/**
 * Machinetaal uit een geïmporteerd trainingsplan halen en de workouttitels
 * gelijktrekken.
 *
 * Waarom dit bestaat: het Rencia-marathonplan is uit een JSON-bestand
 * geïmporteerd en de brontekst is meegelift naar het scherm. Daar stond
 * "JSON-doelafstand", een importstempel, en en-streepjes in reeksen
 * ("12–14 km") die tegen docs/tone-of-voice.md ingaan. Daarnaast heette een
 * fietsrit vijf verschillende dingen (Herstelrit, Losrijden, Duurfiets, Zeer
 * rustige fiets, Aerobe duurfiets), waardoor je een week niet kon scannen.
 *
 * Elke titel begint nu met de activiteit en daarna waar het om gaat:
 * "Fietsen • herstel 50 min".
 *
 * Draaien:
 *   node --env-file=.env.local --import tsx scripts/clean-plan-copy.ts [--commit]
 *
 * Zonder --commit is het een proefdraai. Mét --commit wordt eerst de huidige
 * tekst weggeschreven naar scripts/backups/, zodat dit terug te draaien is.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { prisma } from '../src/lib/prisma'

const commit = process.argv.includes('--commit')
const PLAN_ZOEK = 'Rencia'

/** Losse woorden die in een klinisch document niets te zoeken hebben. */
function schoonTekst(t: string): string {
  return t
    // "Doelbandbreedte 12–14 km; JSON-doelafstand 13 km." → de bandbreedte in
    // gewone taal; de exacte afstand staat al in de titel.
    .replace(/Doelbandbreedte\s+(\d+)\s*[–—-]\s*(\d+)\s*km;\s*JSON-doelafstand\s+\d+\s*km\./gi,
      'Mik op $1-$2 km.')
    .replace(/JSON-doelafstand\s+(\d+(?:,\d+)?)\s*km/gi, 'doelafstand $1 km')
    // Hele clausule, niet alleen het Engelse woord: los vervangen levert
    // "de cardio-workouts gebruikt RPE" op.
    .replace(/structured cardio gebruikt RPE/gi, 'de intensiteit staat in RPE')
    // Importstempel: puur voor het importscript, niet voor de lezer.
    .replace(/\s*\[import:[^\]]*\]\s*/gi, '')
    // Getalreeksen krijgen een gewoon koppelteken. Zo staat het in
    // docs/tone-of-voice.md ("Reeksen met een gewoon koppelteken: 2-3x") en zo
    // staat het sinds de copy-sweep ook in de rest van de app. Een eerdere
    // versie van dit script maakte er "12 tot 14 km" van; die vorm hieronder
    // wordt daarom teruggedraaid, zodat opnieuw draaien het rechtzet.
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/(\d+)\s+tot\s+(\d+)\s*km/g, '$1-$2 km')
    // Overgebleven losse en/em-streepjes.
    .replace(/\s+[–—]\s+/g, ', ')
    // Puntkomma's blijven staan: die zijn gewoon Nederlands en de
    // tone-of-voice-gids gebruikt ze zelf. Ze omzetten naar punten leverde
    // bovendien zinnen op die met een kleine letter beginnen.
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Hoe een fiets- of loopsessie voortaan heet. */
const AARD: [RegExp, string][] = [
  [/^herstelrit$/i, 'herstel'],
  [/^losrijden$/i, 'losrijden'],
  // "Optioneel" hoort achter de duur, niet ertussen: "losrijden 20 min, of
  // rust" leest, "losrijden, of rust 20 min" niet. Zie de staart-regel in
  // schoonTitel.
  [/^optioneel losrijden$/i, 'losrijden'],
  [/^zeer rustige fiets$/i, 'zeer rustig'],
  [/^rustige duurfiets$/i, 'rustige duurrit'],
  [/^aerobe duurfiets$/i, 'duurrit'],
  [/^fietsen$/i, ''],
  [/^lange duurloop$/i, 'lang'],
  [/^langste duurloop$/i, 'lang'],
  [/^verkorte lange duurloop$/i, 'lang'],
  [/^korte lange duurloop$/i, 'lang'],
  [/^rustige duurloop$/i, 'rustig'],
  [/^marathon$/i, 'marathon'],
  [/^hardlopen$/i, ''],
]

/**
 * Titel omzetten. Onbekende vormen laten we met rust en melden we: liever een
 * titel die blijft staan dan een die stilzwijgend verminkt raakt.
 */
function schoonTitel(titel: string, activity: string | null): { nieuw: string; onbekend?: string } {
  const prefix = activity === 'CYCLING' ? 'Fietsen' : activity === 'RUNNING' ? 'Hardlopen' : null
  if (!prefix) return { nieuw: titel }

  // "Rustige duurloop + 4 versnellingen" en "Korte rustige loop + 4 versnellingen"
  const versnelling = titel.match(/^(.*?)\s*\+\s*(\d+)\s*versnellingen$/i)
  if (versnelling) return { nieuw: `${prefix} • rustig met ${versnelling[2]} versnellingen` }

  // "Fietsen 180 minuten"
  const kaal = titel.match(/^(?:fietsen|hardlopen)\s+(\d+)\s*(?:minuten|min)$/i)
  if (kaal) return { nieuw: `${prefix} • ${kaal[1]} min` }

  const delen = titel.split('•').map((s) => s.trim())
  if (delen.length !== 2) return { nieuw: titel, onbekend: titel }
  const [kop, staart] = delen

  // Kop is al de activiteit ("Hardlopen • 5×5 min gecontroleerd"): alleen de
  // staart opschonen.
  if (/^(fietsen|hardlopen)$/i.test(kop)) {
    return { nieuw: `${prefix} • ${staart.replace(/\s+beheerst$/i, '')}` }
  }

  const treffer = AARD.find(([re]) => re.test(kop))
  if (!treffer) return { nieuw: titel, onbekend: titel }
  const aard = treffer[1]
  const optioneel = /^optioneel /i.test(kop) ? ', of rust' : ''
  const basis = aard ? `${prefix} • ${aard} ${staart}` : `${prefix} • ${staart}`
  return { nieuw: `${basis}${optioneel}` }
}

async function main() {
  const plan = await prisma.weekPlanTemplate.findFirst({
    where: { name: { contains: PLAN_ZOEK } },
    select: { id: true, name: true, description: true, goal: true },
  })
  if (!plan) throw new Error(`Geen plan gevonden met "${PLAN_ZOEK}" in de naam`)

  const weeks = await prisma.weekSchedule.findMany({
    where: { planTemplateId: plan.id },
    orderBy: { weekNumber: 'asc' },
    select: {
      id: true, weekNumber: true, weekNote: true,
      days: {
        orderBy: { dayOfWeek: 'asc' },
        select: {
          dayOfWeek: true,
          items: {
            orderBy: { order: 'asc' },
            select: { id: true, quickName: true, quickActivity: true, notes: true },
          },
        },
      },
    },
  })

  const backup = { plan, weeks }
  const itemPatches: { id: string; quickName?: string; notes?: string }[] = []
  const weekPatches: { id: string; weekNote: string }[] = []
  const onbekend: string[] = []

  console.log(`\n${commit ? 'TOEPASSEN' : 'PROEFDRAAI'} — ${plan.name}\n`)

  const nieuweOmschrijving = schoonTekst(plan.description ?? '')
  const nieuwDoel = (plan.goal ?? '').replace(
    /^Wedstrijd (\d{4})-(\d{2})-(\d{2})$/,
    (_, j, m, d) => `Wedstrijd op ${Number(d)} ${
      ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][Number(m) - 1]
    } ${j}`,
  )
  if (nieuweOmschrijving !== plan.description) {
    console.log(`PLAN omschrijving:\n  oud: ${JSON.stringify(plan.description)}\n  nieuw: ${JSON.stringify(nieuweOmschrijving)}`)
  }
  if (nieuwDoel !== plan.goal) {
    console.log(`PLAN doel:\n  oud: ${JSON.stringify(plan.goal)}\n  nieuw: ${JSON.stringify(nieuwDoel)}\n`)
  }

  for (const w of weeks) {
    const nieuweNote = w.weekNote ? schoonTekst(w.weekNote) : null
    if (nieuweNote && nieuweNote !== w.weekNote) {
      console.log(`W${w.weekNumber} weeknotitie:\n  oud: ${JSON.stringify(w.weekNote)}\n  nieuw: ${JSON.stringify(nieuweNote)}`)
      weekPatches.push({ id: w.id, weekNote: nieuweNote })
    }
    for (const d of w.days) {
      for (const it of d.items) {
        const patch: { id: string; quickName?: string; notes?: string } = { id: it.id }
        if (it.quickName) {
          const { nieuw, onbekend: onb } = schoonTitel(it.quickName, it.quickActivity)
          if (onb) onbekend.push(onb)
          if (nieuw !== it.quickName) {
            console.log(`W${w.weekNumber} d${d.dayOfWeek} titel:  ${it.quickName}\n                 →  ${nieuw}`)
            patch.quickName = nieuw
          }
        }
        if (it.notes) {
          const nieuw = schoonTekst(it.notes)
          if (nieuw !== it.notes) {
            console.log(`W${w.weekNumber} d${d.dayOfWeek} notitie: ${JSON.stringify(it.notes)}\n                 →  ${JSON.stringify(nieuw)}`)
            patch.notes = nieuw
          }
        }
        if (patch.quickName || patch.notes) itemPatches.push(patch)
      }
    }
  }

  console.log(`\nSAMENVATTING: ${itemPatches.length} items, ${weekPatches.length} weeknotities`)
  if (onbekend.length) {
    console.log(`ONBEKENDE TITELVORM (ongemoeid gelaten): ${JSON.stringify([...new Set(onbekend)])}`)
  }

  if (!commit) {
    console.log('\nProefdraai. Draai opnieuw met --commit om dit toe te passen.')
    return
  }

  mkdirSync('scripts/backups', { recursive: true })
  const pad = `scripts/backups/plan-copy-${plan.id}.json`
  // Niet overschrijven: bij een tweede ronde staat in de database al de
  // opgeschoonde tekst, en die eroverheen schrijven maakt de back-up waardeloos
  // juist op het moment dat je 'm nodig hebt.
  if (existsSync(pad)) {
    console.log(`\nBack-up bestaat al, blijft ongemoeid: ${pad}`)
  } else {
    writeFileSync(pad, JSON.stringify(backup, null, 2))
    console.log(`\nBack-up van de oude tekst: ${pad}`)
  }

  await prisma.weekPlanTemplate.update({
    where: { id: plan.id },
    data: { description: nieuweOmschrijving || null, goal: nieuwDoel || null },
  })
  for (const p of weekPatches) {
    await prisma.weekSchedule.update({ where: { id: p.id }, data: { weekNote: p.weekNote } })
  }
  for (const p of itemPatches) {
    const { id, ...data } = p
    await prisma.weekScheduleDayItem.update({ where: { id }, data })
  }
  console.log('Klaar.')
}

main().finally(() => prisma.$disconnect())
