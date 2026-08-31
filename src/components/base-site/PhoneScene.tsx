'use client'

import Image from 'next/image'
import styles from './base-site.module.css'
import { ScrambleText } from './ScrambleText'
import { useSceneProgress, stepOf } from './useSceneProgress'

/**
 * Plakscene met de telefoon. Het blok blijft aan de bovenkant plakken,
 * bovenin lopen de segmenten vol, en de telefoon draait tussen de stappen om
 * zijn as: je ziet even de achterkant, en als de voorkant terugkomt staat er
 * een ander scherm op. Dat is het Apple-model dat Jurre vroeg (21-08).
 *
 * SINDS 25-08 STAAN HIER ECHTE SCHERMOPNAMES. Daarvoor waren de schermen in
 * code nagetekend, met de onderdelen en kleuren van de Gezondheid-pagina uit
 * de mobiele repo. Dat was de laatste plek op deze pagina waar een tekening
 * voor het product doorging, precies het bezwaar waar de hele herbouw mee
 * begon (zie de kop van BaseLanding.tsx). De opnames komen uit de iOS-app in
 * de simulator, ingelogd op het demo-account "Sam" met zijn eigen zestig dagen
 * aan gegevens; vervangen doe je door een nieuwe opname in public/base-site/
 * te zetten en hieronder het pad om te zetten.
 *
 * Met de tekeningen verdwenen ook de getekende Dynamic Island en de getekende
 * tabbalk: die staan al op de opname zelf, en er nog een overheen leggen gaf
 * een dubbele.
 *
 * Binnen een stap: de eerste 45% van de scroll houdt de telefoon stil (lezen),
 * de rest draait hem 360° naar de volgende stap. Het scherm wisselt op 180°,
 * als de voorkant van de kijker af staat; backface-visibility verbergt hem dan
 * toch al.
 */
type Step = {
  label: string
  title: string
  note: string
  src: string
  alt: string
}

const STEPS: Step[] = [
  {
    label: 'Dagdoelen',
    title: 'Beweging, training en slaap in één blik',
    note: 'De watch synct vanzelf. Je patiënt ziet meteen of de dag gehaald is, en jij ziet hetzelfde beeld terug in het dossier.',
    src: '/base-site/app-dagdoelen.png',
    alt: 'Het gezondheidsscherm van BASE met de herstelscore en de dagdoelen voor beweging, training en slaap',
  },
  {
    label: 'Belasting',
    title: 'Kracht en cardio apart, en bij elkaar opgeteld',
    note: 'De app splitst de belasting naar kracht en cardio en zet de week ernaast. Een piek valt op voordat iemand hem voelt.',
    src: '/base-site/app-belasting.png',
    alt: 'Het belastingsoverzicht in BASE met kracht en cardio apart, en de verbranding van de dag',
  },
  {
    label: 'Hart en herstel',
    title: 'De cijfers waar herstel op leunt',
    note: 'HRV, rusthartslag, ademhaling en stress van vannacht, met de grens erbij waarboven de app ze afwijkend noemt.',
    src: '/base-site/app-herstel.png',
    alt: 'De samenvatting van de nacht in BASE met HRV, rusthartslag, ademhaling, polstemperatuur, VO2max en stress',
  },
  {
    label: 'Klachten',
    title: 'Zie hoe lang een klacht al meespeelt',
    note: 'Je patiënt tikt de klacht als hashtag in zijn notitie, bijvoorbeeld #knie. Elke training waarin die opspeelde komt op één tijdlijn, met de belasting van die dag en de pijnscore ernaast.',
    src: '/base-site/app-klachten.png',
    alt: 'De tijdlijn van de klacht #knie in BASE, met de totale belasting als lijn en elke training waarin de klacht opspeelde als punt',
  },
]

/** Stand van de scroll binnen een stap waarop het draaien begint. Lager is
 *  een langere, rustiger draai; Jurre vond 0.62 te snel. */
const HOLD = 0.45

/** Rusthoek: schuin genoeg om de zijkant te zien, zodat hij als ding leest. */
const RUST_Y = -18
const RUST_X = 5

/** Dikte van de behuizing in pixels; de laagjes ertussen maken de zijkant. */
const DIKTE = 10

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function PhoneScene() {
  const { ref, progress, still } = useSceneProgress<HTMLDivElement>()
  const { index, within } = stepOf(progress, still, STEPS.length)

  // Stilstaan, dan draaien. De laatste stap draait niet meer.
  const laatste = index === STEPS.length - 1
  const spinT = still || laatste || within < HOLD ? 0 : easeInOut((within - HOLD) / (1 - HOLD))
  const hoek = spinT * 360
  // Op 180° staat de voorkant van de kijker af: dan wisselt het scherm.
  const scherm = hoek >= 180 ? index + 1 : index
  const step = STEPS[scherm]

  return (
    <div ref={ref} className={`${styles.sec} ${styles.scene}`}>
      <div className={styles.scenePin}>
        <div className={styles.shell}>
          <div className={styles.sceneProgress} aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.label} className={styles.sceneBar}>
                <i style={{ transform: `scaleX(${i < index ? 1 : i === index ? within : 0})` }} />
              </span>
            ))}
          </div>

          <div className={`${styles.sceneBody} ${styles.sceneBodyPhone}`}>
            <div className={styles.sceneCopy}>
              <p className={styles.eyebrow}>
                <ScrambleText key={step.label} text={step.label} />
              </p>
              <h2 className={`${styles.head} ${styles.headSmall}`}>{step.title}</h2>
              <p className={styles.lede}>{step.note}</p>
            </div>

            <div className={styles.phone3d}>
              <div
                className={styles.phone}
                style={{ transform: `rotateY(${hoek + RUST_Y}deg) rotateX(${RUST_X}deg)` }}
              >
                {/* Dikte: laagjes tussen voor- en achterkant. Zonder deze leest de
                    telefoon als een vel papier zodra hij draait. */}
                {Array.from({ length: DIKTE + 1 }, (_, i) => (
                  <span
                    key={i}
                    className={styles.phoneSlice}
                    aria-hidden="true"
                    style={{ transform: `translateZ(${i - DIKTE / 2}px)` }}
                  />
                ))}
                {/* Voorkant: behuizing, zijknoppen, scherm. */}
                <div className={styles.phoneFace} style={{ transform: `translateZ(${DIKTE / 2 + 0.5}px)` }}>
                  <span className={`${styles.phoneBtn} ${styles.phoneBtnMute}`} aria-hidden="true" />
                  <span className={`${styles.phoneBtn} ${styles.phoneBtnVolUp}`} aria-hidden="true" />
                  <span className={`${styles.phoneBtn} ${styles.phoneBtnVolDown}`} aria-hidden="true" />
                  <span className={`${styles.phoneBtn} ${styles.phoneBtnPower}`} aria-hidden="true" />
                  <div className={styles.phoneScreen}>
                    <Image
                      src={step.src}
                      alt={step.alt}
                      width={900}
                      height={1957}
                      sizes="320px"
                      className={styles.phoneShot}
                    />
                  </div>
                </div>
                {/* Achterkant: cameramodule en logo-positie. */}
                <div
                  className={styles.phoneBack}
                  aria-hidden="true"
                  style={{ transform: `rotateY(180deg) translateZ(${DIKTE / 2 + 0.5}px)` }}
                >
                  <span className={styles.phoneCam}>
                    <i /><i /><i />
                  </span>
                  <span className={styles.phoneBackMark}>BASE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
