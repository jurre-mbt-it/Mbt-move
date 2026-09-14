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
 * Logo's (/public/base-site/koppelingen/): Strava en Polar als officieel
 * woordmerk (Wikimedia Commons, wit gerenderd), Apple Health en KINVENT als
 * app-icoon naast de naam in onze letter (Apple Health via Commons, KINVENT
 * via de openbare App Store-API). Krijgen we van KINVENT een partnerbestand,
 * dan vervangt dat het icoon via het `logo`-veld.
 *
 * Mint is meting (ontwerpsysteem regel 2): de KINVENT-cel krijgt daarom de
 * mintlijn, de andere drie niet.
 */
type Merk = {
  naam: string
  tag: string
  tekst: string
  /** Woordmerk van het merk zelf (svg), wit gerenderd zodat de strook één toon houdt. */
  logo?: { src: string; breedte: number; hoogte: number }
  /** App-icoon naast de naam, voor merken zonder los woordmerk. */
  icoon?: { src: string }
  meet?: boolean
}

const MERKEN: Merk[] = [
  {
    naam: 'Apple Health',
    tag: 'Apple Watch',
    tekst: 'Slaap, hartslag, HRV en workouts, rechtstreeks van het horloge.',
    icoon: { src: '/base-site/koppelingen/apple-health.png' },
  },
  {
    naam: 'Strava',
    tag: 'Trainingen',
    tekst: 'Elke training met hartslag en tempo per minuut, zodra hij op Strava staat.',
    logo: { src: '/base-site/koppelingen/strava.svg', breedte: 432, hoogte: 91 },
  },
  {
    naam: 'Polar',
    tag: 'Horloge',
    tekst: 'Trainingen, slaap en Nightly Recharge uit Polar Flow.',
    logo: { src: '/base-site/koppelingen/polar.svg', breedte: 727, hoogte: 120 },
  },
  {
    naam: 'KINVENT',
    tag: 'Force plate',
    tekst: 'Kracht- en sprongtests van K-Push, K-Pull en K-Deltas, in het testrapport.',
    icoon: { src: '/base-site/koppelingen/kinvent.png' },
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
            <span className={styles.ln}>Horloge en force plate</span>
            <span className={styles.ln}>lezen we rechtstreeks uit</span>
          </h2>
          <p className={styles.lede}>
            Een training van de Apple Watch, Strava of Polar staat in het dossier zodra hij gelogd
            is, en een test op de KINVENT force plate komt in het testrapport terecht. Je hoeft
            niets over te typen, en de gebruiker geeft per koppeling zelf toestemming.
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
                  <p className={`${styles.brandMark} ${merk.meet ? styles.brandMarkMeet : ''}`}>
                    {merk.icoon && (
                      <Image src={merk.icoon.src} alt="" width={64} height={64} className={styles.brandIcon} />
                    )}
                    {merk.naam.toUpperCase()}
                  </p>
                )}
                <p className={styles.brandNote}>{merk.tekst}</p>
              </article>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ── KINVENT apart ─────────────────────────────────────────────── */}
      <div className={`${styles.shell} ${styles.block}`} style={{ paddingTop: 0 }}>
        <Reveal>
          <div className={styles.duo}>
            <div>
              <p className={styles.eyebrow}><ScrambleText text="KINVENT" /></p>
              <h2 className={styles.head}>
                <span className={styles.ln}>Force plate-tests</span>
                <span className={styles.ln}>staan direct</span>
                <span className={styles.ln}>in het rapport</span>
              </h2>
              <p className={styles.lede}>
                Meet je met KINVENT, dan haalt BASE de test op en zet hem in het testrapport:
                quadriceps en hamstrings in Newton, links en rechts naast elkaar, de CMJ in
                centimeters. Jij bevestigt wat het dossier in gaat, en een waarde die je zelf hebt
                ingevuld wordt nooit overschreven.
              </p>
            </div>
            <div className={styles.kinventBox}>
              <p className={styles.brandTag}>Wat de koppeling doet</p>
              <ul className={styles.trioList}>
                <li>Rehab-criteria kleuren mee met de nieuwste test, per fase van het protocol</li>
                <li>Kracht, links-rechtsverschil en sprongthoogte als verloop over maanden en jaren</li>
                <li>RFD, time to stabilisation en impuls per herhaling terug te vinden</li>
                <li>De sporter ziet dezelfde tests in de app</li>
                <li>Elke test wordt op eenheid gecontroleerd voordat hij het dossier in gaat</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
