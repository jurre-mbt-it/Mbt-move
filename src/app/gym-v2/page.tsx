import './gym-v2.css'
import { WEEKS, CASELOAD, PAIN_LABEL, MAILTO_TESTFLIGHT, MAILTO_DEMO } from './data'
import { makeScale, points, toPath, toArea, pathLength, sparkPath } from './plot'
import { LoadModel } from './LoadModel'
import { Effects } from './Effects'

/* ─────────────────────────── hero-grafiek ─────────────────────────── */

const H = makeScale(460, 250, { l: 6, r: 6, t: 14, b: 26 })
const H_FIT = points(H, 'fit')
const H_FAT = points(H, 'fat')
const H_TICKS = [0, 3, 6, 9, 11]

function HeroPlot() {
  return (
    <div className="hero__plot rv d1">
      <div className="cap">
        <span className="tag">Twaalf weken opbouw</span>
        <span className="tag">AU</span>
      </div>
      <svg
        className="plot"
        viewBox={`0 0 ${H.w} ${H.h}`}
        role="img"
        aria-label="Lijngrafiek van fitheid tegen vermoeidheid over twaalf weken. De fitheid loopt op van 22 naar 92, de vermoeidheid piekt in week 7 op 88 en zakt daarna terug."
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <line key={v} className="gridline" x1={H.pad.l} x2={H.w - H.pad.r} y1={H.y(v)} y2={H.y(v)} />
        ))}
        <path className="area" d={toArea(H, H_FIT)} />
        <path
          className="ln ln--fat ln--draw"
          d={toPath(H_FAT)}
          style={{ '--len': pathLength(H_FAT) } as React.CSSProperties}
        />
        <path
          className="ln ln--fit ln--draw"
          d={toPath(H_FIT)}
          style={{ '--len': pathLength(H_FIT) } as React.CSSProperties}
        />
        {H_TICKS.map((i) => (
          <text
            key={i}
            className="tickt"
            x={H.x(i)}
            y={H.h - 8}
            textAnchor={i === 0 ? 'start' : i === 11 ? 'end' : 'middle'}
          >
            wk {WEEKS[i].w}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span className="tag">
          <i className="k-fit" />
          Fitheid
        </span>
        <span className="tag">
          <i className="k-fat" />
          Vermoeidheid
        </span>
      </div>
    </div>
  )
}

/* ─────────────────────────── caseload ─────────────────────────── */

function Spark({ series }: { series: number[] }) {
  const s = sparkPath(series)
  return (
    <svg className="spark" viewBox={`0 0 ${s.w} ${s.h}`} aria-hidden="true">
      <path d={s.area} fill="var(--signal)" opacity="0.13" />
      <path d={s.line} fill="none" stroke="var(--signal)" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={s.endX} cy={s.endY} r="2.6" fill="var(--signal)" />
    </svg>
  )
}

function Caseload() {
  return (
    <div
      className="dash rv d1"
      role="img"
      aria-label="Therapeuten-dashboard met vijf sporters, hun fase, belasting over zes weken, pijnscore, adherentie en laatste sessie."
    >
      <div className="dash__bar">
        <span className="tag">Caseload · week 9</span>
        <span className="tag">5 actief · 1 markering</span>
      </div>
      <div className="dash__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Sporter</th>
              <th scope="col">Belasting, 6 wk</th>
              <th scope="col">Week</th>
              <th scope="col">Pijn</th>
              <th scope="col">Adherentie</th>
              <th scope="col">Laatst</th>
            </tr>
          </thead>
          <tbody>
            {CASELOAD.map((r) => (
              <tr key={r.who}>
                <td>
                  <div className="who">{r.who}</div>
                  <div className="fase">{r.fase}</div>
                </td>
                <td>
                  <Spark series={r.series} />
                </td>
                <td>
                  <span className="num">{r.week} AU</span>
                </td>
                <td>
                  <span className={`chip chip--${r.pijn[0]}`}>
                    {r.pijn[1]} · {PAIN_LABEL[r.pijn[0]]}
                  </span>
                </td>
                <td>
                  <span className="num">{r.adh}%</span>
                </td>
                <td style={{ color: 'var(--fg-3)' }}>
                  <span className="num">{r.last}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─────────────────────────── app-schermen ─────────────────────────── */

function PhoneSession() {
  return (
    <div
      className="phone rv"
      role="img"
      aria-label="App-scherm: de sessie van dinsdag week 9, onderbeen kracht, met vier oefeningen en een setlijst met gewicht, herhalingen en RPE."
    >
      <div className="scr">
        <div className="scr__bar">
          <span>09:41</span>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            WK 9<span className="scr__bat" />
          </span>
        </div>
        <div>
          <span className="scr__sub">Dinsdag · fase 3</span>
          <h4>Onderbeen, kracht</h4>
        </div>
        <div className="card">
          <div className="card__top">
            <span className="card__ttl">Sessie loopt</span>
            <span className="pill">42:18</span>
          </div>
          <div className="bar">
            <i style={{ width: '62%' }} />
          </div>
          <span className="card__meta">4 van 6 oefeningen af</span>
        </div>
        <div className="card">
          <div className="card__top">
            <span className="card__ttl">Kuitheffen, enkelbeen</span>
            <span className="card__meta">3 × 12</span>
          </div>
          <div className="setrow setrow--done">
            <span className="idx">1</span>
            <span>32 kg</span>
            <span>12</span>
            <span className="rpe">RPE 7</span>
          </div>
          <div className="setrow setrow--done">
            <span className="idx">2</span>
            <span>32 kg</span>
            <span>12</span>
            <span className="rpe">RPE 7,5</span>
          </div>
          <div className="setrow">
            <span className="idx">3</span>
            <span>34 kg</span>
            <span>10</span>
            <span className="rpe">nu</span>
          </div>
          <div className="card__meta">Vorige keer 30 kg bij RPE 8</div>
        </div>
        <div className="card">
          <div className="card__top">
            <span className="card__ttl">Nog te doen</span>
            <span className="pill pill--quiet">2</span>
          </div>
          <div className="ex">
            <span>Split squat</span>
            <em>3 × 8</em>
          </div>
          <div className="ex">
            <span>Hopping, dubbelbeen</span>
            <em>4 × 20 s</em>
          </div>
        </div>
      </div>
    </div>
  )
}

function PhoneRecovery() {
  return (
    <div
      className="phone phone--drop rv d2"
      role="img"
      aria-label="App-scherm: herstel van vandaag met een readiness van 74, HRV 58 milliseconden, rusthartslag 51 en 7 uur 12 slaap."
    >
      <div className="scr">
        <div className="scr__bar">
          <span>07:12</span>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            WK 9<span className="scr__bat" />
          </span>
        </div>
        <div>
          <span className="scr__sub">Vandaag · van je Apple Watch</span>
          <h4>Herstel</h4>
        </div>
        <div className="card">
          <div className="ring">
            <svg width="66" height="66" viewBox="0 0 66 66" aria-hidden="true">
              <circle cx="33" cy="33" r="27" fill="none" stroke="oklch(0.90 0.02 176 / 0.12)" strokeWidth="6" />
              <circle
                cx="33"
                cy="33"
                r="27"
                fill="none"
                stroke="var(--fit)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="169.6"
                strokeDashoffset="44.1"
                transform="rotate(-90 33 33)"
              />
            </svg>
            <div>
              <div className="ring__n">74</div>
              <span className="card__meta">READINESS · IETS ONDER JE WEEK</span>
            </div>
          </div>
        </div>
        <div className="metrics">
          <div className="metric">
            <b>58</b>
            <span>HRV ms</span>
          </div>
          <div className="metric">
            <b>51</b>
            <span>Rust bpm</span>
          </div>
          <div className="metric">
            <b>7:12</b>
            <span>Slaap</span>
          </div>
          <div className="metric">
            <b>36,4</b>
            <span>Pols °C</span>
          </div>
        </div>
        <div className="card">
          <div className="card__top">
            <span className="card__ttl">Pijn, gisteren</span>
            <span className="pill pill--quiet">24 u na</span>
          </div>
          <div className="bar">
            <i style={{ width: '22%', background: 'var(--warn)' }} />
          </div>
          <div className="card__meta">2 van 10 tijdens, 1 van 10 de ochtend erna</div>
        </div>
        <div className="card">
          <div className="card__top">
            <span className="card__ttl">Belasting deze week</span>
            <span className="card__meta">360 AU</span>
          </div>
          <div className="bar">
            <i style={{ width: '84%', background: 'var(--signal)' }} />
          </div>
          <div className="card__meta">Binnen je opbouw van vier weken</div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── pagina ─────────────────────────── */

const RAIL = [
  ['top', 'Start'],
  ['rollen', 'Voor wie'],
  ['sporters', 'De app'],
  ['model', 'Het model'],
  ['praktijk', 'Praktijk'],
  ['herkomst', 'Herkomst'],
  ['beta', 'Beta'],
] as const

const SPEC_SPORTER = [
  'Weekplanning met kracht, mobiliteit, plyometrie en cardio',
  'Loggen per set, met rusttimer en voorgevulde waarden',
  'Apple Watch voor hartslag, slaap, HRV en herstel',
  'Dagelijkse check op pijn en zwaarte',
]

const SPEC_PRAKTIJK = [
  'Weken bouwen uit een eigen oefenbibliotheek',
  'Belasting, pijn en adherentie per sporter',
  'Live meeloggen tijdens de behandeling',
  'Rapport per fase, klaar om te delen',
]

const STAPPEN = [
  ['Plan', 'Je therapeut zet kracht, mobiliteit, plyometrie en cardio in je week.'],
  ['Sessie', 'Je opent de dag en werkt de oefeningen af. Je laatste waarden staan al ingevuld.'],
  ['Log', 'Per set gewicht, herhalingen en RPE. Na afloop pijn en zwaarte van de sessie.'],
  ['Terugkijken', 'Je eigen curve, week na week, naast wat je pols aan herstel laat zien.'],
] as const

export default function GymV2Page() {
  return (
    <div className="gv2" lang="nl">
      <Effects />

      <a className="skip" href="#main">
        Naar de inhoud
      </a>

      <header className="mast">
        <div className="wrap mast__in">
          <a className="brand" href="#top">
            <span className="brand__dot" />
            MBT·GYM
          </a>
          <nav>
            <a className="navlink" href="#rollen">
              Voor wie
            </a>
            <a className="navlink" href="#sporters">
              De app
            </a>
            <a className="navlink" href="#model">
              Het model
            </a>
            <a className="navlink" href="#praktijk">
              Voor praktijken
            </a>
            <a className="btn btn--sm" href={MAILTO_TESTFLIGHT}>
              TestFlight
              <span className="arw" aria-hidden="true">
                →
              </span>
            </a>
          </nav>
        </div>
      </header>

      <nav className="rail" aria-label="Secties">
        <ol>
          {RAIL.map(([id, label]) => (
            <li key={id} data-rail={id}>
              <a href={`#${id}`}>
                <span className="tick" />
                <span className="lbl">{label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <main id="main">
        {/* ── hero ── */}
        <section id="top" className="hero">
          <div className="wrap hero__grid">
            <div>
              <h1>
                <span className="l">Belasting die je</span>
                <span className="l">
                  <span className="em">kunt zien.</span>
                </span>
              </h1>
              <p className="hero__lede">
                MBT·Gym legt elke set, je hartslag en je pijnscores naast elkaar en zet je fitheid af tegen je
                vermoeidheid. Je therapeut kijkt mee in dezelfde grafiek.
              </p>
              <div className="hero__acts">
                <a className="btn" href={MAILTO_TESTFLIGHT}>
                  Vraag TestFlight aan
                  <span className="arw" aria-hidden="true">
                    →
                  </span>
                </a>
                <a className="btn btn--ghost" href="#praktijk">
                  Voor praktijken
                </a>
              </div>
              <div className="hero__meta">
                <span className="tag">iPhone en Apple Watch</span>
                <span className="tag">Beta open</span>
                <span className="tag">Movement Based Therapy, Amsterdam</span>
              </div>
            </div>
            <HeroPlot />
          </div>
        </section>

        {/* ── voor wie ── */}
        <section id="rollen" className="band" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="wrap">
            <div className="head rv">
              <h2>Voor wie het is.</h2>
              <p className="lede">
                Dezelfde week, twee soorten werk. De sporter voert uit, de praktijk stuurt bij.
              </p>
            </div>

            <div className="fork">
              <div className="fork__col rv">
                <h3>Je traint.</h3>
                <p>
                  Je krijgt de week van je therapeut binnen in de app. Per dag zie je wat er staat, wat je vorige
                  keer deed en hoe zwaar het toen voelde. Je logt per set, met gewicht, herhalingen en RPE.
                </p>
                <ul className="speclist">
                  {SPEC_SPORTER.map((t, n) => (
                    <li key={t}>
                      <span className="n mono">{String(n + 1).padStart(2, '0')}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <a className="inline-link" href={MAILTO_TESTFLIGHT}>
                  Vraag TestFlight aan
                  <span className="arw" aria-hidden="true">
                    →
                  </span>
                </a>
              </div>

              <div className="fork__col rv d1">
                <h3>Je begeleidt.</h3>
                <p>
                  Je ziet je hele caseload op één scherm: belasting per week, pijnscores, adherentie en wie er
                  achterloopt. Tijdens de behandeling log je live mee in dezelfde sessie.
                </p>
                <ul className="speclist">
                  {SPEC_PRAKTIJK.map((t, n) => (
                    <li key={t}>
                      <span className="n mono">{String(n + 1).padStart(2, '0')}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <a className="inline-link" href={MAILTO_DEMO}>
                  Plan een demo
                  <span className="arw" aria-hidden="true">
                    →
                  </span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── de app ── */}
        <section id="sporters" className="band band--paper2">
          <div className="wrap">
            <div className="head rv">
              <h2>Van plan naar set naar getal.</h2>
              <p className="lede">
                Vier stappen, elke week opnieuw. Wat je invult is meteen wat je therapeut ziet.
              </p>
            </div>

            <div className="flow">
              {STAPPEN.map(([titel, tekst], n) => (
                <div key={titel} className={`flow__step rv${n ? ` d${n}` : ''}`}>
                  <span className="flow__n mono">STAP {String(n + 1).padStart(2, '0')}</span>
                  <h3>{titel}</h3>
                  <p>{tekst}</p>
                </div>
              ))}
            </div>

            <div className="screens">
              <PhoneSession />
              <PhoneRecovery />
            </div>
          </div>
        </section>

        {/* ── het model ── */}
        <section id="model" className="band band--field">
          <div className="wrap model">
            <div className="model__prose rv">
              <h2>Fitheid tegen vermoeidheid.</h2>
              <p style={{ marginTop: '1.4rem' }}>
                Elke set levert een sRPE-score op: hoe zwaar het voelde maal hoe lang je bezig was. Opgeteld over
                zeven dagen is dat je belasting in AU.
              </p>
              <p>
                Het model zet je gemiddelde over zes weken, je fitheid, af tegen je gemiddelde over zeven dagen, je
                vermoeidheid. Het verschil is je vorm.
              </p>
              <p>
                Springt je belasting meer dan twintig procent boven de vier weken ervoor uit, dan wordt die week
                gemarkeerd. In week 7 gebeurde dat hier. De week erna is teruggeschakeld naar 190 AU.
              </p>
              <p className="model__note">
                Het model voorspelt geen blessures. Het laat zien wat je hebt gedaan, zodat jij en je therapeut
                daarover hetzelfde gesprek voeren.
              </p>
            </div>

            <LoadModel />
          </div>
        </section>

        {/* ── praktijk ── */}
        <section id="praktijk" className="band">
          <div className="wrap practice">
            <div className="rv">
              <h2>Je caseload op één scherm.</h2>
              <p className="lede" style={{ marginTop: '1.4rem' }}>
                Wat je ziet is wat je sporter invulde. Sessies die af zijn, sessies die zijn overgeslagen, pijn die
                opliep en belasting die te snel steeg.
              </p>
              <p style={{ color: 'var(--fg-2)', marginTop: '1rem', maxWidth: '44ch' }}>
                Geen export naar een spreadsheet, geen appjes met screenshots. Je opent het dossier en de week staat
                er.
              </p>
              <a className="inline-link" href={MAILTO_DEMO}>
                Plan een demo
                <span className="arw" aria-hidden="true">
                  →
                </span>
              </a>
            </div>

            <Caseload />
          </div>
        </section>

        {/* ── herkomst ── */}
        <section id="herkomst" className="band band--tight band--paper2">
          <div className="wrap origin">
            <div className="rv">
              <h2 style={{ fontSize: 'var(--step-3)' }}>Waar het vandaan komt.</h2>
            </div>
            <div className="rv d1">
              <p>
                MBT·Gym is gebouwd binnen Movement Based Therapy in Amsterdam, door een sportfysiotherapeut die de
                app zelf in de behandelkamer gebruikt. Wat erin zit, zit erin omdat het in de praktijk nodig was.
              </p>
              <p>
                De app draait op iPhone en Apple Watch. De beta loopt via TestFlight en is open voor sporters die
                onder begeleiding trainen en voor praktijken die willen meekijken.
              </p>
              <p style={{ marginTop: '1.4rem' }}>
                <a className="inline-link" href="https://www.movementbasedtherapy.nl" style={{ marginTop: 0 }}>
                  movementbasedtherapy.nl
                  <span className="arw" aria-hidden="true">
                    →
                  </span>
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ── beta ── */}
        <section id="beta" className="band band--field">
          <div className="wrap">
            <div className="head rv">
              <h2>De beta is open.</h2>
            </div>
            <div className="routes">
              <div className="rv">
                <span className="tag">Sporters</span>
                <h3>Meetrainen in de beta.</h3>
                <p>Je krijgt een TestFlight-uitnodiging en een programma van je therapeut. Eén mail is genoeg.</p>
                <a className="btn" href={MAILTO_TESTFLIGHT}>
                  Vraag TestFlight aan
                  <span className="arw" aria-hidden="true">
                    →
                  </span>
                </a>
              </div>
              <div className="rv d1">
                <span className="tag">Praktijken</span>
                <h3>Het dashboard zien.</h3>
                <p>In een half uur door de weekplanner, de caseload en het belastingmodel. Online of in Amsterdam.</p>
                <a className="btn btn--ghost" href={MAILTO_DEMO}>
                  Plan een demo
                </a>
              </div>
            </div>

            <div className="foot">
              <span className="tag">MBT·GYM · Movement Based Therapy, Amsterdam</span>
              <span className="tag">
                <a href="https://www.movementbasedtherapy.nl/privacy-policy.html">Privacy</a> ·{' '}
                <a href="mailto:jurre@movementbasedtherapy.nl">jurre@movementbasedtherapy.nl</a>
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
