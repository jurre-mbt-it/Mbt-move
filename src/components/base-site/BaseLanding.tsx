import Link from 'next/link'
import styles from './base-site.module.css'
import { Reveal } from './Reveal'
import { LoadCurve } from './LoadCurve'
import { ScrambleText } from './ScrambleText'
import { Counter } from './Counter'

/**
 * Publieke BASE-site.
 *
 * Skelet van sensiq.co: gesegmenteerde menubalk, per sectie een klein label met
 * een kop van drie regels en een datakaart ernaast, cijfers die vanaf nul
 * oplopen, een slotblok.
 *
 * Huid van movementbasedtherapy.nl, volgens docs/design-systeem.md daar:
 * vierkant, haarlijnen dragen het ontwerp, oranje is actie en mint is meting,
 * mono labels met scramble, en het sectieritme dat wisselt tussen papier en
 * diepgroen.
 *
 * Tekst volgt docs/tone-of-voice.md register 6: een korte inhoudelijke belofte
 * over belastbaarheid, meteen gevolgd door praktische feiten. De cijfers zijn
 * voorbeeldwaarden uit de app en staan als zodanig benoemd; verzonnen
 * praktijkcijfers horen hier niet.
 */
const ACCESS_MAIL =
  'mailto:jurre@movementbasedtherapy.nl?subject=BASE%20toegang&body=Hoi%20Jurre%2C%20ik%20zou%20graag%20toegang%20tot%20BASE.'

const TICKER = [
  'Krachtmeting', 'Dagbelasting', 'Slaap', 'Loopanalyse', 'Programma', 'Herstel', 'Testrapport',
]

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
            <a className={`${styles.navCell} ${styles.navHideSmall}`} href="#wat-is-base">
              <ScrambleText text="Wat is BASE" />
            </a>
            <a className={`${styles.navCell} ${styles.navHideSmall}`} href="#voor-wie">
              <ScrambleText text="Voor wie" />
            </a>
            <a className={`${styles.navCell} ${styles.navHideSmall}`} href="#hoe-het-werkt">
              <ScrambleText text="Hoe het werkt" />
            </a>
            <Link className={styles.navCell} href="/login">
              <ScrambleText text="Inloggen" />
            </Link>
            <a className={`${styles.navCell} ${styles.navCellAccent}`} href={ACCESS_MAIL}>
              <ScrambleText text="Vraag toegang" />
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
                <ScrambleText text="App van Movement Based Therapy" />
              </p>
              <h1 className={styles.head}>
                <span className={styles.ln}>Sterker worden</span>
                <span className={styles.ln}>begint bij</span>
                <span className={styles.ln}>meten</span>
              </h1>
              <p className={styles.lede}>
                Je fysiotherapeut stelt je programma samen, jij traint en logt wat je doet, en je
                metingen laten zien wanneer de volgende stap veilig is. <em>Kracht, controle en
                pijnvrijheid</em> geven de doorslag.
              </p>
              <div className={styles.btnRow}>
                <a className={`${styles.btn} ${styles.btnPrimary}`} href={ACCESS_MAIL}>
                  <ScrambleText text="Vraag toegang" />
                  <span className={styles.btnArrow} aria-hidden="true">&rarr;</span>
                </a>
                <a className={styles.btn} href="#hoe-het-werkt">
                  <ScrambleText text="Hoe het werkt" />
                  <span className={styles.btnArrow} aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </div>

            {/* Het kruisjeskader staat op precies dit ene beeld, één per pagina. */}
            <div className={`${styles.stage} ${styles.stageDark} ${styles.xframe}`}>
              <p className={styles.dataName} style={{ marginBottom: 4 }}>Vanochtend</p>
              <div className={`${styles.dataCard} ${styles.dataCardRaised}`}>
                <div className={styles.dataTop}>
                  <span className={styles.dataName}>Herstel</span>
                  <span className={styles.pill}>Goed</span>
                </div>
                <span className={styles.dataValue}>78</span>
                <div className={styles.meter}><i style={{ width: '78%' }} /></div>
                <p className={styles.dataNote}>Je sliep 7 uur 12 en je rusthartslag was 52.</p>
              </div>
              <div className={styles.dataCard}>
                <div className={styles.dataTop}>
                  <span className={styles.dataName}>Belasting deze week</span>
                  <span className={styles.pill}>+12%</span>
                </div>
                <span className={styles.dataValue}>342</span>
                <div className={styles.meter}><i style={{ width: '62%' }} /></div>
                <p className={styles.dataNote}>Consistente opbouw, ruimte om door te zetten.</p>
              </div>
              <div className={styles.dataCard}>
                <div className={styles.dataTop}>
                  <span className={styles.dataName}>Vandaag</span>
                  <span className={styles.dataValue} style={{ fontSize: '15px' }}>Knie 3B</span>
                </div>
                <p className={styles.dataNote}>Split squat, nordic curl en calf raise, met video.</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Lopende band ─────────────────────────────────────────────── */}
      <div className={styles.ticker}>
        <div className={styles.tickerTrack}>
          {[0, 1].map((copy) => (
            <span key={copy} style={{ display: 'contents' }}>
              {TICKER.map((word) => (
                <span key={`${copy}-${word}`}>
                  {word} <span className={styles.sep}>&middot;</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── Belastingcurve ───────────────────────────────────────────── */}
      <section id="wat-is-base" className={`${styles.sec} ${styles.secDark}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Belasting over tijd" /></p>
            <h2 className={styles.head}>Twaalf weken opbouw in één lijn</h2>
            <p className={styles.lede}>
              BASE telt elke dag je belasting op uit je hartslag en uit wat je logt. Je ziet of je
              opbouwt, of je stilstaat en of je te hard gaat. Een terugval door ziekte of een drukke
              week valt meteen op, en je therapeut past het plan daarop aan.
            </p>
            <LoadCurve />
          </Reveal>
        </div>
      </section>

      {/* ── In de app ────────────────────────────────────────────────── */}
      <section className={styles.sec}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <div className={styles.duo}>
              <div>
                <p className={styles.eyebrow}><ScrambleText text="In de app" /></p>
                <h2 className={styles.head}>Alles staat al klaar als je opent</h2>
                <p className={styles.lede}>
                  Je programma per dag, met sets, herhalingen en video bij elke oefening. Wat je logt
                  komt terug in je belasting en in je metingen, en je fysiotherapeut kijkt mee tussen
                  twee afspraken door. <em>De app past je schema nooit zelf aan.</em>
                </p>
              </div>
              <div className={styles.stage}>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Krachtmeting week 12</span>
                    <span className={styles.pill}>78%</span>
                  </div>
                  <div className={styles.meter}><i style={{ width: '78%' }} /></div>
                  <p className={styles.dataNote}>
                    Quadriceps rechts 167 N tegen links 214 N. <em>Doel is 90 procent.</em>
                  </p>
                </div>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Slaap vannacht</span>
                    <span className={styles.dataValue} style={{ fontSize: '17px' }}>7 u 12</span>
                  </div>
                  <div className={styles.meter}><i style={{ width: '88%' }} /></div>
                  <p className={styles.dataNote}>Efficiëntie 88 procent.</p>
                </div>
                <div className={styles.dataCard}>
                  <div className={styles.dataTop}>
                    <span className={styles.dataName}>Apple Watch</span>
                    <span className={styles.pill}>Gesynced</span>
                  </div>
                  <p className={styles.dataNote}>Slaap, hartslag en cardiotraining lopen vanzelf mee.</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Voor wie ─────────────────────────────────────────────────── */}
      <section id="voor-wie" className={styles.sec}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Voor wie" /></p>
            <h2 className={`${styles.head} ${styles.headSmall}`}>Voor wie BASE gemaakt is</h2>
            <div className={styles.trio}>
              <article className={styles.trioCell}>
                <h3 className={styles.trioTitle}>In revalidatie</h3>
                <ul className={styles.trioList}>
                  <li>Je programma per dag, met video bij elke oefening</li>
                  <li>Pijn en gevoel loggen per sessie</li>
                  <li>Metingen die laten zien wanneer de volgende stap kan</li>
                </ul>
              </article>
              <article className={styles.trioCell}>
                <h3 className={styles.trioTitle}>Doortrainende sporters</h3>
                <ul className={styles.trioList}>
                  <li>Dagbelasting uit je hartslag</li>
                  <li>Kracht en cardio in hetzelfde logboek</li>
                  <li>Slaap en herstel van je watch</li>
                </ul>
              </article>
              <article className={styles.trioCell}>
                <h3 className={styles.trioTitle}>Therapeuten en coaches</h3>
                <ul className={styles.trioList}>
                  <li>Programma&#39;s samenstellen en op de week zetten</li>
                  <li>Testrapporten en loopanalyse in het dossier</li>
                  <li>Een signaal als iemand stilvalt</li>
                </ul>
              </article>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Hoe het werkt ────────────────────────────────────────────── */}
      <section id="hoe-het-werkt" className={`${styles.sec} ${styles.secDark}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Hoe het werkt" /></p>
            <h2 className={`${styles.head} ${styles.headSmall}`}>Van meting naar programma naar opbouw</h2>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowNum}>01</span>
                <h3 className={styles.rowTitle}>Eerst meten</h3>
                <p className={styles.rowText}>
                  We brengen in kaart wat je nu aankan: kracht links tegen rechts, de testen die bij
                  je klacht horen en hoe je beweegt. Dat is het vertrekpunt waar alles daarna aan
                  wordt afgemeten.
                </p>
              </div>
              <div className={styles.row}>
                <span className={styles.rowNum}>02</span>
                <h3 className={styles.rowTitle}>Je programma staat klaar</h3>
                <p className={styles.rowText}>
                  Je fysiotherapeut stelt het programma samen en zet het op je week. Jij opent de app
                  en ziet wat je vandaag doet, met sets, herhalingen en uitleg per oefening.
                </p>
              </div>
              <div className={styles.row}>
                <span className={styles.rowNum}>03</span>
                <h3 className={styles.rowTitle}>Bijsturen op wat je logt</h3>
                <p className={styles.rowText}>
                  Wat je logt komt terug in je belasting en in je metingen. Gaat het sneller dan
                  gepland of blijft de pijn hangen, dan past je therapeut het plan aan.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Een dag in cijfers ───────────────────────────────────────── */}
      <section className={styles.sec}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <p className={styles.eyebrow}><ScrambleText text="Een dag in cijfers" /></p>
            <h2 className={`${styles.head} ${styles.headSmall}`}>Wat de app op een dinsdag weet</h2>
            <div className={styles.figures}>
              <div className={styles.figure}>
                <span className={styles.figureVal}><Counter to={78} /></span>
                <span className={styles.figureLabel}>Herstelscore</span>
                <p className={styles.figureNote}>Uit je slaap, je rusthartslag en de belasting van gisteren.</p>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureVal}><Counter to={342} /></span>
                <span className={styles.figureLabel}>Dagbelasting</span>
                <p className={styles.figureNote}>Berekend uit je hartslag en uit wat je zelf logt.</p>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureVal}><Counter to={214} /><small>N</small></span>
                <span className={styles.figureLabel}>Kracht quadriceps</span>
                <p className={styles.figureNote}>Gemeten met de dynamometer, links tegen rechts.</p>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureVal}><Counter to={12} /><small>wk</small></span>
                <span className={styles.figureLabel}>Voorbeeldtraject</span>
                <p className={styles.figureNote}>Van de eerste meting tot het hertesten.</p>
              </div>
            </div>
            <p className={styles.eyebrow} style={{ marginTop: 18 }}>
              <ScrambleText text="Voorbeeldwaarden uit de app, geen praktijkcijfers" />
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Slot ─────────────────────────────────────────────────────── */}
      <section className={`${styles.sec} ${styles.secDark} ${styles.closer}`}>
        <div className={`${styles.shell} ${styles.block}`}>
          <Reveal>
            <h2 className={styles.giant}>
              <span>Wil je</span>
              <span>BASE <i>gebruiken?</i></span>
            </h2>
            <p className={styles.lede}>
              De app draait op de iPhone en in de browser en is nu in beta. Loop je bij Movement
              Based Therapy, of wil je BASE in je eigen praktijk gebruiken, stuur dan een bericht.
            </p>
            <div className={styles.btnRow}>
              <a className={`${styles.btn} ${styles.btnPrimary}`} href={ACCESS_MAIL}>
                <ScrambleText text="Vraag toegang" />
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
              <a className={styles.footLink} href="https://www.movementbasedtherapy.nl">
                <ScrambleText text="Praktijk-site" />
              </a>
              <a className={styles.footLink} href="https://movementbasedtherapy.nl/privacy-policy.html">
                <ScrambleText text="Privacyverklaring" />
              </a>
              <a className={styles.footLink} href={ACCESS_MAIL}>
                <ScrambleText text="Contact" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
