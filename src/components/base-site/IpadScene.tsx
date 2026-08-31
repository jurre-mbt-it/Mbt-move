'use client'

import Image from 'next/image'
import styles from './base-site.module.css'
import { useSceneProgress, stepOf } from './useSceneProgress'

/**
 * Het eerste beeld van de pagina: een iPad die op zijn plek blijft staan
 * terwijl je scrollt en de schermen er één voor één doorheen schuift.
 *
 * Alle vijf de beelden zijn ECHTE opnames uit BASE op een iPad (24-08-2026,
 * door Jurre gemaakt), niet nagetekend; zie de regel daarover boven in
 * BaseLanding.tsx. Drie ervan waren losse uitsneden van een blad dat over het
 * dashboard heen ligt. Die staan hier terug op hun eigen achtergrond, precies
 * zoals de app ze toont: het dashboard gedimd, het blad erboven.
 *
 * De beweging is bewust anders dan die van PhoneScene verderop. Daar draait
 * een toestel om zijn as, hier schuiven de schermen horizontaal langs. Twee
 * keer dezelfde truc op één pagina zou opvallen als truc.
 *
 * Het toestel staat naast de titel en hangt schuin in de ruimte. Recht
 * vooraanzicht, paginabreed onder de tekst, las als een los vak met veel
 * leegte eromheen (oordeel Jurre 24-08). De koptekst komt als `children`
 * binnen, zodat hij in BaseLanding blijft staan waar hij te lezen is.
 *
 * De opnames van de bouwer en de kalender zaten hier ook in, maar dragen sinds
 * 25-08 stap 1 en stap 3 van BuildScene, waar de tekst ernaast uitlegt wat je
 * ziet. Twee keer hetzelfde scherm op één pagina wilde Jurre niet; zet ze hier
 * dus niet terug zonder ze daar weg te halen.
 */
const SCHERMEN = [
  {
    src: '/base-site/ipad-dashboard.png',
    alt: 'Het dashboard van BASE op een iPad, met signalen, therapietrouw, de schema’s die gecontroleerd moeten worden en de recente activiteit van patiënten',
  },
  {
    src: '/base-site/ipad-sessie.png',
    alt: 'Een gedane krachtsessie in BASE met session strain, tijd, RPE, pijn en alle uitgevoerde oefeningen',
  },
  {
    src: '/base-site/ipad-gelogd.png',
    alt: 'Een gelogde workout in BASE met programma, duur, RPE, pijn en per oefening de sets en gewichten',
  },
]

/** Ruststand van de kanteling, en hoeveel die over de hele scene bijdraait. */
const KANTEL_Y = -15
const KANTEL_X = 5
const DRIFT = 7
/** Aantal laagjes voor de dikte van de behuizing. */
const DIKTE = 7

export function IpadScene({ children }: { children: React.ReactNode }) {
  const { ref, progress, still } = useSceneProgress<HTMLDivElement>()
  const { index, within } = stepOf(progress, still, SCHERMEN.length)

  // De scroll kiest alleen WELK scherm; de schuif zelf loopt op tijd, via een
  // CSS-overgang (.ipadTrack). Hing de schuif aan de scrollstand, dan kon je
  // stilhouden op twee halve schermen naast elkaar, en dat is precies wat
  // Jurre 24-08 wegwilde. Nu komt hij altijd op een heel beeld uit.
  const pos = still ? 0 : index

  return (
    <div ref={ref} className={`${styles.scene} ${styles.sceneHero}`}>
      <div className={`${styles.scenePin} ${styles.pinHero}`}>
        <div className={styles.shell}>
          <div className={`${styles.sceneBody} ${styles.sceneBodyHero}`}>
            <header className={styles.sceneCopy}>{children}</header>

            <div className={styles.ipadWrap}>
              <div
                className={`${styles.ipadStage} ${styles.xframe}`}
                style={{
                  transform: still
                    ? 'none'
                    : `rotateY(${KANTEL_Y + progress * DRIFT}deg) rotateX(${KANTEL_X}deg)`,
                }}
              >
                {Array.from({ length: DIKTE }, (_, i) => (
                  <span
                    key={i}
                    className={styles.ipadSlice}
                    style={{ transform: `translateZ(${-i - 1}px)` }}
                    aria-hidden="true"
                  />
                ))}

                <div className={styles.ipadBody}>
                  <span className={styles.ipadCam} aria-hidden="true" />
                  <div className={styles.ipadScreen}>
                    <div
                      className={styles.ipadTrack}
                      style={{ transform: `translate3d(calc(${-pos} * 100%), 0, 0)` }}
                    >
                      {SCHERMEN.map((s, i) => (
                        <div
                          key={s.src}
                          className={styles.ipadSlide}
                          style={{ left: `${i * 100}%`, ['--rel' as string]: `${i - pos}` }}
                          aria-hidden={!still && i !== index && i !== index + 1}
                        >
                          <Image
                            src={s.src}
                            alt={s.alt}
                            width={1643}
                            height={1232}
                            priority={i === 0}
                            sizes="(max-width: 900px) 100vw, 640px"
                            className={styles.ipadImg}
                          />
                        </div>
                      ))}
                    </div>
                    <span className={styles.ipadGloss} aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div className={`${styles.sceneProgress} ${styles.sceneProgressOnder}`} aria-hidden="true">
                {SCHERMEN.map((s, i) => (
                  <span key={s.src} className={styles.sceneBar}>
                    <i style={{ transform: `scaleX(${i < index ? 1 : i === index ? within : 0})` }} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
