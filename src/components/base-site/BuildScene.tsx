'use client'

import Image from 'next/image'
import styles from './base-site.module.css'
import { ScrambleText } from './ScrambleText'
import { useSceneProgress, stepOf } from './useSceneProgress'
import { MockBuilder, MockCriteria, MockWeek } from './MockScreens'

/**
 * Plakscene aan de praktijkkant, naar het model van de ring-secties op
 * sensiq.co (docs/sensiq-dna.md §2): één groot schermkader blijft staan
 * terwijl je scrollt, en loopt in drie stappen door het werk van de
 * therapeut heen. Bovenin lopen drie segmenten vol, de tekst links wisselt
 * per stap.
 *
 * De frames zijn bedoeld voor ECHTE opnames uit BASE (zie het opnameprotocol
 * in de memory en ScreenShot.tsx voor dezelfde afspraak). Zolang een opname
 * ontbreekt staat er een proefbeeld met een label; zet er nooit een
 * natekening in die voor het echte scherm door kan gaan.
 *
 * Het kader staat op 4:3, de maat van een iPad-scherm, zodat een opname er
 * precies in valt en er niets af hoeft. Alle drie de stappen hebben er sinds
 * 25-08 een; de proefbeelden in `mock` staan er alleen nog als vangnet en
 * MockScreens.tsx kan weg zodra dat zeker is.
 */
type Stap = {
  label: string
  titel: string
  tekst: string
  /** Pad in public/ zodra de gemaskeerde opname er is; wint van `mock`. */
  src?: string
  alt: string
  /** Tijdelijk proefbeeld tot de opname er is (MockScreens.tsx). */
  mock: React.ReactNode
}

const STAPPEN: Stap[] = [
  {
    label: 'Stap 1 · Bouwen',
    titel: 'Stel het programma samen',
    tekst:
      'Oefeningen met video, sets en herhalingen, of een meerweeks krachtschema. Wat je vaker gebruikt bewaar je als sjabloon voor de hele praktijk.',
    src: '/base-site/ipad-bouwer.png',
    alt: 'De programmabouwer van BASE op een iPad, met de oefeningen van een krachtschema en per oefening sets, herhalingen en rust',
    mock: <MockBuilder />,
  },
  {
    label: 'Stap 2 · Criteria',
    titel: 'Koppel doelen en testen',
    tekst:
      'Een bestaand revalidatieprotocol, losse testen of een eigen batterij. Wat behaald is en wat openstaat zien jij en je patiënt allebei.',
    src: '/base-site/ipad-criteria-2.png',
    alt: 'Het revalidatieprotocol van een traject in BASE, met per fase de criteria en of ze behaald, in behandeling of nog open zijn',
    mock: <MockCriteria />,
  },
  {
    label: 'Stap 3 · Plannen',
    titel: 'Zet het op de kalender',
    tekst:
      'Meerdere programma’s naast elkaar in dezelfde week, flexibel doorlopend of op vaste dagen. Een meerweeks plan staat er in één keer op.',
    src: '/base-site/ipad-kalender.png',
    alt: 'De kalender van een patiënt in BASE op een iPad, met per dag de geplande en gedane trainingen',
    mock: <MockWeek />,
  },
]

export function BuildScene() {
  const { ref, progress, still } = useSceneProgress<HTMLDivElement>()
  const { index, within } = stepOf(progress, still, STAPPEN.length)
  const stap = STAPPEN[index]

  return (
    <div ref={ref} className={`${styles.sec} ${styles.scene}`}>
      <div className={styles.scenePin}>
        <div className={styles.shell}>
          <div className={styles.sceneProgress} aria-hidden="true">
            {STAPPEN.map((s, i) => (
              <span key={s.label} className={styles.sceneBar}>
                <i style={{ transform: `scaleX(${i < index ? 1 : i === index ? within : 0})` }} />
              </span>
            ))}
          </div>

          <div className={styles.sceneBody}>
            <div className={styles.sceneCopy}>
              <p className={styles.eyebrow}>
                <ScrambleText key={stap.label} text={stap.label} />
              </p>
              <h2 className={`${styles.head} ${styles.headSmall}`}>{stap.titel}</h2>
              <p className={styles.lede}>{stap.tekst}</p>
            </div>

            <div className={styles.frameStage}>
              {STAPPEN.map((s, i) => (
                <div
                  key={s.label}
                  className={`${styles.frameSlot} ${still || i === index ? styles.frameSlotActive : ''}`}
                  aria-hidden={!still && i !== index}
                >
                  {s.src ? (
                    <Image src={s.src} alt={s.alt} fill sizes="(max-width: 900px) 100vw, 60vw" />
                  ) : (
                    <div className={styles.frameVul} role="img" aria-label={s.alt}>
                      {s.mock}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
