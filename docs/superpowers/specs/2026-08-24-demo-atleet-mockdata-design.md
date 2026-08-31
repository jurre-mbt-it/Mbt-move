# Demo-atleet vullen met mock data (websitefoto's)

**Datum:** 2026-08-24
**Status:** uitgevoerd op productie, geverifieerd

## Waarom

Voor productbeelden op de website moeten de atleet-schermen van BASE gevuld zijn.
De bestaande route was: inloggen op een echt account en alle namen maskeren in de
DOM (zie het opnameprotocol van 21-08). Dat is broos, want de dev-server ververst
het tabblad en dan staan de echte namen er zo weer.

Het Apple App Review-account bestaat al, staat op productie en bevat per definitie
geen patiëntgegevens. Vullen we dat met een samenhangend verhaal, dan kun je er
rechtstreeks in fotograferen zonder maskeerslag. Dat het account ook door Apple
gebruikt wordt is geen bezwaar maar een voordeel: een reviewer die inhoud ziet
begrijpt de app sneller.

## Uitgangssituatie (productie, gemeten 2026-08-24)

| Veld | Waarde |
|---|---|
| E-mail | `<testaccount-e-mail — bij Jurre>` |
| Rol | ATHLETE, praktijk "Movement Based Therapy" |
| Naam | Apple Review |
| Taal | **EN** |
| Geboortedatum / max-HR / rust-HR | **leeg** |
| DPA | v1.1 (actueel) |

Aanwezig: 1 programma, 1 sessie-rij. Leeg: cardio, slaap, vitals, dagbelasting,
stress, readiness, dagcheck, pijn, weekplanner, rehab-traject, wearable-koppeling.

Beschikbaar om uit te putten: 493 oefeningen (472 met spierbelasting) en 7
revalidatieprotocollen, waaronder het Melbourne VKB-protocol (specialty
`knee_acl`, 6 fases). Het script zoekt dat protocol op specialty op, niet op id.

## Scope

**Wel:** alles wat een ATLEET zelf ziet. Beginscherm, gezondheid, dagbelasting,
weekplanner, schema, sessie, historie, voortgang, revalidatie.

**Niet:** therapeut-, coach- en praktijkschermen. Daar is een demo-praktijk met
nep-patiënten voor nodig; dat is een eigen traject.

## Ontwerp

### Eén script, omkeerbaar

`scripts/seed-demo-athlete.ts`

* Idempotent: opnieuw draaien geeft dezelfde staat, geen dubbele rijen.
* `--wipe` verwijdert alles wat het script aanmaakt, gescoped op dit ene user-id.
* Deterministisch via een seeded RNG (mulberry32, zelfde patroon als
  `src/lib/wearable-mock.ts`). Een herhaalde run levert identieke grafieken, zodat
  een mislukte foto over te doen is zonder dat de curve verspringt.
* Draait tegen `DIRECT_URL` uit `.env.local`, met dezelfde `createPrisma()`-opzet
  als `create-apple-test-account.ts`.

### Het verhaal: 60 dagen, twee bedrijven

Dag 0 is vandaag; dag -59 is het begin van de reeks.

| Periode | Inhoud |
|---|---|
| Dag -59 t/m -32 (wk 1-4) | Late revalidatie na knieblessure. 3x kracht per week (knie/heup-gericht), cardio is wandelen en rustig fietsen. Pijn NRS 3 zakkend naar 1. RPE 4-6. Readiness overwegend amber. |
| Dag -31 t/m -25 (wk 5) | Overgangsweek. Eerste twee voorzichtige duurlopen van 20-25 min. Krachtvolume omhoog. Pijn 1. |
| Dag -24 t/m 0 (wk 6-9) | Opbouw naar sport. 2x kracht plus 3x hardlopen/fietsen. Oplopende weekbelasting met één deload-week (wk 8). Readiness groen, met een bewuste dip in de laatste 3 dagen. |

De dip aan het eind is opzet. Zonder dip staat elke tegel op groen en bestaat er
geen foto van een waarschuwingsstaat.

Het chronische belastingvenster is 42 dagen en loopt dus dwars door de overgang
heen. Dat werkt in ons voordeel: vermoeidheid daalt terwijl fitheid stijgt, wat
precies de vorm-curve oplevert die je wilt laten zien.

### Lagen

**1. Profiel**

`name`/`firstName` naar "Sam", `lastName` leeg, `locale` naar NL, `dateOfBirth`
op 1994-03-12, `maxHeartRate` 188, `restingHeartRate` 52.

Volgorde is belangrijk: het HR-profiel moet staan **vóór** de wearable-ingestie,
want `ingestWearableData` leidt de RPE van elke workout af uit de hartslag ten
opzichte van dit profiel. Zonder profiel valt hij terug op een leeftijdsschatting
en kloppen de zones op de cardioschermen niet.

**2. Wearable-laag via de echte pijplijn**

Niet met losse inserts, maar via `ingestWearableData(prisma, userId, payload)` met
een zelfgebouwde payload van 60 dagen, gevolgd door `computeAndStoreReadiness` per
geraakte dag. Dat levert in één keer:

* `SleepEntry` met hypnogram-segmenten en kwaliteitsscore
* `VitalsEntry` met HRV, rust-HR, ademhaling, polstemperatuur, stappen, kcal, VO2max
* `StressEntry` en `ExertionEntry`, afgeleid uit de intraday-hartslag
* `CardioLog` met `source: APPLE_WATCH` voor elke hardloop-, fiets- en wandelsessie
* `WearableConnection` (upsert zit in de ingestie), zodat de gezondheidstab
  "verbonden met Apple Watch Series 9" toont in plaats van een koppelknop
* `ReadinessSnapshot` per dag

De payload is een eigen generator, geen hergebruik van `mockSyncPayload()`: die
zet acht workouts vast op een vast ritme van elke drie dagen en kent geen verhaal.
De vorm van de payload volgt wel exact `syncPayloadSchema`.

**3. Kracht**

Twee programma's:

* "Knie-opbouw fase 3" — status COMPLETED, 4 weken, 3 dagen per week
* "Terug naar hardlopen" — status ACTIVE, 6 weken, 2 dagen per week

Oefeningen worden op naam/eigenschap opgezocht in de bestaande catalogus (STRENGTH
en STABILITY met spierbelasting op quadriceps, hamstrings, bilspieren, kuit), niet
op hardgecodeerde id's. Zo overleeft het script een herseeding van de catalogus.

Per trainingsdag een `SessionLog` (COMPLETED, met `duration`, `exertionLevel`,
`painLevel`, `feelScore`) met bijbehorende `ExerciseLog`-rijen inclusief
`weightsPerSet` en `repsPerSet`. Dit voedt de belastingcurve, de spiervermoeidheid
per regio, de weekcijfers op het beginscherm en het historie-scherm.

**4. Weekplanner**

`WeekSchedule` voor de huidige en de vorige week, met per dag `WeekScheduleDayItem`-
rijen: krachtworkouts gekoppeld aan het actieve programma, een cardio-item met
`quickActivity: RUNNING`, een expliciete rustdag (`kind: REST`) en één
therapeutnotitie (`kind: NOTE`). `targetLoad` en `weekNote` gevuld, zodat de
planner gepland naast gerealiseerd kan tonen.

**5. Dagcheck en pijn**

Een `WellnessCheck` per dag (slaap, spierpijn, vermoeidheid, stemming, stress op
1-5), meebewegend met het verhaal. `PainEntry`-rijen met aflopende NRS in het
revalidatiedeel, daarna alleen incidenteel.

**6. Rehab-traject**

`PatientRehabTracker` op het Melbourne VKB-protocol, met `surgeryDate` zeven
maanden terug en `activatedAt` zes maanden terug. Het traject begint dus ruim
voor het 60-daagse datavenster, wat klopt met een atleet die nu in de laatste
fase zit. Verder `RehabCriterionStatus`-rijen: fase 1 t/m 3 groen, fase 4 deels groen en deels
oranje, fase 5 en 6 nog niet gehaald. Zo laat het fasescherm een traject zien dat
midden in de terugkeer naar sport zit.

De therapeut wordt **alleen als `activatedById` gebruikt**. Er komt bewust geen
`PatientTherapist`-rij, zodat "Sam" niet tussen de echte patiënten in het
praktijkdashboard opduikt.

**7. Hashtags**

`#knie` op de revalidatiesessies via `HashTag` + `HashTagUsage`. De
episodegroepering hangt aan `HashTagUsage.loggedAt`, dus zonder deze rijen blijft
het klachtenscherm leeg.

### Meelift-fix

`scripts/create-apple-test-account.ts` heeft `DPA_VERSION` hardgecodeerd op `v1.0`,
terwijl `src/lib/dpa-constants.ts` inmiddels op `v1.1` staat. Het account staat nu
goed, maar wie dat script nog eens draait zet het terug naar v1.0 en gooit het
account daarmee uit de DPA-poort. Alle gezondheidsdata-endpoints gaan dan dicht.
Vervangen door een import van de constante.

## Risico's

**Dit schrijft naar de productiedatabase.** Dat kan niet anders, want het account
leeft daar. Beheersing: alles gescoped op één user-id, alles idempotent, `--wipe`
draait het terug. Het script raakt geen enkele rij van een andere gebruiker.

**Het is tegelijk het App Review-account.** De naam wordt "Sam" in plaats van
"Apple Review". De reviewer logt in op e-mail en wachtwoord, dus dat breekt niets.
De taal gaat van EN naar NL; als Apple een Engelse review doet is dat in de app
zelf om te zetten.

**Determinisme is een eis, geen nettigheid.** Zonder seeded RNG verspringt elke
grafiek bij een herhaalde run en sluit een nieuwe foto niet meer aan op een oude.

## Bijgesteld tijdens de uitvoering

Vier dingen bleken pas te kloppen na meten. Ze staan hier omdat ze niet uit het
ontwerp volgden maar uit de uitkomst.

**Weken lopen gelijk met de kalender, niet met blokken van 7 dagen.** De eerste
opzet telde vanaf de oudste dag, waardoor de deload-week half over een
planner-week viel: de weekplanner zette een rustdag op woensdag terwijl de
weeknotitie intervaltraining beloofde. Nu hangt alles aan `weeksAgo`, geteld in
hele kalenderweken terug vanaf de maandag van deze week. De deload valt bewust
twee weken terug: buiten de twee weken die de planner toont, wel zichtbaar als
dal in de belastingcurve.

**Cardio draagt een hartslagreeks en tijd-in-zone.** Zonder `series` en
`timeInZones` blijft het activiteitenscherm leeg, en dat is juist een van de
schermen die je fotografeert. De reeks wordt per minuut opgebouwd met de vorm
van het protocol (blokken bij intervallen, lichte drift bij duurlopen), en de
zoneverdeling wordt uit diezelfde reeks afgeleid, zodat kop en grafiek niet
uiteenlopen.

**Ook vandaag wordt gelogd.** Eerst bleef vandaag leeg zodat het beginscherm een
openstaande sessie zou tonen. Valt de run op een maandag, dan staat de tegel
"deze week" daarmee op nul. Een lege weektegel weegt zwaarder dan een
afgevinkte dag, dus vandaag telt gewoon mee.

**Alledaagse activiteit staat in de hartslag.** Zonder woon-werk, trap en
boodschappen blijft een rustdag onder de zone-1-drempel van 94 bpm en toont de
dagbelasting een nul, ook op de dag van de foto.

De hartslagen zijn daarnaast twee keer herijkt. In de eerste versie liep een
"rustige duurloop" op 80 procent van de maximale hartslag, waardoor elke duurloop
in zone 3 en 4 belandde en de belastingcurve op Overreaching-risico uitkwam. Nu
liggen de duurlopen in zone 2 en is de zondagsrit een echte herstelrit in plaats
van een tweede lange sessie pal na de lange duurloop.

## Verificatie (uitgevoerd 2026-08-24)

Gemeten via de echte code, niet door naar rijen te kijken: `computeLoadCurve`,
`computeReadinessFor` en `computeSessionStats`.

| Signaal | Uitkomst |
|---|---|
| Belasting kracht | 20 sessies, vorm +12,3 → status "Fris" |
| Belasting cardio | 38 sessies, vorm −10,3 → status "Productief" |
| Readiness laatste 6 dagen | 64 · 71 · 67 · 59 · 51 · 48 → van groen naar amber |
| Dagbelasting | elke dag gevuld, ook rustdagen (54–206 TRIMP) |
| Beginscherm-tegels | deze week 1 sessie / 35 min, 58 activiteiten totaal |
| Spiervermoeidheid | alle 6 gelogde oefeningen dragen spierbelasting |
| Revalidatie | fase 3 van 6 (week 12–26), 5 van 9 criteria behaald |
| Weekplanner | 2 weken × 7 dagen, kracht + cardio + rustdag + notitie |

Wat niet geverifieerd is: de visuele controle in de app. Inloggen vraagt het
wachtwoord van het account en dat voer ik niet in; dat is een stap voor Jurre.

## Bekend, niet opgelost

Het mobiele activiteitenscherm toont het tempo altijd als `/KM`, ook bij fietsen
(`app/health/activity/[id].tsx`). De webschermen gebruiken daar wel een
activiteit-bewuste opmaak (`formatPaceFromSecPerKm`). Dat is bestaand gedrag van
de app, niet iets wat deze seed introduceert, maar het is wel zichtbaar op een
foto van een fietsrit.
