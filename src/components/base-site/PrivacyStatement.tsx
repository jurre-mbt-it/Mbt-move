import Link from 'next/link'
import styles from './base-site.module.css'
import { ScrambleText } from './ScrambleText'

/**
 * Privacyverklaring van BASE, op getbase.coach/privacy.
 *
 * Tot 18-09-2026 verwees alles op getbase.coach en in de app naar de
 * privacyverklaring van de praktijksite. Die verklaring gaat over de praktijk
 * als geheel (dossier, medewerkers, verwijzers, website) en werd steeds langer
 * door de platformdetails erin. Sinds die datum zijn er twee verklaringen die
 * naast elkaar worden bijgehouden:
 *
 *   - movementbasedtherapy.nl/privacy-policy.html: de praktijk, met een
 *     korte verwijzing hierheen voor het platform;
 *   - deze pagina: alles over BASE (web, iOS, Android).
 *
 * Verander je een gegevensstroom (nieuwe verwerker, nieuwe koppeling, andere
 * bewaartermijn), werk dan dit bestand bij, hoog LAATST_BIJGEWERKT op, en loop
 * compliance/avg-verwerkers.md en het register na. De feiten hieronder komen
 * uit compliance/verwerkingsregister.md (v0.2) en zijn op 18-09-2026 tegen de
 * code gecontroleerd: rolgate voor koppelingen in src/lib/wearables-access.ts,
 * verwijdertermijn in src/server/routers/gdpr.ts, geen analytics of
 * tracking-scripts op getbase.coach.
 *
 * Toon: docs/tone-of-voice.md, register 7 (beleid), met "je" en zonder
 * em-dashes. Volledige zinnen, geen juridische stapelzinnen.
 */
export const LAATST_BIJGEWERKT = '18 september 2026'

const CONTACT_MAIL = 'jurre@movementbasedtherapy.nl'

const TOC = [
  ['wie', 'Wie verantwoordelijk is'],
  ['voor-wie', 'Voor wie dit geldt'],
  ['gegevens', 'Welke gegevens we verwerken'],
  ['waarvoor', 'Waarvoor, en op welke grond'],
  ['wie-ziet', 'Wie je gegevens ziet'],
  ['koppelingen', 'Koppelingen die je zelf aanzet'],
  ['kinvent', 'Metingen uit KINVENT'],
  ['ai', 'AI-conceptteksten'],
  ['berichten', 'E-mail en pushmeldingen'],
  ['verwerkers', 'Partijen die voor ons werken'],
  ['buiten-eer', 'Buiten de EER'],
  ['bewaren', 'Hoe lang we bewaren'],
  ['beveiliging', 'Beveiliging'],
  ['rechten', 'Je rechten'],
  ['minderjarigen', 'Jonger dan 16'],
  ['cookies', 'Cookies op getbase.coach'],
  ['wijzigingen', 'Wijzigingen'],
  ['contact', 'Contact'],
] as const

export function PrivacyStatement() {
  return (
    <main className={`base-site ${styles.page}`}>
      <nav className={styles.navBar} aria-label="Hoofdmenu">
        <div className={styles.navInner}>
          <Link href="/" className={styles.navBrand}>BASE</Link>
          <div className={styles.navCells}>
            <Link className={`${styles.navCell} ${styles.navCellHome}`} href="/" aria-label="Naar de voorpagina">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <path d="M2 7l6-5 6 5v7H2z" />
              </svg>
            </Link>
            <Link className={styles.navCell} href="/login">
              <ScrambleText text="Inloggen" />
            </Link>
          </div>
        </div>
      </nav>

      <section className={`${styles.sec} ${styles.legalHero}`}>
        <div className={styles.shell}>
          <p className={styles.eyebrow}>Privacyverklaring</p>
          <h1 className={styles.head}>
            Wat BASE met <em>je gegevens</em> doet.
          </h1>
          <p className={styles.lede}>
            BASE is het platform van Movement Based Therapy voor revalidatie en training, als
            website, iOS-app en Android-app. Hier lees je welke gegevens we verwerken, waarom,
            wie ze ziet en wat je zelf in de app regelt.
          </p>
          <p className={styles.legalMeta}>
            <span>Laatst bijgewerkt <b>{LAATST_BIJGEWERKT}</b></span>
            <span>Geldt voor <b>getbase.coach en de BASE-app</b></span>
          </p>
        </div>
      </section>

      <section className={`${styles.sec} ${styles.secBand}`}>
        <div className={`${styles.shell} ${styles.legalGrid}`}>
          <ol className={styles.legalToc} aria-label="Inhoud">
            {TOC.map(([id, label], i) => (
              <li key={id}>
                <a className={styles.legalTocLink} href={`#${id}`}>
                  <i>{String(i + 1).padStart(2, '0')}</i>
                  {label}
                </a>
              </li>
            ))}
          </ol>

          <div className={styles.legalBody}>
            <div className={styles.legalSummary}>
              <p className={styles.eyebrow}>In het kort</p>
              <ul>
                <li>
                  Je gegevens in BASE zijn van jou en je behandelaar. We verkopen niets door en
                  tonen geen advertenties.
                </li>
                <li>
                  Je horloge, Strava of Polar koppel je alleen als je dat zelf wilt. Je kunt het
                  op elk moment weer loskoppelen.
                </li>
                <li>
                  Alles wat je met een AI-hulpmiddel deelt gaat zonder je naam en geboortejaar,
                  en je behandelaar leest elk concept na.
                </li>
                <li>
                  Je kunt in de app zien wie je dossier heeft geopend, al je gegevens downloaden
                  en je account laten verwijderen.
                </li>
                <li>
                  Op getbase.coach draaien geen analytics en geen tracking. De enige cookie houdt je
                  ingelogd.
                </li>
              </ul>
            </div>

            <h2 id="wie"><i>01</i>Wie verantwoordelijk is</h2>
            <p>
              Movement Based Therapy is de verwerkingsverantwoordelijke voor BASE. Ik ben Jurre
              Kok, fysiotherapeut en eigenaar van de praktijk, en ik ben ook je aanspreekpunt
              voor vragen over privacy. Je bereikt me op{' '}
              <a href={`mailto:${CONTACT_MAIL}`}>{CONTACT_MAIL}</a>.
            </p>
            <p>
              Gebruik je BASE via een andere praktijk of coach dan Movement Based Therapy, dan is
              die praktijk of coach verantwoordelijk voor wat er met je dossier gebeurt. Wij
              leveren dan het platform en werken in opdracht van die praktijk.
            </p>

            <h2 id="voor-wie"><i>02</i>Voor wie dit geldt</h2>
            <ul>
              <li>
                <strong>Patiënten</strong> van de praktijk, die BASE gebruiken tijdens hun
                behandeling.
              </li>
              <li>
                <strong>Sporters</strong> die BASE gebruiken voor training zonder behandeling, al
                dan niet met een coach.
              </li>
              <li>
                <strong>Therapeuten, coaches en beheerders</strong> met een account.
              </li>
              <li>
                <strong>Bezoekers</strong> van getbase.coach die niet inloggen. Voor hen is
                alleen het kopje over cookies van belang.
              </li>
            </ul>

            <h2 id="gegevens"><i>03</i>Welke gegevens we verwerken</h2>
            <h3>Je account</h3>
            <p>
              Naam en e-mailadres. Als je ze invult: telefoonnummer, geboortedatum en een
              profielfoto. We slaan geen BSN en geen verzekeringsgegevens op. Die staan alleen in
              het dossiersysteem van de praktijk, niet in BASE.
            </p>
            <h3>Je behandeling of training</h3>
            <p>
              Je blessure of doel, je programma&apos;s en de sessies die je logt: oefeningen,
              gewichten, herhalingen, hoe zwaar het voelde, pijnscores en hoe je je voelt.
              Daarnaast welzijnschecks, mobiliteitstests, revalidatiecriteria, klinische tests
              zoals de krachtverhouding tussen links en rechts, testrapporten, hardloopanalyses,
              de berichten met je behandelaar en de belastingcurve die we daaruit berekenen.
            </p>
            <h3>Uit koppelingen die je zelf aanzet</h3>
            <p>
              Slaap en slaapfasen, hartslag en hartslagvariabiliteit, ademfrequentie, trainingen
              met een hartslag- en tempocurve, stappen, energieverbruik en VO2max. Zie het kopje
              over koppelingen.
            </p>
            <h3>Metingen door je therapeut</h3>
            <p>
              Krachttests en sprongen die de praktijk meet met KINVENT-apparatuur in de
              behandelkamer. Zie het kopje over KINVENT.
            </p>
            <h3>Technische gegevens</h3>
            <p>
              Het tijdstip, IP-adres en apparaat waarmee je inlogt, een logboek van wie je
              dossier opent of wijzigt (verplicht in de zorg, norm NEN 7513), en als je
              meldingen aanzet een apparaatcode voor pushberichten.
            </p>

            <h2 id="waarvoor"><i>04</i>Waarvoor, en op welke grond</h2>
            <table className={styles.legalTable}>
              <thead>
                <tr>
                  <th>Doel</th>
                  <th>Grondslag</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Doel">Behandeling (patiënten)</td>
                  <td data-label="Grondslag">
                    De behandelovereenkomst. Voor gezondheidsgegevens: zorgverlening onder
                    beroepsgeheim (AVG art. 9 lid 2 sub h). De dossierplicht uit de WGBO.
                  </td>
                </tr>
                <tr>
                  <td data-label="Doel">Training (sporters)</td>
                  <td data-label="Grondslag">
                    De overeenkomst voor het gebruik van BASE. Voor gezondheidsgegevens: je
                    uitdrukkelijke toestemming, die je geeft bij je eerste login via de
                    gegevensverwerkingsverklaring in de app.
                  </td>
                </tr>
                <tr>
                  <td data-label="Doel">Koppelingen met horloges en diensten</td>
                  <td data-label="Grondslag">
                    Je uitdrukkelijke toestemming per bron, op je toestel of in het inlogscherm
                    van die dienst. Je trekt die in door los te koppelen.
                  </td>
                </tr>
                <tr>
                  <td data-label="Doel">Signalen voor je behandelaar</td>
                  <td data-label="Grondslag">
                    Onderdeel van de behandeling. BASE zet vaste regels op je gegevens, zoals
                    drie sessies op rij met hoge pijn, en laat dat aan je behandelaar zien. Het
                    is geen diagnose en de app past nooit zelf je schema aan.
                  </td>
                </tr>
                <tr>
                  <td data-label="Doel">Geanonimiseerde cohort-inzichten</td>
                  <td data-label="Grondslag">
                    Alleen als je meedoet. De keuze staat standaard uit en je zet hem in de app
                    weer uit zonder gevolgen voor je behandeling.
                  </td>
                </tr>
                <tr>
                  <td data-label="Doel">E-mail en pushmeldingen</td>
                  <td data-label="Grondslag">
                    Nodig om BASE te laten werken (uitnodiging, inlogcode, herinneringen). Wat je
                    wel en niet wilt ontvangen stel je zelf in.
                  </td>
                </tr>
                <tr>
                  <td data-label="Doel">Beveiliging en logboek</td>
                  <td data-label="Grondslag">
                    Wettelijke plicht (WGBO, Wabvpz) en ons gerechtvaardigd belang om misbruik
                    te herkennen.
                  </td>
                </tr>
              </tbody>
            </table>

            <h2 id="wie-ziet"><i>05</i>Wie je gegevens ziet</h2>
            <p>
              <strong>Als patiënt:</strong> je behandelend therapeut en diens collega&apos;s binnen
              dezelfde praktijk, zodat een collega het kan overnemen als je therapeut afwezig is.
              Dat is dezelfde afspraak als voor je gewone dossier.
            </p>
            <p>
              <strong>Als sporter:</strong> alleen de therapeut of coach die jij hebt goedgekeurd.
              Die koppeling zie je onder Instellingen, Toegang, en daar trek je hem ook weer in.
            </p>
            <p>
              <strong>Jijzelf:</strong> in de app staat een toegangslogboek waarin je ziet wie je
              dossier wanneer heeft geopend.
            </p>
            <p>
              <strong>De beheerder</strong> van het platform ziet gegevens alleen voor technisch
              beheer en het controleren van het logboek. Verder ziet niemand je gegevens. We
              verkopen niets door, tonen geen advertenties en delen geen gegevens met
              verzekeraars of werkgevers. Alleen als de wet ons daartoe verplicht, bijvoorbeeld
              bij een vordering van de politie, geven we gegevens af.
            </p>

            <h2 id="koppelingen"><i>06</i>Koppelingen die je zelf aanzet</h2>
            <p>
              Je kunt je Apple Watch (via Apple Health), je Polar-horloge of je Strava-account
              koppelen. BASE haalt dan slaap, hartslag, hartslagvariabiliteit, ademfrequentie,
              trainingen, stappen en energieverbruik op, zolang de koppeling bestaat. Koppelen is
              nooit een voorwaarde voor behandeling of training. Op dit moment staat koppelen
              open voor sporters, coaches en therapeuten; voor patiëntaccounts nog niet.
            </p>
            <ul>
              <li>
                <strong>Apple Health:</strong> je geeft per gegevenssoort toestemming op je eigen
                iPhone. De gegevens gaan rechtstreeks van je toestel naar BASE; Apple ziet die
                overdracht niet.
              </li>
              <li>
                <strong>Strava:</strong> je logt in bij Strava en geeft daar toestemming om je
                activiteiten te lezen. Wij bewaren duur, afstand, hartslag en tempo, geen
                route of foto&apos;s. Koppel je los, dan verwijderen wij onze toegangssleutels. De
                toestemming bij Strava zelf trek je in via je Strava-instellingen. Strava Inc.
                is gevestigd in de Verenigde Staten; wat wij naar Strava sturen is alleen de
                sleutel die jij daar hebt aangemaakt.
              </li>
              <li>
                <strong>Polar:</strong> zelfde principe via het inlogscherm van Polar. Polar
                Electro Oy is gevestigd in Finland, binnen de EER. Koppel je los, dan
                verwijderen wij de sleutels en trekken we onze registratie bij Polar in.
              </li>
            </ul>
            <p>
              De toegangssleutels van deze diensten bewaren we versleuteld. De gegevens zelf
              vallen onder dezelfde beveiliging en bewaartermijn als de rest van je dossier.
            </p>

            <h2 id="kinvent"><i>07</i>Metingen uit KINVENT</h2>
            <p>
              De praktijk meet kracht en sprongen met apparatuur van KINVENT (Montpellier,
              Frankrijk). Die metingen staan in de KINVENT-software onder het account van de
              praktijk. Je therapeut kan jouw BASE-dossier aan jouw KINVENT-profiel koppelen en
              metingen overnemen, zodat je rapport en je revalidatiecriteria op dezelfde meting
              steunen.
            </p>
            <p>
              BASE bewaart daarbij alleen een verwijzingscode naar het KINVENT-profiel. Naam,
              geboortedatum, e-mailadres, foto en gewicht uit dat profiel nemen we niet over.
              Er gaat geen dossierinformatie naar KINVENT. Alles blijft binnen de EER.
            </p>

            <h2 id="ai"><i>08</i>AI-conceptteksten</h2>
            <p>
              Bij testrapporten en hardloopanalyses kan je behandelaar een concepttekst laten
              schrijven door Anthropic (Claude). Daarvoor sturen we alleen je blessure of doel,
              de fase waarin je zit en de meetwaarden. Je naam, geboortejaar, contactgegevens en
              vrije tekst gaan nooit mee; dat is in de code afgedwongen. Anthropic bewaart niets
              van wat wij sturen (zero data retention). Je behandelaar leest en bewerkt elk
              concept voordat het in je rapport komt.
            </p>

            <h2 id="berichten"><i>09</i>E-mail en pushmeldingen</h2>
            <p>
              <strong>E-mail</strong> versturen we via Resend: je uitnodiging, inlogcodes en
              inloglinks, herinneringen en een bericht als je aan een trainingsgroep bent
              toegevoegd. In zo&apos;n mail staan je e-mailadres, je voornaam, de naam van je
              programma en eventueel een instructie van je behandelaar. Een inloglink is zeven
              dagen geldig, werkt één keer en gaat alleen naar je eigen mailbox.
            </p>
            <p>
              <strong>Pushmeldingen</strong> gaan via Expo naar Apple of Google, die het bericht
              op je toestel afleveren. Daarbij gaat een apparaatcode mee en een korte tekst. In
              die tekst staat nooit medische informatie: je leest bijvoorbeeld alleen dat er een
              nieuw bericht is, en de inhoud laadt pas in de app nadat je je toestel hebt
              ontgrendeld. Meldingen zet je uit in de app of in de instellingen van je telefoon.
            </p>

            <h2 id="verwerkers"><i>10</i>Partijen die voor ons werken</h2>
            <p>
              Met elke partij hieronder hebben we een verwerkersovereenkomst. Ze mogen je
              gegevens alleen gebruiken om hun dienst aan ons te leveren.
            </p>
            <table className={styles.legalTable}>
              <thead>
                <tr>
                  <th>Partij</th>
                  <th>Wat</th>
                  <th>Waar</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Partij">Supabase</td>
                  <td data-label="Wat">Database, inloggen en opslag van alle gegevens in BASE</td>
                  <td data-label="Waar">Londen, Verenigd Koninkrijk (adequaatheidsbesluit EU)</td>
                </tr>
                <tr>
                  <td data-label="Partij">Vercel</td>
                  <td data-label="Wat">Hosting van getbase.coach en de servercode</td>
                  <td data-label="Waar">VS, met modelcontractbepalingen en het EU-US Data Privacy Framework</td>
                </tr>
                <tr>
                  <td data-label="Partij">Resend</td>
                  <td data-label="Wat">Versturen van e-mail</td>
                  <td data-label="Waar">VS, met modelcontractbepalingen</td>
                </tr>
                <tr>
                  <td data-label="Partij">Anthropic</td>
                  <td data-label="Wat">AI-conceptteksten, zonder naam of geboortejaar</td>
                  <td data-label="Waar">VS, met modelcontractbepalingen en zero data retention</td>
                </tr>
                <tr>
                  <td data-label="Partij">Expo</td>
                  <td data-label="Wat">Doorgeven van pushmeldingen aan Apple en Google</td>
                  <td data-label="Waar">VS, met modelcontractbepalingen en het EU-US Data Privacy Framework</td>
                </tr>
                <tr>
                  <td data-label="Partij">Apple en Google</td>
                  <td data-label="Wat">Afleveren van pushmeldingen op je toestel en verspreiden van de app via App Store en Google Play</td>
                  <td data-label="Waar">VS, onder hun ontwikkelaarsvoorwaarden met modelcontractbepalingen</td>
                </tr>
                <tr>
                  <td data-label="Partij">Mollie</td>
                  <td data-label="Wat">Betalingen, alleen als je iets koopt in de shop. Geen gezondheidsgegevens</td>
                  <td data-label="Waar">Nederland</td>
                </tr>
              </tbody>
            </table>
            <p>
              Apple Health, Strava, Polar en KINVENT zijn geen verwerkers van ons maar bronnen
              waaruit we lezen; zie de kopjes hierboven. Oefenvideo&apos;s tonen we via YouTube (in
              de &quot;nocookie&quot;-modus) of Vimeo. Pas als je op afspelen tikt, laadt de video en kan
              die aanbieder je IP-adres zien. Er gaat geen dossierinformatie mee.
            </p>

            <h2 id="buiten-eer"><i>11</i>Buiten de EER</h2>
            <p>
              Je gegevens staan opgeslagen in Londen. Voor hosting, e-mail, pushmeldingen en
              AI-concepten werken we met bedrijven uit de Verenigde Staten. Voor die doorgifte
              gebruiken we de modelcontractbepalingen van de Europese Commissie en, waar de
              partij daarbij is aangesloten, het EU-US Data Privacy Framework.
            </p>

            <h2 id="bewaren"><i>12</i>Hoe lang we bewaren</h2>
            <ul>
              <li>
                <strong>Patiënten:</strong> je gegevens in BASE horen bij je behandeling. Het
                dossier van de praktijk bewaren we 20 jaar na de laatste behandeling, zoals de
                WGBO voorschrijft. Je BASE-account kun je wel eerder laten verwijderen; zie het
                kopje over je rechten.
              </li>
              <li>
                <strong>Sporters:</strong> zolang je account bestaat. Vraag je verwijdering aan,
                dan wissen we alles 30 dagen later.
              </li>
              <li>
                <strong>Toegangslogboek:</strong> 5 jaar.
              </li>
              <li>
                <strong>Koppelsleutels</strong> van horloges en diensten: direct weg bij
                loskoppelen. <strong>Pushcodes:</strong> tot je uitlogt.
              </li>
              <li>
                <strong>Verzonden e-mails:</strong> Resend bewaart een verzendlog ongeveer 30
                dagen.
              </li>
            </ul>

            <h2 id="beveiliging"><i>13</i>Beveiliging</h2>
            <ul>
              <li>
                Inloggen zonder wachtwoord, met een code of link in je mailbox. Therapeuten en
                beheerders loggen daarnaast verplicht in met een tweede factor.
              </li>
              <li>
                Toegang wordt op de server afgedwongen per rol en per behandelrelatie, tot in de
                database (row level security op elke tabel).
              </li>
              <li>
                Versleutelde verbindingen, versleutelde opslag, en de sleutels van je
                koppelingen apart versleuteld.
              </li>
              <li>
                Een logboek van elke inzage en wijziging, dat we maandelijks nalopen.
              </li>
              <li>
                Dagelijkse back-ups, met een geteste herstelprocedure.
              </li>
              <li>
                Elke medewerker tekent een geheimhoudingsverklaring in de app. We laten de
                beveiliging regelmatig toetsen en hebben een procedure voor datalekken. Vind je
                zelf een kwetsbaarheid, mail me dan; we nemen dat serieus.
              </li>
            </ul>

            <h2 id="rechten"><i>14</i>Je rechten</h2>
            <p>Het meeste regel je zelf in de app, onder Instellingen.</p>
            <ul>
              <li>
                <strong>Inzien en downloaden:</strong> onder Mijn gegevens download je alles wat
                we van je hebben als bestand. Daar staat ook het toegangslogboek.
              </li>
              <li>
                <strong>Corrigeren:</strong> je profielgegevens pas je zelf aan. Klopt iets in
                je dossier niet, zeg het je behandelaar of mail me.
              </li>
              <li>
                <strong>Verwijderen:</strong> onder Instellingen vraag je verwijdering van je
                account aan. Je hebt dan 30 dagen bedenktijd waarin je het verzoek kunt
                intrekken. Daarna wissen we je account en alle gegevens in BASE, inclusief
                gekoppelde horlogegegevens en pushmeldingen. Je dossier bij de praktijk valt
                hier niet onder; dat bewaren we zolang de wet dat voorschrijft.
              </li>
              <li>
                <strong>Overdragen:</strong> de download is een leesbaar bestand dat je aan een
                andere zorgverlener kunt geven.
              </li>
              <li>
                <strong>Toestemming intrekken:</strong> koppelingen zet je zelf uit, net als je
                deelname aan cohort-inzichten.
              </li>
              <li>
                <strong>Bezwaar of beperking:</strong> mail me. Ik reageer binnen een maand en
                kan je vragen je te legitimeren.
              </li>
              <li>
                <strong>Klacht:</strong> kom je er met mij niet uit, dan kun je terecht bij de{' '}
                <a href="https://www.autoriteitpersoonsgegevens.nl" rel="noopener noreferrer">
                  Autoriteit Persoonsgegevens
                </a>
                .
              </li>
            </ul>

            <h2 id="minderjarigen"><i>15</i>Jonger dan 16</h2>
            <p>
              BASE is bedoeld voor gebruikers van 16 jaar en ouder. Voor een jongere patiënt
              maken we alleen een account aan met schriftelijke toestemming van een ouder of
              voogd.
            </p>

            <h2 id="cookies"><i>16</i>Cookies op getbase.coach</h2>
            <p>
              Getbase.coach zet alleen functionele cookies: de cookie die je ingelogd houdt en
              een onthouding van de cookiemelding in je browser. Er draaien geen analytics, geen
              tracking en geen advertentiecookies. Lettertypes hosten we zelf. Een oefenvideo
              laadt pas nadat je op afspelen tikt.
            </p>

            <h2 id="wijzigingen"><i>17</i>Wijzigingen</h2>
            <p>
              Verandert er iets in hoe BASE met gegevens omgaat, dan passen we deze pagina aan
              en zetten we de datum bovenaan bij. Bij een wezenlijke verandering, zoals een
              nieuwe soort gegevens of een nieuwe partij die ze verwerkt, laten we het je weten
              in de app of per e-mail.
            </p>

            <h2 id="contact"><i>18</i>Contact</h2>
            <div className={styles.legalContact}>
              <b>Movement Based Therapy</b>
              Jacob Bontiusplaats 40, 1018 LL Amsterdam
              <br />
              KvK 99220334
              <br />
              <a href={`mailto:${CONTACT_MAIL}`}>{CONTACT_MAIL}</a>
              <br />
              Verantwoordelijke en aanspreekpunt privacy: Jurre Kok
            </div>
          </div>
        </div>
      </section>

      <footer className={`${styles.sec} ${styles.closer}`}>
        <div className={styles.shell}>
          <div className={styles.footBar}>
            <span className={styles.footLink}>
              <ScrambleText text="BASE by Movement Based Therapy" />
            </span>
            <div className={styles.footLinks}>
              <a className={styles.footLink} href={`mailto:${CONTACT_MAIL}`}>{CONTACT_MAIL}</a>
              <a className={styles.footLink} href="https://www.movementbasedtherapy.nl">
                <ScrambleText text="Praktijk-site" />
              </a>
              <Link className={styles.footLink} href="/">
                <ScrambleText text="Voorpagina" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
