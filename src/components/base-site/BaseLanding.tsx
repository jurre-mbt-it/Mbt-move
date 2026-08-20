import Link from 'next/link'
import styles from './base-site.module.css'
import { Reveal } from './Reveal'
import { LoadCurve } from './LoadCurve'
import { ScrambleText } from './ScrambleText'
import { Counter } from './Counter'

/**
 * Publieke BASE-site.
 *
 * INHOUD volgt de goedgekeurde spec
 * docs/superpowers/specs/2026-08-19-base-public-site-redesign-design.md:
 * BASE staat vooraan als platform voor fysiotherapiepraktijken, en de pagina
 * loopt het hele traject af van uitnodigen tot rapporteren.
 *
 * VORM volgt het skelet van sensiq.co (gesegmenteerde menubalk, per sectie een
 * label met een kop en een productbeeld ernaast) met de huid van
 * movementbasedtherapy.nl (docs/design-systeem.md daar): vierkant, haarlijnen
 * dragen het ontwerp, oranje is actie en mint is meting, mono labels met
 * scramble.
 *
 * Waar de spec en de latere vraag van Jurre botsten:
 * - De spec schrapt de bewegende ticker. Die is eruit.
 * - De spec schrapt mono hoofdletters als algemeen stijlelement, maar Jurre
 *   vroeg later expliciet om de menubalk met omspringende letters. Mono blijft
 *   daarom op de menubalk, de sectielabels en echte datalabels, en staat niet
 *   in lopende tekst.
 *
 * NOG NIET GEREED VOLGENS DE SPEC: die vraagt vijf echte, gesaniteerde
 * BASE-schermen als productbeeld. Die zijn er nog niet. De panelen hieronder
 * zijn opgebouwd uit dezelfde componenten en waarden als de app, maar ze zijn
 * geen screenshot. Zie het rapport bij deze wijziging.
 */
const DEMO_MAIL =
  'mailto:jurre@movementbasedtherapy.nl?subject=BASE%20demo%20voor%20mijn%20praktijk&body=Hoi%20Jurre%2C%20ik%20zou%20graag%20een%20demo%20van%20BASE%20voor%20mijn%20praktijk.'

export function BaseLanding() {
  return (
    <main className={styles.page}>
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
            <a className={`${styles.navCell} ${styles.navHideSmall}`} href="#werkwijze">
              <ScrambleText text="Werkwijze" />
            </a>
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

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className={styles.sec}>
        <div className={`${styles.shell} ${styles.block}`}>
          <div className={`${styles.duo} ${styles.duoTop}`}>
            <div>
              <p className={styles.eyebrow}>
                <ScrambleText text="Van programma tot voortgangsrapport" />
              </p>
              <h1 className={styles.head}>
                <span className={styles.ln}>Houd het hele</span>
                <span className={styles.ln}>traject in beeld</span>
              </h1>
              <p className={styles.lede}>
                In BASE komen programma&#39;s, trainingen, criteria en metingen samen. Jij plant en
                beoordeelt, je patiënt traint en logt, en <em>jullie kijken naar dezelfde
                voortgang</em>. Het platform ondersteunt de beslissing en neemt de klinische regie
                niet over.
              </p>
              <div className={styles.btnRow}>
                <a className={`${styles.btn} ${styles.btnPrimary}`} href={DEMO_MAIL}>
                  <ScrambleText text="Plan een demo" />
                  <span className={styles.btnArrow} aria-hidden="true">&rarr;</span>
                </a>
                <a className={styles.btn} href="#werkwijze">
                  <ScrambleText text="Bekijk de werkwijze" />
                  <span className={styles.btnArrow} aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </div>

            {/* Het kruisjeskader staat op precies dit ene beeld, één per pagina. */}
            <div className={`${styles.stage} ${styles.stageDark} ${styles.xframe}`}>
              <p className={styles.dataName} style={{ marginBottom: 4 }}>
                Therapeutoverzicht &middot; week 31
              </p>
              <div className={`${styles.dataCard} ${styles.dataCardRaised}`}>
                <div className={styles.dataTop}>
                  <span className={styles.dataName}>Actieve trajecten</span>
                  <span className={styles.pill}>4 lopen</span>
                </div>
                <span className={styles.dataValue}>18</span>
                <p className={styles.dataNote}>
                  Vier patiënten hebben deze week een hertest openstaan.
                </p>
              </div>
              <div className={styles.dataCard}>
                <div className={styles.dataTop}>
                  <span className={styles.dataName}>Criteria VKB-traject</span>
                  <span className={styles.pill}>Fase 5 van 8</span>
                </div>
                <div className={styles.meter}><i style={{ width: '62%' }} /></div>
                <p className={styles.dataNote}>
                  Symmetrie quadriceps 78 procent. <em>Doel voor fase 6 is 90 procent.</em>
                </p>
              </div>
              <div className={styles.dataCard}>
                <div className={styles.dataTop}>
                  <span className={styles.dataName}>Belasting deze week</span>
                  <span className={styles.pill}>+12%</span>
                </div>
                <div className={styles.meter}><i style={{ width: '74%' }} /></div>
                <p className={styles.dataNote}>
                  Programma, therapiesessie en eigen training bij elkaar opgeteld.
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Werkwijze, de zes stappen ────────────────────────────────── */}
      <section id="werkwijze" className={`${styles.sec} ${styles.secDark}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Werkwijze" /></p>
            <h2 className={`${styles.head} ${styles.headSmall}`}>
              Van intake naar evaluatie, in zes stappen
            </h2>
            <p className={styles.lede}>
              De intake en je klinische werkhypothese blijven jouw werk. BASE begint op het moment
              dat je een patiënt uitnodigt en loopt door tot het rapport dat je met de verwijzer
              deelt.
            </p>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowNum}>01</span>
                <h3 className={styles.rowTitle}>Uitnodigen</h3>
                <p className={styles.rowText}>
                  Je voert de patiënt in en verstuurt vanuit dezelfde flow een uitnodiging. De
                  patiënt krijgt toegang tot het toegewezen traject.
                </p>
              </div>
              <div className={styles.row}>
                <span className={styles.rowNum}>02</span>
                <h3 className={styles.rowTitle}>Plannen</h3>
                <p className={styles.rowText}>
                  Meerdere programma&#39;s tegelijk op één patiënt: dagelijkse oefeningen, een
                  krachtschema en een meerweeks trainingsplan kunnen naast elkaar in dezelfde week
                  staan, flexibel doorlopend of op vaste dagen.
                </p>
              </div>
              <div className={styles.row}>
                <span className={styles.rowNum}>03</span>
                <h3 className={styles.rowTitle}>Criteria koppelen</h3>
                <p className={styles.rowText}>
                  Koppel een bestaand protocol aan het traject, voeg losse testen toe of stel een
                  eigen testbatterij samen. Patiënt en therapeut zien dezelfde doelen, criteria en
                  openstaande onderdelen.
                </p>
              </div>
              <div className={styles.row}>
                <span className={styles.rowNum}>04</span>
                <h3 className={styles.rowTitle}>Trainen en loggen</h3>
                <p className={styles.rowText}>
                  De patiënt logt de toegewezen trainingen. Train je tijdens een afspraak mee, dan
                  registreer je die sessie direct, zodat behandeltijd meetelt in dezelfde totale
                  belasting.
                </p>
              </div>
              <div className={styles.row}>
                <span className={styles.rowNum}>05</span>
                <h3 className={styles.rowTitle}>Voortgang volgen</h3>
                <p className={styles.rowText}>
                  De belastingcurve laat zien hoe de belasting zich over meerdere weken ontwikkelt
                  en waar die vandaan komt. Dat is context voor jouw evaluatie, geen automatische
                  beslissing.
                </p>
              </div>
              <div className={styles.row}>
                <span className={styles.rowNum}>06</span>
                <h3 className={styles.rowTitle}>Evalueren en rapporteren</h3>
                <p className={styles.rowText}>
                  Doelen, criteria, testen, uitvoering en belasting staan naast elkaar. Wat relevant
                  is deel je als verzorgde PDF met de patiënt en de verwijzer.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Programmeren ─────────────────────────────────────────────── */}
      <section id="platform" className={styles.sec}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <div className={styles.duo}>
              <div>
                <p className={styles.eyebrow}><ScrambleText text="Programmeren" /></p>
                <h2 className={styles.head}>
                  <span className={styles.ln}>Meerdere</span>
                  <span className={styles.ln}>programma&#39;s in</span>
                  <span className={styles.ln}>dezelfde week</span>
                </h2>
                <p className={styles.lede}>
                  De weekplanner zet kalenderweken onder elkaar met de zeven dagen als vaste
                  kolommen en een weektotaal aan het eind. Programma&#39;s lopen flexibel door of
                  staan op vaste dagen, en een meerweeks trainingsplan zet je in één keer op de
                  kalender van je patiënt.
                </p>
              </div>
              <div className={`${styles.stage} ${styles.stageDark}`}>
                <p className={styles.dataName}>Weekplanner &middot; W31 tot W33</p>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Maandag 28 juli</span>
                    <span className={styles.dataValue} style={{ fontSize: '14px' }}>Knie 3B</span>
                  </div>
                  <p className={styles.dataNote}>Programma-item, drie oefeningen met video.</p>
                </div>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Woensdag 30 juli</span>
                    <span className={styles.dataValue} style={{ fontSize: '14px' }}>Kracht A</span>
                  </div>
                  <p className={styles.dataNote}>Meerweeks trainingsplan, week 2 van 8.</p>
                </div>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Weektotaal</span>
                    <span className={styles.pill}>5 sessies</span>
                  </div>
                  <p className={styles.dataNote}>3 uur 20 in totaal, belasting 342.</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Criteria en testen ───────────────────────────────────────── */}
      <section className={styles.sec}>
        <div className={`${styles.shell} ${styles.block}`} style={{ paddingTop: 0 }}>
          <Reveal>
            <div className={styles.duo}>
              <div className={`${styles.stage} ${styles.stageDark}`}>
                <p className={styles.dataName}>VKB-traject &middot; fase 5 van 8</p>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Symmetrie quadriceps</span>
                    <span className={styles.pill}>78%</span>
                  </div>
                  <div className={styles.meter}><i style={{ width: '78%' }} /></div>
                  <p className={styles.dataNote}>Rechts 167 N tegen links 214 N, gemeten met de dynamometer.</p>
                </div>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Single leg hop</span>
                    <span className={styles.pill}>Behaald</span>
                  </div>
                  <p className={styles.dataNote}>Hertest staat gepland in week 33.</p>
                </div>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Openstaand</span>
                    <span className={styles.dataValue} style={{ fontSize: '15px' }}>2 testen</span>
                  </div>
                  <p className={styles.dataNote}>Patiënt ziet dezelfde lijst in de app.</p>
                </div>
              </div>
              <div>
                <p className={styles.eyebrow}><ScrambleText text="Criteria en testen" /></p>
                <h2 className={styles.head}>
                  <span className={styles.ln}>Criteria bepalen</span>
                  <span className={styles.ln}>de volgende stap</span>
                </h2>
                <p className={styles.lede}>
                  Koppel een bestaand revalidatieprotocol aan het traject, voeg losse testen toe of
                  stel je eigen testbatterij samen. Wat behaald is en wat nog openstaat is voor
                  jullie allebei zichtbaar. <em>Jij interpreteert de uitslag en wijzigt het
                  programma.</em>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Totale trainingsbelasting ────────────────────────────────── */}
      <section className={`${styles.sec} ${styles.secDark}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Totale trainingsbelasting" /></p>
            <h2 className={styles.head}>
              <span className={styles.ln}>Alle belasting</span>
              <span className={styles.ln}>in één lijn</span>
            </h2>
            <p className={styles.lede}>
              De curve telt op wat de patiënt zelf logt, wat jij tijdens een afspraak registreert en,
              bij een atletenaccount, de eigen training en wearable-data. Een terugval door ziekte of
              een drukke week valt meteen op.
            </p>
            <LoadCurve />
          </Reveal>
        </div>
      </section>

      {/* ── Accounts ─────────────────────────────────────────────────── */}
      <section id="voor-praktijken" className={styles.sec}>
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

      {/* ── Evalueren en rapporteren ─────────────────────────────────── */}
      <section className={styles.sec}>
        <div className={`${styles.shell} ${styles.block}`} style={{ paddingTop: 0 }}>
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
                  Testontwikkeling en trainingsbelasting komen samen in een verzorgde PDF. Je deelt
                  wat relevant is en houdt de rest bij je in het dossier.
                </p>
              </div>
              <div className={styles.figures}>
                <div className={styles.figure}>
                  <span className={styles.figureVal}><Counter to={8} /></span>
                  <span className={styles.figureLabel}>Fases in traject</span>
                  <p className={styles.figureNote}>Van eerste meting tot terugkeer naar sport.</p>
                </div>
                <div className={styles.figure}>
                  <span className={styles.figureVal}><Counter to={78} /><small>%</small></span>
                  <span className={styles.figureLabel}>Symmetrie nu</span>
                  <p className={styles.figureNote}>Gemeten met de dynamometer, links tegen rechts.</p>
                </div>
                <div className={styles.figure}>
                  <span className={styles.figureVal}><Counter to={342} /></span>
                  <span className={styles.figureLabel}>Belasting deze week</span>
                  <p className={styles.figureNote}>Programma, therapiesessie en eigen training.</p>
                </div>
                <div className={styles.figure}>
                  <span className={styles.figureVal}><Counter to={2} /></span>
                  <span className={styles.figureLabel}>Openstaande testen</span>
                  <p className={styles.figureNote}>Ingepland voor de hertest in week 33.</p>
                </div>
              </div>
            </div>
            <p className={styles.eyebrow} style={{ marginTop: 18 }}>
              <ScrambleText text="Voorbeeldwaarden uit een fictief traject" />
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Praktijkcontext en slot ──────────────────────────────────── */}
      <section className={`${styles.sec} ${styles.secDark} ${styles.closer}`}>
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
      <footer className={`${styles.sec} ${styles.secDark} ${styles.closer}`}>
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
