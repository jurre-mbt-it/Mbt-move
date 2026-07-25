/**
 * Drift-check tussen de web-repo en de mobiele repo (mbt-gym-mobile).
 *
 * De app spiegelt bewust een paar stukken uit deze repo — het cardio-
 * blokkenmodel en de voorschrift/parameter-constanten — omdat er geen gedeeld
 * package tussen de twee repo's bestaat. Dit script laadt de ECHTE bestanden
 * uit beide repo's en vergelijkt de uitkomsten: dezelfde blokken moeten
 * dezelfde samenvatting, duur, kleuren en RPE's opleveren, en de constanten
 * moeten inhoudelijk gelijk zijn. Loopt er iets uiteen, dan faalt dit hard —
 * commentaar ("spiegelt X") is een afspraak, dit is de controle erop.
 *
 * Draaien:  npm run check:mirror
 * De mobiele repo wordt gezocht naast deze repo (../mbt-gym-mobile) of via
 * MOBILE_REPO=/pad/naar/mbt-gym-mobile.
 */
import path from 'node:path'
import { existsSync } from 'node:fs'

import * as web from '../src/lib/cardio-workout'
import { HR_ZONES, type HRZone } from '../src/lib/cardio-constants'
import { INTENSITY_TYPES, INTENSITY_TYPE_LABELS } from '../src/lib/prescription'
import { STANDARD_PARAMS, REP_UNITS } from '../src/lib/program-constants'
import { durationFromExercises } from '../src/lib/planned-load'

const MOBILE = process.env.MOBILE_REPO
  ?? path.resolve(__dirname, '..', '..', 'mbt-gym-mobile')

let fouten = 0
const OK = (m: string) => console.log(`  ✓ ${m}`)
const FOUT = (m: string) => { console.error(`  ✗ ${m}`); fouten++ }
const check = (naam: string, a: unknown, b: unknown) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b)
  if (ja === jb) OK(naam)
  else FOUT(`${naam}\n      web    : ${ja}\n      mobiel : ${jb}`)
}

async function main() {
  if (!existsSync(MOBILE)) {
    console.error(`Mobiele repo niet gevonden op ${MOBILE} — zet MOBILE_REPO.`)
    process.exit(2)
  }
  const mob = await import(path.join(MOBILE, 'lib', 'cardio-workout.ts'))
  const mirror = await import(path.join(MOBILE, 'lib', 'prescription-mirror.ts'))

  // ── Cardio-blokkenmodel: zelfde invoer → zelfde uitkomst ──────────────────
  console.log('\nCardio-blokkenmodel (lib/cardio-workout):')

  // Eén workout die alles raakt: gewone stap, afstand-stap, herhaling,
  // zone-bereik (ramp) en een RPE-doel.
  const blocks = [
    { id: 'wu', kind: 'WARMUP', durationSec: 600, target: { type: 'ZONE', zone: 2 } },
    {
      id: 'r1', kind: 'REPEAT', times: 6,
      steps: [
        { id: 'w', kind: 'ACTIVE', durationSec: 180, target: { type: 'ZONE', zone: 4 } },
        { id: 'h', kind: 'RECOVERY', durationSec: 90, target: { type: 'ZONE', zone: 1 } },
      ],
    },
    { id: 'ru', kind: 'RAMP_UP', durationSec: 300, target: { type: 'ZONE', zone: 2, toZone: 4 } },
    { id: 'd', kind: 'ACTIVE', distanceM: 1000, target: { type: 'RPE', min: 6, max: 7 } },
    { id: 'cd', kind: 'COOLDOWN', durationSec: 300, target: { type: 'ZONE', zone: 1 } },
  ]

  check('summarize() op een gemengde workout', web.summarize(blocks as never), mob.summarize(blocks))
  check('totalDurationSec()', web.totalDurationSec(blocks as never), mob.totalDurationSec(blocks))

  for (const z of [1, 2, 3, 4, 5] as HRZone[]) {
    check(`targetColor(zone ${z}) — moet HR_ZONES-kleur zijn`,
      HR_ZONES[z].color,
      mob.targetColor({ type: 'ZONE', zone: z }))
  }
  check('targetColor(RPE 6-7)',
    web.targetColor({ type: 'RPE', min: 6, max: 7 }),
    mob.targetColor({ type: 'RPE', min: 6, max: 7 }))

  check('targetRpe(zone-bereik 2→4)',
    web.targetRpe({ type: 'ZONE', zone: 2, toZone: 4 }),
    mob.targetRpe({ type: 'ZONE', zone: 2, toZone: 4 }))
  check('targetRpe(RPE 6-7)',
    web.targetRpe({ type: 'RPE', min: 6, max: 7 }),
    mob.targetRpe({ type: 'RPE', min: 6, max: 7 }))

  // Zelfde rauwe JSON door beide parsers.
  const raw = { version: 1, activity: 'RUNNING', blocks }
  check('parseStructured (web) vs parseWorkout (mobiel) op dezelfde JSON',
    web.parseStructured(raw), mob.parseWorkout(raw))
  check('beide parsers weigeren dezelfde rommel',
    web.parseStructured({ protocol: 'INTERVALS' }), mob.parseWorkout({ protocol: 'INTERVALS' }))

  check('STEP_LABEL (mobiel) vs STEP_META.label (web)',
    Object.fromEntries(Object.entries(web.STEP_META).map(([k, v]) => [k, v.label])),
    mob.STEP_LABEL)

  // ── Voorschrift & parameters (lib/prescription-mirror) ────────────────────
  console.log('\nVoorschrift & parameters (lib/prescription-mirror):')

  check('VOORSCHRIFT vs INTENSITY_TYPES + labels',
    INTENSITY_TYPES.map((t) => ({ type: t, label: INTENSITY_TYPE_LABELS[t] })),
    mirror.VOORSCHRIFT)

  // Placeholder is puur web-UI; de rest moet gelijk zijn.
  check('STANDAARD_PARAMS vs STANDARD_PARAMS',
    STANDARD_PARAMS.map(({ placeholder: _p, ...rest }) => rest),
    mirror.STANDAARD_PARAMS)

  check('REP_UNITS (waarden)',
    REP_UNITS.map((u) => u.value),
    mirror.REP_UNITS)

  // ── Duur per rep-eenheid: de rekenkunde, niet alleen de namen ─────────────
  // Dit ontbrak, en daardoor kwam er drift ongezien door: de app kende
  // `sec/zijde` niet en verdubbelde per-zijde helemaal niet, waardoor 3×30
  // sec/zijde daar op 8 minuten uitkwam tegen 6 op het web. `check` op alleen
  // REP_UNITS-waarden was groen. Web is canoniek (durationFromExercises met
  // 1 set en 0 rust == werkSecondenPerSet).
  console.log('\nDuur per rep-eenheid (planned-load ↔ prescription-mirror):')
  for (const unit of REP_UNITS.map((u) => u.value)) {
    check(`werk-seconden voor 30 × "${unit}"`,
      durationFromExercises([{ sets: 1, reps: 30, repUnit: unit, restTime: 0 }]),
      mirror.estimateSetActiveSec(30, unit))
  }
  // Onbekende eenheid moet aan beide kanten op de reps-schatting terugvallen.
  check('werk-seconden voor een onbekende eenheid',
    durationFromExercises([{ sets: 1, reps: 30, repUnit: 'onzin', restTime: 0 }]),
    mirror.estimateSetActiveSec(30, 'onzin'))

  console.log(fouten === 0
    ? '\nGeen drift: web en app rekenen en benoemen gelijk.'
    : `\n${fouten} verschil(len) tussen web en app — trek ze gelijk vóór een release.`)
  process.exit(fouten === 0 ? 0 : 1)
}

main()
