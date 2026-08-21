/**
 * Controle op de opslag-regel van de iOS sessie-runner.
 *
 * `lib/session-payload.ts` in de mobiele repo bepaalt welke set-rijen een
 * patient terugziet en welke stil verdwijnen. De mobiele repo heeft geen
 * test-runner, dus de controle staat hier — zelfde patroon als
 * `check:mirror`: het ECHTE bestand uit de andere repo wordt geladen en op
 * gedrag getoetst.
 *
 * Achtergrond: de set-rijen zijn voorgevuld met het gewicht van vorige keer en
 * de doel-reps. Tot 21 aug 2026 stuurde de runner alleen afgevinkte rijen mee,
 * waardoor invoer die de patient zelf had gezet maar niet had afgevinkt bij het
 * opslaan verdween. Voorgevulde-maar-onaangeraakte rijen moeten juist blíjven
 * liggen: die loggen zou sets vastleggen die nooit gedaan zijn.
 *
 * Draaien:  npm run check:session-payload
 * De mobiele repo wordt gezocht naast deze repo (../mbt-gym-mobile) of via
 * MOBILE_REPO=/pad/naar/mbt-gym-mobile.
 */
import path from 'node:path'
import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'

const MOBILE = process.env.MOBILE_REPO
  ?? path.resolve(__dirname, '..', '..', 'mbt-gym-mobile')

type SetInput = { weight: string; reps: string; done: boolean; touched?: boolean }

let fouten = 0
const check = (naam: string, fn: () => void) => {
  try {
    fn()
    console.log(`  ✓ ${naam}`)
  } catch (err) {
    fouten++
    const msg = err instanceof Error ? err.message.split('\n').slice(0, 3).join(' | ') : String(err)
    console.error(`  ✗ ${naam}\n      ${msg}`)
  }
}

async function main() {
  if (!existsSync(MOBILE)) {
    console.error(`Mobiele repo niet gevonden op ${MOBILE} — zet MOBILE_REPO.`)
    process.exit(2)
  }
  const sp = await import(path.join(MOBILE, 'lib', 'session-payload.ts'))
  const { buildExerciseLog, isExerciseEmpty, summarizeSets } = sp

  const EX = { exerciseId: 'ex1', reps: 10, repUnit: 'reps' }

  console.log('\nWat gaat er mee naar patient.logSession:')

  check('afgevinkte sets worden gelogd', () => {
    const out = buildExerciseLog(EX, [
      { weight: '40', reps: '10', done: true },
      { weight: '45', reps: '8', done: true },
    ] satisfies SetInput[])
    assert.equal(out.setsCompleted, 2)
    assert.deepEqual(out.weightsPerSet, [40, 45])
    assert.deepEqual(out.repsPerSet, [10, 8])
    assert.equal(out.weight, 45, 'legacy weight = zwaarste set')
    assert.equal(out.repsCompleted, 8)
  })

  check('voorgevulde, onaangeraakte rijen worden NIET gelogd', () => {
    const out = buildExerciseLog(EX, [
      { weight: '40', reps: '10', done: false },
      { weight: '40', reps: '10', done: false },
      { weight: '40', reps: '10', done: false },
    ] satisfies SetInput[])
    assert.equal(out.setsCompleted, 0)
    assert.equal(out.repsCompleted, 0)
    assert.equal(out.weight, null)
    assert.equal(out.weightsPerSet, null)
    assert.equal(out.repsPerSet, null)
  })

  check('zelf ingevuld maar vinkje vergeten blijft bewaard', () => {
    const out = buildExerciseLog(EX, [
      { weight: '45', reps: '8', done: false, touched: true },
      { weight: '45', reps: '8', done: false, touched: true },
      { weight: '50', reps: '6', done: false, touched: true },
    ] satisfies SetInput[])
    assert.equal(out.setsCompleted, 3)
    assert.deepEqual(out.weightsPerSet, [45, 45, 50])
    assert.deepEqual(out.repsPerSet, [8, 8, 6])
    assert.equal(out.weight, 50)
    assert.equal(out.repsCompleted, 6)
  })

  check('mix: afgevinkt + aangeraakt tellen, voorgevuld niet', () => {
    const out = buildExerciseLog(EX, [
      { weight: '40', reps: '10', done: true },
      { weight: '45', reps: '8', done: false, touched: true },
      { weight: '40', reps: '10', done: false },
    ] satisfies SetInput[])
    assert.equal(out.setsCompleted, 2)
    assert.deepEqual(out.weightsPerSet, [40, 45])
  })

  check('lichaamsgewicht: reps zonder kg blijven behouden', () => {
    const out = buildExerciseLog(EX, [
      { weight: '', reps: '12', done: false, touched: true },
      { weight: '', reps: '12', done: false, touched: true },
    ] satisfies SetInput[])
    assert.equal(out.setsCompleted, 2)
    assert.equal(out.weight, null)
    assert.equal(out.weightsPerSet, null, 'alle gewichten leeg → null, niet [null,null]')
    assert.deepEqual(out.repsPerSet, [12, 12])
    assert.equal(out.repsCompleted, 12)
  })

  check('komma-notatie wordt gelezen', () => {
    const out = buildExerciseLog(EX, [{ weight: '12,5', reps: '10', done: true }] satisfies SetInput[])
    assert.equal(out.weight, 12.5)
    assert.deepEqual(out.weightsPerSet, [12.5])
  })

  check('echt overgeslagen oefening blijft leeg', () => {
    const out = buildExerciseLog(EX, [])
    assert.equal(out.setsCompleted, 0)
    assert.equal(out.repsCompleted, 0)
    assert.equal(out.weightsPerSet, null)
  })

  console.log('\nWaarschuwing vóór afronden (welke oefeningen blijven leeg):')

  check('leeg bij alleen voorgevulde rijen', () => {
    assert.equal(isExerciseEmpty([{ weight: '40', reps: '10', done: false }] satisfies SetInput[]), true)
  })

  check('niet leeg zodra er iets is aangeraakt', () => {
    assert.equal(
      isExerciseEmpty([{ weight: '40', reps: '10', done: false, touched: true }] satisfies SetInput[]),
      false,
    )
  })

  check('niet leeg zodra er iets is afgevinkt', () => {
    assert.equal(isExerciseEmpty([{ weight: '40', reps: '10', done: true }] satisfies SetInput[]), false)
  })

  check('nooit geopende oefening is leeg', () => {
    assert.equal(isExerciseEmpty(undefined), true)
  })

  console.log('\nAfrond-scherm telt hetzelfde als wat is opgeslagen:')

  check('sets en tonnage over de gelogde rijen', () => {
    const out = summarizeSets([
      [
        { weight: '40', reps: '10', done: true },
        { weight: '45', reps: '8', done: false, touched: true },
        { weight: '40', reps: '10', done: false },
      ] satisfies SetInput[],
      [{ weight: '', reps: '12', done: true }] satisfies SetInput[],
    ])
    assert.equal(out.setsDone, 3)
    assert.equal(out.totalKg, 40 * 10 + 45 * 8)
  })

  console.log(
    fouten === 0
      ? '\nGeen dataloss: alleen voorgevulde, onaangeraakte rijen blijven achter.\n'
      : `\n${fouten} controle(s) gefaald.\n`,
  )
  process.exit(fouten === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
