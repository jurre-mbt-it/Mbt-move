import Link from 'next/link'
import styles from './base-site.module.css'
import { Reveal } from './Reveal'
import { LoadCurve } from './LoadCurve'

const ACCESS_MAIL =
  'mailto:jurre@movementbasedtherapy.nl?subject=BASE%20toegang&body=Hoi%20Jurre%2C%20ik%20zou%20graag%20toegang%20tot%20BASE.'

const TICKER = [
  'Krachtmeting',
  'Dagbelasting',
  'Slaap',
  'Loopanalyse',
  'Programma',
  'Herstel',
  'Testrapport',
]

export function BaseLanding() {
  return (
    <main className={styles.page}>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <header className={styles.hero}>
        <div className={styles.heroBed} aria-hidden="true" />
        <div className={styles.heroGrain} aria-hidden="true" />

        <div className={styles.shell}>
          <nav className={styles.nav}>
            <Link href="/" className={styles.wordmark}>BASE</Link>
            <div className={styles.navLinks}>
              <a className={`${styles.navLink} ${styles.navSection}`} href="#wat-base-is">Wat BASE is</a>
              <a className={`${styles.navLink} ${styles.navSection}`} href="#voor-wie">Voor wie</a>
              <a className={`${styles.navLink} ${styles.navSection}`} href="#hoe-het-werkt">Hoe het werkt</a>
              <Link className={styles.navLink} href="/login">Inloggen</Link>
            </div>
          </nav>
        </div>

        <div className={`${styles.shell} ${styles.heroInner}`}>
          <div>
            <p className={styles.heroEyebrow}>Better Assessment, Stronger Exercise</p>
            <h1 className={styles.heroType}>
              <span className={styles.heroLight}>Sterker worden is</span>
              <span className={styles.heroHeavy}>Meet<em>baar.</em></span>
            </h1>
            <p className={styles.heroSub}>
              BASE is de app van Movement Based Therapy. Je fysiotherapeut stelt je programma
              samen, jij traint en logt wat je doet, en je metingen laten zien wanneer de
              volgende stap veilig is.
            </p>
          </div>
          <div className={styles.ctaRow}>
            <a className={`${styles.btn} ${styles.btnSolid}`} href={ACCESS_MAIL}>Vraag toegang</a>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="#hoe-het-werkt">Hoe het werkt</a>
          </div>
        </div>
      </header>

      {/* ── Lopende band ────────────────────────────────────────────── */}
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

      {/* ── Wat BASE is ─────────────────────────────────────────────── */}
      <section id="wat-base-is" className={styles.section}>
        <div className={styles.shell}>
          <Reveal>
            <div className={styles.split}>
              <div>
                <p className={styles.label}>Wat BASE is</p>
                <h2 className={styles.sectionTitle}>Een app die je belastbaarheid bijhoudt</h2>
                <p className={styles.body} style={{ marginTop: 'clamp(16px, 2vw, 24px)' }}>
                  BASE hoort bij Movement Based Therapy, een sportfysiotherapiepraktijk in
                  Amsterdam. We werken evidence-based en sturen op belastbaarheid: hoeveel je
                  lichaam op dit moment aankan en hoe we dat stap voor stap vergroten. De app
                  maakt dat zichtbaar, voor jou en voor je therapeut.
                </p>
              </div>
              <ul className={styles.factList}>
                <li>
                  <b>Meten</b>
                  <span>
                    Kracht met de dynamometer, links tegen rechts, plus de testen die bij jouw
                    klacht horen.
                  </span>
                </li>
                <li>
                  <b>Belasting</b>
                  <span>
                    Uit je hartslag en je logboek berekent BASE elke dag hoe zwaar je week is.
                  </span>
                </li>
                <li>
                  <b>Programma</b>
                  <span>
                    Je oefeningen staan per dag klaar, met sets, herhalingen en video erbij.
                  </span>
                </li>
                <li>
                  <b>Wearables</b>
                  <span>
                    Een Apple Watch synct je slaap, hartslag en cardiotraining vanzelf mee.
                  </span>
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Belastingcurve ──────────────────────────────────────────── */}
      <section className={styles.section} style={{ paddingTop: 0 }}>
        <div className={styles.shell}>
          <Reveal>
            <div className={styles.sectionHead}>
              <p className={styles.label}>De belastingcurve</p>
              <h2 className={styles.sectionTitle}>Twaalf weken opbouw in &eacute;&eacute;n lijn</h2>
              <p className={styles.body}>
                BASE telt elke dag je belasting op uit je hartslag en uit wat je logt. Je ziet of
                je opbouwt, of je stilstaat en of je te hard gaat. Een terugval door ziekte of een
                drukke week valt meteen op, en je therapeut past het plan daarop aan.
              </p>
            </div>
            <LoadCurve />
          </Reveal>
        </div>
      </section>

      {/* ── Voor wie ────────────────────────────────────────────────── */}
      <section id="voor-wie" className={styles.section} style={{ paddingTop: 0 }}>
        <div className={styles.shell}>
          <Reveal>
            <div className={styles.sectionHead}>
              <p className={styles.label}>Voor wie</p>
              <h2 className={styles.sectionTitle}>Voor wie BASE bedoeld is</h2>
            </div>
            <div className={styles.cardGrid}>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>In revalidatie</h3>
                <p className={styles.cardBody}>
                  Je herstelt van een operatie of een blessure en traint volgens een plan van je
                  fysiotherapeut.
                </p>
                <ul className={styles.cardList}>
                  <li><span className={styles.tick}>&rarr;</span><span>Je programma per dag, met video bij elke oefening</span></li>
                  <li><span className={styles.tick}>&rarr;</span><span>Pijn en gevoel loggen per sessie</span></li>
                  <li><span className={styles.tick}>&rarr;</span><span>Metingen die laten zien wanneer de volgende stap kan</span></li>
                </ul>
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Doortrainende sporters</h3>
                <p className={styles.cardBody}>
                  Je bent klachtenvrij en wilt weten of je opbouw klopt voordat je het aan je
                  lichaam merkt.
                </p>
                <ul className={styles.cardList}>
                  <li><span className={styles.tick}>&rarr;</span><span>Dagbelasting uit je hartslag</span></li>
                  <li><span className={styles.tick}>&rarr;</span><span>Kracht en cardio in hetzelfde logboek</span></li>
                  <li><span className={styles.tick}>&rarr;</span><span>Slaap en herstel van je watch</span></li>
                </ul>
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Therapeuten en coaches</h3>
                <p className={styles.cardBody}>
                  Je begeleidt mensen en wilt zien wat er tussen twee afspraken door gebeurt.
                </p>
                <ul className={styles.cardList}>
                  <li><span className={styles.tick}>&rarr;</span><span>Programma&#39;s samenstellen en op de week zetten</span></li>
                  <li><span className={styles.tick}>&rarr;</span><span>Testrapporten en loopanalyse in het dossier</span></li>
                  <li><span className={styles.tick}>&rarr;</span><span>Een signaal als iemand stilvalt</span></li>
                </ul>
              </article>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Hoe het werkt ───────────────────────────────────────────── */}
      <section id="hoe-het-werkt" className={styles.section} style={{ paddingTop: 0 }}>
        <div className={styles.shell}>
          <Reveal>
            <div className={styles.sectionHead}>
              <p className={styles.label}>Hoe het werkt</p>
              <h2 className={styles.sectionTitle}>Van meting naar programma naar opbouw</h2>
            </div>
            <div className={styles.steps}>
              <div className={styles.step}>
                <span className={styles.stepNo}>01</span>
                <h3 className={styles.stepTitle}>Eerst meten</h3>
                <p className={styles.stepBody}>
                  We brengen in kaart wat je nu aankan: kracht links tegen rechts, de testen die
                  bij je klacht horen en hoe je beweegt. Dat is het vertrekpunt waar alles daarna
                  aan wordt afgemeten.
                </p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNo}>02</span>
                <h3 className={styles.stepTitle}>Je programma staat klaar</h3>
                <p className={styles.stepBody}>
                  Je fysiotherapeut stelt het programma samen en zet het op je week. Jij opent de
                  app en ziet wat je vandaag doet, met sets, herhalingen en uitleg per oefening.
                </p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNo}>03</span>
                <h3 className={styles.stepTitle}>Bijsturen op wat je logt</h3>
                <p className={styles.stepBody}>
                  Wat je logt komt terug in je belasting en in je metingen. Gaat het sneller dan
                  gepland of blijft de pijn hangen, dan past je therapeut het plan aan. De app doet
                  dat niet zelf.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Wat je ziet ─────────────────────────────────────────────── */}
      <section className={styles.section} style={{ paddingTop: 0 }}>
        <div className={styles.shell}>
          <Reveal>
            <div className={styles.sectionHead}>
              <p className={styles.label}>In de app</p>
              <h2 className={styles.sectionTitle}>Wat je op een gewone dag ziet</h2>
            </div>
            <div className={styles.tileGrid}>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Herstel vanochtend</span>
                <div className={styles.ringRow}>
                  <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
                    <circle className={styles.ringBg} cx="50" cy="50" r="42" />
                    <circle className={styles.ringFg} cx="50" cy="50" r="42" strokeDasharray="264" strokeDashoffset="58" />
                  </svg>
                  <div>
                    <span className={styles.tileValue}>78</span>
                    <p className={styles.tileNote}>Goed, train hard</p>
                  </div>
                </div>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Vandaag</span>
                <span className={styles.tileValue}>45 min</span>
                <p className={styles.tileNote}>Knie 3B, drie oefeningen met video erbij</p>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Belasting deze week</span>
                <div className={styles.bars} aria-hidden="true">
                  <i style={{ height: '34%' }} />
                  <i className={styles.barOn} style={{ height: '62%' }} />
                  <i style={{ height: '22%' }} />
                  <i className={styles.barOn} style={{ height: '78%' }} />
                  <i style={{ height: '44%' }} />
                  <i className={styles.barNow} style={{ height: '92%' }} />
                  <i style={{ height: '14%' }} />
                </div>
                <p className={styles.tileNote}>Consistente opbouw</p>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Slaap vannacht</span>
                <span className={styles.tileValue}>7 u 12</span>
                <p className={styles.tileNote}>Effici&euml;ntie 88 procent, rusthartslag 52</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Slot ────────────────────────────────────────────────────── */}
      <section className={styles.closer}>
        <div className={styles.shell}>
          <Reveal>
            <h2 className={styles.closerType}>Wil je BASE <em>gebruiken?</em></h2>
            <p className={styles.body} style={{ marginBottom: 'clamp(24px, 3vw, 36px)' }}>
              De app draait op de iPhone en in de browser en is nu in beta. Loop je bij Movement
              Based Therapy, of wil je BASE in je eigen praktijk gebruiken, stuur dan een bericht.
            </p>
            <div className={styles.ctaRow}>
              <a className={`${styles.btn} ${styles.btnSolid}`} href={ACCESS_MAIL}>Vraag toegang</a>
              <Link className={`${styles.btn} ${styles.btnGhost}`} href="/login">Inloggen</Link>
            </div>
          </Reveal>
        </div>
      </section>

      <div className={styles.shell}>
        <footer className={styles.footer}>
          <p className={styles.footNote}>BASE by Movement Based Therapy</p>
          <div className={styles.footLinks}>
            <a className={styles.navLink} href="https://www.movementbasedtherapy.nl">Praktijk-site</a>
            <a className={styles.navLink} href="https://movementbasedtherapy.nl/privacy-policy.html">Privacyverklaring</a>
            <a className={styles.navLink} href={ACCESS_MAIL}>Contact</a>
          </div>
        </footer>
      </div>
    </main>
  )
}
