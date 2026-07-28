/**
 * Balken voor de cardio-grafiek.
 *
 * Een herhaling wordt hier UITGEVOUWEN: 5× (5 min actief / 2 min herstel)
 * levert tien balken op — werk, rust, werk, rust, ... — en niet één brede
 * werkbalk van 25 minuten naast één rustbalk van 10. Dat laatste deed de
 * grafiek eerder, waardoor een intervaltraining er in het profiel uitzag als
 * één lang blok en je het op-en-neer van de sessie niet zag.
 *
 * De totale breedte verandert niet: n balken van `durationSec` tellen op tot
 * hetzelfde als één balk van `durationSec × times`.
 *
 * Bewust NIET in `lib/cardio-workout.ts`: dat bestand wordt gespiegeld met de
 * mobiele repo (zie AGENTS.md) en beschrijft het model — duur, samenvatting,
 * doelen. Kleuren, hoogtes en React-keys zijn presentatie en horen hier.
 */
import {
  isRepeat, targetColor, targetHeight,
  type StepKind, type WorkoutBlock,
} from './cardio-workout'

/** Stap zonder duur (afstand-blok): zonder tempo is de duur onbekend. */
const FALLBACK_SEC = 120

export type CardioBar = {
  /** Unieke React-key. Elke ronde van een herhaling krijgt een eigen key. */
  key: string
  /**
   * Id van de onderliggende stap. Meerdere balken delen dit id als ze rondes
   * van dezelfde herhaalstap zijn — selecteren licht ze dus allemaal op, wat
   * klopt: je bewerkt één stap die n keer voorkomt.
   */
  stepId: string
  kind: StepKind
  sec: number
  color: string
  /** Relatieve hoogte 0..1. */
  h: number
  /** Bij een herhaling: welke ronde dit is (1-based) en hoeveel er in totaal zijn. */
  round?: number
  rounds?: number
}

export function cardioChartBars(blocks: WorkoutBlock[]): CardioBar[] {
  const bars: CardioBar[] = []
  for (const b of blocks) {
    if (isRepeat(b)) {
      // Zelfde ondergrens als flattenSteps: times 0 mag de grafiek niet legen.
      const rounds = Math.max(1, b.times)
      for (let r = 0; r < rounds; r++) {
        for (const s of b.steps) {
          bars.push({
            key: `${b.id}:${r}:${s.id}`,
            stepId: s.id,
            kind: s.kind,
            sec: s.durationSec ?? FALLBACK_SEC,
            color: targetColor(s.target),
            h: targetHeight(s.target),
            round: r + 1,
            rounds,
          })
        }
      }
    } else {
      bars.push({
        key: b.id,
        stepId: b.id,
        kind: b.kind,
        sec: b.durationSec ?? FALLBACK_SEC,
        color: targetColor(b.target),
        h: targetHeight(b.target),
      })
    }
  }
  return bars
}
