import Image from 'next/image'
import Link from 'next/link'
import styles from './base-site.module.css'
import { Reveal } from './Reveal'
import { ScrambleText } from './ScrambleText'
import { IpadScene } from './IpadScene'
import { BuildScene } from './BuildScene'
import { PhoneScene } from './PhoneScene'

/**
 * Publieke BASE-site.
 *
 * INHOUD volgt de goedgekeurde spec
 * docs/superpowers/specs/2026-08-19-base-public-site-redesign-design.md:
 * BASE staat vooraan als platform voor fysiotherapiepraktijken, en de pagina
 * loopt het hele traject af van uitnodigen tot rapporteren.
 *
 * VORM, herzien 21-08-2026 na het oordeel van Jurre dat de pagina te veel op
 * een gegenereerde landingspagina leek. Drie dingen veroorzaakten dat, en die
 * zijn alle drie aangepakt. Wie hier iets toevoegt, houdt ze in stand:
 *
 * 1. TWAALF KEER HETZELFDE RITME. Elke sectie was label, kop, alinea, paneel
 *    ernaast. Nu wisselen de vormen bewust van schaal: een schermbreed beeld,
 *    een rij korte kolommen, twee plakscenes met lange verblijfstijd (het
 *    dragende sensiq-mechanisme, zie docs/sensiq-dna.md §2), een curve, een
 *    vergelijking. Voeg niet opnieuw een sectie toe in het standaardstramien.
 * 2. EEN GENUMMERDE LIJST 01 TOT 06. Weg als lijst. De stappen die echt een
 *    volgorde zijn (bouwen, criteria, plannen) leven nu in BuildScene, waar
 *    de volgorde informatie draagt.
 * 3. NAGETEKENDE PANELEN. Dit is de belangrijkste. Sensiq, de referentie, wordt
 *    gedragen door foto's van een fysieke ring. Software heeft dat niet, dus
 *    stonden hier tekeningen die op de app leken, en juist die lezen als
 *    gegenereerd. Onze versie van die ringfoto is het echte scherm: zie
 *    ScreenShot.tsx en de frames in BuildScene. Zet er nooit een natekening
 *    van de app terug. Eén uitzondering, op verzoek van Jurre: PhoneScene is
 *    een bewegende demonstratie (bogen die zich uittekenen kan een foto
 *    niet), expliciet gelabeld met voorbeeldwaarden.
 *
 * De grond is die van de app zelf (#0A1C1D), niet het crème van de
 * praktijksite. Daardoor valt een opname zonder naad in de pagina en staat BASE
 * ook visueel los van movementbasedtherapy.nl. Zie de tokens boven in
 * base-site.module.css.
 *
 * Wat uit de praktijkstijl blijft gelden: vierkant, haarlijnen dragen het
 * ontwerp, oranje is actie en mint is meting, mono labels met scramble.
 */
const DEMO_MAIL =
  'mailto:jurre@movementbasedtherapy.nl?subject=BASE%20demo%20voor%20mijn%20praktijk&body=Hoi%20Jurre%2C%20ik%20zou%20graag%20een%20demo%20van%20BASE%20voor%20mijn%20praktijk.'

export function BaseLanding() {
  return (
    // De vaste klasse `base-site` naast de module-klasse: globals.css gebruikt
    // hem om overflow-x op html/body naar `clip` te zetten, anders plakken de
    // plakscenes niet (zie het commentaar bij .page in de module).
    <main className={`base-site ${styles.page}`}>
      {/* ── Menubalk ─────────────────────────────────────────────────── */}
      <nav className={styles.navBar} aria-label="Hoofdmenu">
        <div className={styles.navInner}>
          <Link href="/" className={styles.navBrand}>BASE</Link>
          <div className={styles.navCells}>
            <span className={`${styles.navCell} ${styles.navCellHome}`} aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M2 7l6-5 6 5v7H2z" />
              </svg>
            </span>
            <a className={`${styles.navCell} ${styles.navHideSmall}`} href="#platform">
              <ScrambleText text="Platform" />
            </a>
            <a className={`${styles.navCell} ${styles.navHideSmall}`} href="#voor-praktijken">
              <ScrambleText text="Voor praktijken" />
            </a>
            <Link className={styles.navCell} href="/login">
              <ScrambleText text="Inloggen" />
            </Link>
            <a className={`${styles.navCell} ${styles.navCellAccent}`} href={DEMO_MAIL}>
              <ScrambleText text="Plan een demo" />
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero: de titel met de iPad ernaast ────────────────────────── */}
      {/* De scene draagt de hele hero: de tekst blijft staan terwijl de
          schermen langsschuiven. Het kruisjeskader staat op dit beeld, en op
          precies dit ene beeld van de pagina. */}
      <IpadScene>
        <p className={styles.eyebrow}>
          <ScrambleText text="Van programma tot voortgangsrapport" />
        </p>
        <h1 className={`${styles.head} ${styles.headSmall}`}>
          <span className={styles.ln}>Houd het hele</span>
          <span className={styles.ln}>traject in beeld</span>
        </h1>
        <p className={styles.lede}>
          In BASE komen programma&#39;s, trainingen, criteria en metingen samen. Jij plant en
          beoordeelt, je patiënt traint en logt, en <em>jullie kijken naar dezelfde
          voortgang</em>.
        </p>
        <div className={styles.btnRow}>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href={DEMO_MAIL}>
            <ScrambleText text="Plan een demo" />
            <span className={styles.btnArrow} aria-hidden="true">&rarr;</span>
          </a>
          <a className={styles.btn} href="#platform">
            <ScrambleText text="Bekijk het platform" />
            <span className={styles.btnArrow} aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </IpadScene>

      {/* ── Wat je ziet als je opent ──────────────────────────────────── */}
      <section className={`${styles.sec} ${styles.secBand}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Signalen" /></p>
            <h2 className={styles.head}>
              <span className={styles.ln}>Zie in één oogopslag</span>
              <span className={styles.ln}>wie er aandacht</span>
              <span className={styles.ln}>nodig heeft</span>
            </h2>
            <p className={styles.lede}>
              Met ons dashboard zie je direct wie aandacht nodig heeft, welk programma
              gecontroleerd moet worden en welke patiënt recent iets heeft gelogd.
            </p>
            <div className={styles.trio}>
              <article className={styles.trioCell}>
                <h3 className={styles.trioTitle}>Stilgevallen</h3>
                <p className={styles.rowText}>
                  Zeven dagen niets gelogd, en de laatste sessie was een afgebroken programma.
                </p>
              </article>
              <article className={styles.trioCell}>
                <h3 className={styles.trioTitle}>Boven de opbouw</h3>
                <p className={styles.rowText}>
                  Belasting 52 procent boven de weekopbouw, drie dagen op rij.
                </p>
              </article>
              <article className={styles.trioCell}>
                <h3 className={styles.trioTitle}>Hertest open</h3>
                <p className={styles.rowText}>
                  Symmetrie quadriceps van 71 naar 78 procent, de hop-batterij staat in week 33.
                </p>
              </article>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Plakscene: bouwen, criteria, plannen ──────────────────────── */}
      {/* De id zit op een wrapper omdat de scene zelf zijn sticky-hoogte
          nodig heeft; het menu-anker moet op de bovenkant landen. */}
      <div id="platform">
        <BuildScene />
      </div>

      {/* ── Het rapport ───────────────────────────────────────────────── */}
      <section className={`${styles.sec} ${styles.secBand}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <div className={styles.duo}>
              <div>
                <p className={styles.eyebrow}><ScrambleText text="Evalueren en rapporteren" /></p>
                <h2 className={styles.head}>
                  <span className={styles.ln}>Eén rapport</span>
                  <span className={styles.ln}>voor patiënt</span>
                  <span className={styles.ln}>en verwijzer</span>
                </h2>
                <p className={styles.lede}>
                  Doelen, criteria, testen, uitvoering en belasting staan naast elkaar. Jij
                  interpreteert de uitslag en wijzigt het programma; wat relevant is deel je als
                  verzorgde PDF met de patiënt en de verwijzer.
                </p>
              </div>
              {/* Het rapport zelf, zoals de verwijzer het krijgt. Stond hier eerst
                  als vier verzonnen cijfers; een echte pagina zegt meer dan een
                  cijfer dat niemand kan narekenen. Gemaakt op het demo-account
                  met scripts/seed-demo-test-report.ts en afgedrukt via de eigen
                  printroute (/print/test-report/[id]). */}
              <figure className={styles.rapport}>
                <Image
                  src="/base-site/rapport-verwijzer-2.png"
                  alt="De eerste pagina van een testrapport uit BASE: kopgegevens van patiënt en behandelaar, en per test de waarde links en rechts met de symmetrie in een gekleurde zonebalk"
                  width={1240}
                  height={1753}
                  sizes="(max-width: 880px) 100vw, 520px"
                  className={styles.rapportImg}
                />
              </figure>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Totale trainingsbelasting ─────────────────────────────────── */}
      <section className={styles.sec}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Totale trainingsbelasting" /></p>
            <h2 className={styles.head}>
              <span className={styles.ln}>Zie de opbouw van</span>
              <span className={styles.ln}>de afgelopen weken</span>
            </h2>
            <p className={styles.lede}>
              De curve telt op wat je patiënt zelf logt, wat jij tijdens een afspraak registreert en,
              bij een atletenaccount, de eigen training en wearable-data. Kracht en cardio staan
              apart, met de vorm ernaast: fitheid tegenover vermoeidheid. Een terugval door ziekte of
              een drukke week valt meteen op.
            </p>
            {/* Stond hier eerst als getekende curve (LoadCurve.tsx, verwijderd);
                dit is het echte belastingsscherm uit de app. De kop is meegegaan:
                het beeld toont twee lijnen, kracht en cardio apart, dus "alle
                belasting in één lijn" klopte niet meer. */}
            <figure className={styles.curve}>
              <Image
                src="/base-site/ipad-belastingcurve-2.png"
                alt="Het belastingsscherm van BASE: dertig dagen cardio- en krachtbelasting als twee curves met doelzones, en onder de grafiek de aangetikte trainingsdag met duur, RPE en belasting"
                width={1668}
                height={1340}
                sizes="(max-width: 1100px) 100vw, 1040px"
                className={styles.curveImg}
              />
            </figure>
          </Reveal>
        </div>
      </section>

      {/* ── Wat de patiënt ziet ───────────────────────────────────────── */}
      <section className={`${styles.sec} ${styles.secBand}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Aan de kant van de patiënt" /></p>
            <h2 className={styles.head}>
              <span className={styles.ln}>Je patiënt weet wat er</span>
              <span className={styles.ln}>vandaag moet gebeuren</span>
            </h2>
            <p className={styles.lede}>
              Geen papieren schema dat kwijtraakt. Het programma staat per dag klaar met video, en
              wat er gelogd wordt komt bij jou terug. <em>Doelen en criteria staan er in gewone taal
              bij</em>, zodat iemand snapt waar hij naartoe werkt. Traint iemand naast de revalidatie
              door, dan koppelt hij zijn wearable en komen slaap, hartslag en herstel mee in
              hetzelfde beeld.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Plakscene: de telefoon met de gezondheidsfuncties ─────────── */}
      <PhoneScene />

      {/* ── De twee accounts ──────────────────────────────────────────── */}
      <section id="voor-praktijken" className={`${styles.sec} ${styles.secBand}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Accounts" /></p>
            <h2 className={`${styles.head} ${styles.headSmall}`}>
              Patiëntaccount en atletenaccount
            </h2>
            <div className={styles.compare}>
              <article className={styles.trioCell}>
                <h3 className={styles.trioTitle}>Patiënt</h3>
                <ul className={styles.trioList}>
                  <li>Toegewezen programma&#39;s per dag, met video</li>
                  <li>Doelen, testen en voortgang</li>
                  <li>Uitvoering, belasting en klachtrespons loggen</li>
                </ul>
              </article>
              <article className={styles.trioCell}>
                <h3 className={styles.trioTitle}>Atleet</h3>
                <ul className={styles.trioList}>
                  <li>Alles uit het patiëntaccount</li>
                  <li>Eigen workouts maken en loggen</li>
                  <li>Wearables koppelen voor slaap, hartslag en cardio</li>
                  <li>Extra herstel- en gezondheidsdata voor de begeleiding</li>
                </ul>
              </article>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Praktijkcontext en slot ───────────────────────────────────── */}
      <section className={`${styles.sec} ${styles.closer}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Waar BASE vandaan komt" /></p>
            <p className={styles.lede} style={{ marginBottom: 'clamp(30px, 4vw, 48px)' }}>
              BASE is gebouwd binnen Movement Based Therapy, een sportfysiotherapiepraktijk in
              Amsterdam, en groeide uit het dagelijkse werk daar. Alles wat je hierboven ziet wordt
              in de praktijk zelf gebruikt.
            </p>
            <h2 className={styles.giant}>
              <span>Bekijk hoe</span>
              <span>BASE in je</span>
              <span><i>praktijk</i> werkt</span>
            </h2>
            <div className={styles.btnRow}>
              <a className={`${styles.btn} ${styles.btnPrimary}`} href={DEMO_MAIL}>
                <ScrambleText text="Plan een demo" />
                <span className={styles.btnArrow} aria-hidden="true">&rarr;</span>
              </a>
              <Link className={styles.btn} href="/login">
                <ScrambleText text="Inloggen" />
                <span className={styles.btnArrow} aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Voettekst ────────────────────────────────────────────────── */}
      <footer className={`${styles.sec} ${styles.closer}`}>
        <div className={styles.shell}>
          <p className={styles.footerMark} aria-hidden="true">BASE</p>
          <div className={styles.footBar}>
            <span className={styles.footLink}>
              <ScrambleText text="BASE by Movement Based Therapy" />
            </span>
            <div className={styles.footLinks}>
              {/* Adres ook zichtbaar, zodat contact mogelijk blijft als er geen
                  mailclient opent (spec sectie 10). */}
              <a className={styles.footLink} href={DEMO_MAIL}>jurre@movementbasedtherapy.nl</a>
              <a className={styles.footLink} href="https://www.movementbasedtherapy.nl">
                <ScrambleText text="Praktijk-site" />
              </a>
              <a className={styles.footLink} href="https://movementbasedtherapy.nl/privacy-policy.html">
                <ScrambleText text="Privacyverklaring" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
