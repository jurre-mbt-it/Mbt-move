import Image from 'next/image'
import styles from './base-site.module.css'
import { Reveal } from './Reveal'
import { ScrambleText } from './ScrambleText'

/**
 * Koppelingen: wat BASE ophaalt bij de bron, en apart de koppeling met KINVENT.
 *
 * Vorm: een strook van vier merken (haarlijngrid, woordmerk in de displayletter)
 * en daaronder een tweekoloms blok voor KINVENT. Dat is bewust een ander ritme
 * dan de kolommen elders op de pagina (zie de kop van BaseLanding.tsx).
 *
 * Logo's: zolang er geen officiële bestanden zijn staat het merk als woordmerk
 * in onze eigen letter. Zet je een logo in /public/base-site/koppelingen/ en
 * vul je `logo` in, dan wint dat automatisch. Gebruik alleen bestanden die het
 * merk zelf voor partners uitgeeft.
 *
 * Mint is meting (ontwerpsysteem regel 2): de KINVENT-cel krijgt daarom de
 * mintlijn, de andere drie niet.
 */
type Merk = {
  naam: string
  tag: string
  tekst: string
  logo?: { src: string; breedte: number; hoogte: number }
  meet?: boolean
}

const MERKEN: Merk[] = [
  {
    naam: 'Apple Health',
    tag: 'Apple Watch',
    tekst: 'Slaap, hartslag, HRV en workouts komen rechtstreeks van het toestel, per gegevenssoort met toestemming.',
  },
  {
    naam: 'Strava',
    tag: 'Trainingen',
    tekst: 'Een training staat in BASE zodra hij op Strava staat, met hartslag en tempo per minuut.',
  },
  {
    naam: 'Polar',
    tag: 'Horloge',
    tekst: 'Trainingen, slaap en Nightly Recharge via Polar Flow, ook naast een Apple Watch.',
  },
  {
    naam: 'KINVENT',
    tag: 'Krachtmeting',
    tekst: 'Kracht- en sprongmetingen van K-Push, K-Pull en K-Deltas, rechtstreeks in het testrapport.',
    meet: true,
  },
]

export function Koppelingen() {
  return (
    <section id="koppelingen" className={styles.sec}>
      <div className={`${styles.shell} ${styles.block}`}>
        <Reveal>
          <p className={styles.eyebrow}><ScrambleText text="Koppelingen" /></p>
          <h2 className={styles.head}>
            <span className={styles.ln}>Werkt met wat</span>
            <span className={styles.ln}>je al gebruikt</span>
          </h2>
          <p className={styles.lede}>
            Metingen en trainingen hoef je niet over te typen. BASE haalt ze op bij de bron, met
            toestemming van de gebruiker, en zet ze in hetzelfde dossier als het programma en de
            criteria.
          </p>

          <div className={styles.brands}>
            {MERKEN.map((merk) => (
              <article key={merk.naam} className={`${styles.brandCell} ${merk.meet ? styles.brandCellMeet : ''}`}>
                <p className={styles.brandTag}>{merk.tag}</p>
                {merk.logo ? (
                  <Image
                    src={merk.logo.src}
                    alt={merk.naam}
                    width={merk.logo.breedte}
                    height={merk.logo.hoogte}
                    className={styles.brandLogo}
                  />
                ) : (
                  <p className={`${styles.brandMark} ${merk.meet ? styles.brandMarkMeet : ''}`}>{merk.naam.toUpperCase()}</p>
                )}
                <p className={styles.brandNote}>{merk.tekst}</p>
              </article>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ── KINVENT apart: de koppeling die alleen BASE heeft ───────────── */}
      <div className={`${styles.shell} ${styles.block}`} style={{ paddingTop: 0 }}>
        <Reveal>
          <div className={styles.duo}>
            <div>
              <p className={styles.eyebrow}><ScrambleText text="KINVENT" /></p>
              <h2 className={styles.head}>
                <span className={styles.ln}>Van de krachtplaat</span>
                <span className={styles.ln}>naar het dossier</span>
              </h2>
              <p className={styles.lede}>
                Meet je met KINVENT, dan haalt BASE de metingen op bij KINVENT zelf en zet ze in het
                testrapport. Quadriceps en hamstrings in Newton, <em>links en rechts naast elkaar</em>,
                de sprong in centimeters. Jij bevestigt wat het dossier in mag; een handmatig
                ingevulde waarde wordt nooit overschreven.
              </p>
            </div>
            <div className={styles.kinventBox}>
              <p className={styles.brandTag}>Wat de koppeling doet</p>
              <ul className={styles.trioList}>
                <li>Rehab-criteria kleuren mee met de nieuwste meting, per fase van het protocol</li>
                <li>Kracht, symmetrie en sprongthoogte als verloop over maanden en jaren</li>
                <li>Rate of force development, stabilisatietijd en impuls per herhaling terug te vinden</li>
                <li>De sporter ziet dezelfde metingen in de app</li>
                <li>Eenheidscontrole op elke meting, zodat een verkeerde instelling op de plaat niet in het dossier komt</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
