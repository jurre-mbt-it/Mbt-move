<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Multi-tenant scope: wat *wel* en *niet* praktijk-gescheiden is

De app is multi-tenant via `User.practiceId`. De volgende objecten zijn
**gedeeld binnen een `Practice`** — niet per therapeut afgeschermd. Dit is
opzettelijk; documenteer hier áls je het wijzigt:

- **Exercises** — een oefening die therapeut A in praktijk X aanmaakt is
  zichtbaar voor alle collega's in dezelfde praktijk (via `exercises.list`
  filter). Geen ownership-check op `creatorId` voor reads.
- **Programs (templates)** — `isTemplate: true` programma's zijn
  praktijk-breed zichtbaar; assigned programma's zitten alleen bij de
  patiënt + treating-therapeuten.
- **Week-schedules** — owner is creator, maar collega-therapeuten in
  dezelfde praktijk kunnen ze lezen.
- **Plan-sjablonen** (`WeekPlanTemplate`) — meerweekse behandelplannen die je
  vanaf een datum op de kalender van een patiënt zet. Scope als de
  test-library: `practiceId` NULL = globale seed (voor iedereen), gevuld =
  eigen praktijk. Reads = `practiceScope()` in `planTemplates.ts`, writes =
  `assertCanEdit()`. RLS deny-all. De inhoud zijn `WeekSchedule`-rijen met
  `isTemplate: true` + `planTemplateId`. Toepassen (`applyToPatient`) is een
  KOPIE: het sjabloon later wijzigen raakt lopende patiënten niet.
- **Test-library** (`TestCatalogItem`, `TestBattery`/`TestBatteryItem`) —
  therapeut-bewerkbaar via `/therapist/test-reports/manage`. Scope via
  `practiceId`: NULL = globale seed (voor iedereen), gevuld = eigen
  praktijk. Reads = `practiceScope()` in `testReports.ts` (NULL OF eigen
  practiceId). Writes = `assertCanEditLibrary()`: globale seeds zijn in de
  single-clinic realiteit óók bewerkbaar, verder alleen eigen praktijk.
  Batterijen kunnen als revalidatie-protocol dienen (`durationWeeks` +
  per-test `targetWeek`). Deze drie tabellen hebben RLS deny-all.
- **Patiënt-data** (sessions, wellness, pain entries, assessments,
  rehab-trackers, programma-toewijzing, dashboard, voortgang, insights,
  **wearable-data** — `SleepEntry`, `VitalsEntry`, `ReadinessSnapshot`,
  `WearableConnection` plus de van de watch gesyncte `CardioLog`-rijen
  (`source = APPLE_WATCH`), gelezen via `wearables.forPatient`) —
  toegang via directe `PatientTherapist`-relatie **OF** zelfde
  `practiceId` als de patiënt. Dit laat collega-therapeuten binnen één
  praktijk elkaars patiënten behandelen en sessies loggen zonder aparte
  invite/koppeling. Audit-trail (`SessionLog.therapistId`) legt vast wie
  wat heeft gedaan. Patroon: `hasPatientAccess()` in `patients.ts` of
  inline `OR: [{ patientTherapists: { some: ... } }, { practiceId: user.practiceId }]`.

## De COACH-rol staat bewust BUITEN de praktijk

Een coach is een `User` met `role = 'COACH'` en **altijd** `practiceId = null`
(zie docs/plan-coach-role-20260721.md). Daardoor valt elke praktijk-tak in de
toegangschecks voor die rol vanzelf weg: een coach ziet uitsluitend atleten
waarmee een directe `PatientTherapist`-koppeling bestaat, en praktijk-
therapeuten zien coach-atleten niet.

Vertrouw daarbij niet op de lege `practiceId`, maar bind de praktijk-tak
expliciet aan `role === 'THERAPIST'`. Dat staat zo in `hasPatientAccess()`
(src/server/lib/patient-access.ts) en in de kopieën in `wearables.ts`,
`weekSchedules.ts` en `planTemplates.ts`.

Twee gevolgen om te onthouden:

- **Plan-sjablonen**: `practiceId NULL` betekende "globale seed". Een
  coach-plan heeft óók practiceId null, dus scopet `scopeFor()` een coach op
  zijn eigen `creatorId`. Zonder dat lekken coach-plannen naar alle praktijken.
- **Procedures**: gedeelde begeleidingsfuncties draaien op
  `coachStaffProcedure` (therapeut/coach/admin). Klinische schrijf-acties
  (behandeling loggen, assessments, test-reports, rehab, hardloopanalyse)
  blijven op `therapistProcedure`. Een coach mág wel álles lezen.

Web-UI: het `(coach)`-segment is een dunne re-export van de therapeut-
pagina's. Links lopen via `usePortal()` (src/lib/portal.ts) — hardcode nooit
`/therapist/...` in een pagina die beide portalen delen.

Wat *wél* per-therapeut afgeschermd blijft:

- **Therapist-notities op `PatientTherapist`** — privé per relatie, niet
  zichtbaar voor collega's (`patients.update` raakt alleen eigen relatie).
- **Koppelingsbeheer** (`patients.delete`, `patients.resendInvite`,
  patient-side `respondToTherapistAccess`/`revokeTherapistAccess`) —
  alleen eigen `PatientTherapist`-rij; collega's kunnen jouw koppeling
  niet verwijderen of opnieuw verzenden.
- **Audit-logs** — alleen admin.

Soft-delete (`User.deletedAt`) wordt automatisch afgedwongen op reads via
een Prisma client-extension in [`src/lib/prisma.ts`](src/lib/prisma.ts).
Escape-hatch: `where: { deletedAt: undefined }` (geen filter) of
`{ deletedAt: { not: null } }` (admin/cron flows).

DPA-acceptance is verplicht voor PATIENT/ATHLETE vóór ze patient-data
endpoints raken, server-side afgedwongen in
[`src/lib/auth/require-role.ts`](src/lib/auth/require-role.ts).

# Gespiegelde code met de mobiele repo: draai de drift-check

De iOS-app (`/Users/eva/mbt-gym-mobile`, aparte repo) spiegelt bewust een paar
stukken uit deze repo: het cardio-blokkenmodel (`src/lib/cardio-workout.ts` ↔
`lib/cardio-workout.ts`), de voorschrift/parameter-constanten
(`src/lib/prescription.ts` + `src/lib/program-constants.ts` ↔
`lib/prescription-mirror.ts`) en de woord-tolerante oefening-zoekmatching
(`src/lib/exercise-search.ts` ↔ `lib/exercise-search.ts`, óók de bron van de
zoekmarkering in beide UI's). Er is geen gedeeld package.

Twee stukken lopen de andere kant op, omdat het trainingsdetailscherm in de app
begon: de namen van activiteiten (`src/lib/cardio-labels.ts` ↔ `lib/home-tiles.ts`)
en het rekenwerk achter de hartslagsectie (`src/lib/hr-series-view.ts` ↔
`lib/hr-series-view.ts`). Ook die staan in de drift-check. Zet labels voor een
gelogde activiteit dus **niet** in `cardio-constants.ts`: dat bestand beschrijft
wat je kunt voorschrijven, `cardio-labels.ts` beschrijft wat er terugkomt uit
een sync (hiken, HIIT, yoga, padel via het ruwe bron-type).

**Wijzig je een van die bronnen, draai dan `npm run check:mirror`** — dat laadt
de echte bestanden uit beide repo's en vergelijkt gedrag (zelfde blokken →
zelfde samenvatting/duur/kleuren/RPE's) en constanten. Faalt hij, trek de
andere kant gelijk vóór een release.

De mobiele repo heeft zelf geen test-runner, dus cross-repo controles staan
hier in `scripts/`. Naast de mirror-check geldt dat voor
`npm run check:session-payload`: die toetst `lib/session-payload.ts` uit de
app, het bestand dat bepaalt welke set-rijen van de sessie-runner bewaard
blijven. Raak je dat aan, draai hem dan — er verdween eerder stil invoer mee
(zie de kop hieronder).

## Sessie-runner: voorgevulde rijen zijn geen ingevulde rijen

De set-rijen in de runner staan bij het openen al vol met het gewicht van
vorige keer en de doel-reps. "Er staat een getal in het veld" zegt dus niets
over of die set gedaan is. Twee dingen mogen daarom niet door elkaar lopen:

- een rij die alleen de suggestie bevat → **niet** loggen, anders komen er sets
  in de historie die nooit gedaan zijn en vergiftigen ze `getLastWeights` en de
  1RM-curve
- een rij waar de patient zelf een gewicht of aantal in heeft gezet → **wel**
  loggen, ook zonder vinkje

Tot 21 aug 2026 stuurde de iOS-runner alleen afgevinkte rijen mee en viel geval
twee onder geval één: alles wat je had ingevuld maar niet afgevinkt verdween bij
het opslaan, zonder waarschuwing. Beide web-runners bewaarden die invoer al wel.
De app markeert nu per set of de patient hem zelf heeft aangepast (`touched`) en
noemt vóór het afronden welke oefeningen leeg de deur uit gaan.

# Weekdatums: reken in NL-tijd, nooit in UTC

`WeekSchedule.startDate` is "maandag 00:00 lokale tijd", opgeslagen als instant.
In de database ziet dat eruit als `2026-05-03T22:00:00Z` — dat is **maandag 4
mei in Amsterdam, maar zondag 3 mei in UTC**. Alle startDate-waarden in
productie hebben deze vorm.

Server-side `getUTCDay()` gebruiken ziet dus een zondag en schuift naar de
maandag ervóór: **een hele week ernaast**. De server draait op Vercel in UTC,
dus `getDay()` helpt evenmin. Gebruik altijd [`src/lib/week-dates.ts`](src/lib/week-dates.ts):
kalenderdagen als `YYYY-MM-DD` in `Europe/Amsterdam`, en `amsMidnight()` om
terug te schrijven in dezelfde vorm als de bestaande data.

Gerelateerd: **`weekNumber` is geen sleutel.** Er is geen unique-constraint en
de planner zet 'm niet op; in productie is hij vrijwel altijd 1 en delen
meerdere weken van dezelfde patiënt hetzelfde nummer (één patiënt heeft er 3,
waarvan 2 op dezelfde maandag). Alles wat een kalenderweek moet aanwijzen —
`duplicateWeek`, `saveFromWeeks`, `applyToPatient` — ankert daarom op datum.

# Invoervelden: corrigeer nooit tijdens het typen

**Een veld dat de invoer bij elke toetsaanslag omrekent en terugschrijft is
niet te bewerken.** Dit is twee keer gebeurd en allebei de keren gemeld als
"de cijfers gaan niet helemaal weg":

- Een `<input type="date">` die `mondayIso(new Date(e.target.value))` in zijn
  onChange deed. Tijdens het typen is de waarde even leeg, en `new Date('')`
  is een Invalid Date die verderop `"NaN-NaN-NaN"` oplevert; daarna is het veld
  niet meer leeg te krijgen. Half getypte invoer sprong bovendien naar een
  andere week (`2026-08` werd 27 juli), en kalenderklikken leek stuk omdat je
  zaterdag koos en maandag zag verschijnen.
- Getalvelden met `Math.max(1, Number(e.target.value) || 1)` in de onChange:
  leeghalen springt terug naar de ondergrens, dus je kunt er geen ander getal
  in tikken.

De regel: **tijdens het typen is de tekst van de gebruiker de waarheid.**
Omrekenen, klemmen en normaliseren gebeurt bij `blur` of Enter, of helemaal
niet. Moet er iets afgeleid worden (de maandag van de gekozen week), zet dat
zichtbaar náást of ónder het veld in plaats van de invoer te overschrijven.

Gebruik `NumberField` uit [`src/components/dark-ui`](src/components/dark-ui/NumberField.tsx)
voor getallen met grenzen; die doet dit al, inclusief terugvallen op de vorige
waarde als je het veld leeg achterlaat. Voor datums: parse met `isDateKey` en
reken met `mondayKey` uit [`src/lib/week-dates.ts`](src/lib/week-dates.ts), en
schrijf geen eigen `new Date(...)`-logica in een pagina.

# Wat mag een patiënt-client zien van de weekplanner?

`WeekScheduleDayItem.kind` (`WeekItemKind`) bepaalt wat er op een dag staat.
Alleen **PROGRAM** en **WORKOUT** zijn workouts. REST/NOTE/TEST/EVENT zijn
kalender-markeringen voor de therapeut.

`patient.calendarRange` is het **enige** endpoint dat items aan een patiënt of
aan de mobiele app teruggeeft, en filtert daarom hard op
`kind: { in: ['PROGRAM', 'WORKOUT'] }`. Dat moet zo blijven zolang die clients
`kind` niet kennen: web-atleet én iOS doen allebei
`quickCategory ?? 'STRENGTH'`, dus een notitie zou daar als krachttraining
verschijnen — in het verleden zelfs als "gemist", en als start-knop naar de
sessie-runner. Ruim het filter pas op ná een mobiele release die `kind` leest.

Sinds 2026-09-13 is `week_schedule_day_item_exercises` een **bloklijst**
(`blockKind` EXERCISE/NOTE/BREAK, `exerciseId` nullable, per-set-reps, AMRAP,
fase, opties). Het bestaande veld `exercises` in `patient.getTodayExercises`
en de `_count.exercises` in `calendarRange` bevatten daarom **alleen
EXERCISE-rijen**; de volledige lijst zit additief in `plannedItem.blocks` en de
groepen (superset/circuit per letter) in `plannedItem.groups`. Nieuwe
consumers van die tabel filteren met `isExerciseBlock()` uit
`src/lib/planner-blocks.ts` vóór ze `exercise.name` lezen. Kopiëren van rijen
gaat altijd via `copyBlockColumns()` in `src/server/lib/planner-block-columns.ts`,
en `groups`/`repsPerSet` blijven buiten `listWithItems` (TS2589, zie de
`omit`-regels daar).

Staafsnelheid en piekvermogen (`bar_speed`, `peak_power`) zijn **metingen per
set**, geen doelchips: de runners tonen ze als kolom naast kg/reps (`SetRows`
`meetKolommen`) en loggen ze als `extraParams`-entry met `perSet` plus een
samenvatting in `value` (snelheid gemiddeld, vermogen maximaal), zodat oudere
schermen en het dossier er niets van merken. De helpers staan in
`src/lib/session-sets.ts` (`meetKolommenVoor`, `meetParamsUitSets`,
`formatMeetParams`); de mobiele app spiegelt ze in `lib/session-payload.ts`.

Cardio in de `+ Oefening`-pop-up is **geen rij** maar de blokkenbouwer
(`CardioWorkoutBuilder`, `WeekScheduleDayItem.cardioParams`): het tabblad
Cardio roept `onOpenCardio` aan en de training krijgt één cardio-workout naast
zijn krachtrijen. `setItemCardio` zet `quickCategory` alleen op CARDIO als de
training geen oefeningrijen heeft; met rijen blijft de soort van de rijen
leidend en tonen de runners de cardio-workout als kaart bovenaan
(`CardioPlanRow`, atleet start hem in `/athlete/cardio/new?itemId=`). Zonder
`onOpenCardio` (dev-voorvertoning) blijft een kort activiteitsformulier over,
zonder per-set en AMRAP. In de programma-builder leeft dezelfde bouwer per
programmadag in `programs.cardioByDay` (sleutel `w1d2`, migratie
`20260914_programma_cardio.sql`, schema `programCardioSchema`); de runner
geeft de cardio van de dag top-level terug als `cardio` in
`patient.getTodayExercises`, voor trainingen én programmadagen. Nieuwe
Json-kolom op `programs` = ook in de `omit` van `programs.list` (TS2589).

# Atletengroepen: de groepskalender is een gewoon weekschema met `groupId`

Een atletengroep (`athlete_groups`) heeft leden, staf met een rol
(`src/server/lib/group-access.ts`, tabel in de spec) en een kalender van
`week_schedules` met `groupId` gevuld en `patientId` leeg. Daardoor werkt de
hele planner erop; de kiezer bovenin toont groepen boven de atleten.
"Stuur naar iedereen" (`athleteGroups.send`) vervangt per lid en per gekozen
week alleen items met deze `groupId`; de regels staan als pure functie in
`src/server/lib/group-send.ts` en de kopie draagt `groupId` + `sourceItemId`.
Andersom laat `planTemplates.applyToPatient` in de stand "vervangen" items mét
`groupId` staan. Bewerkrechten op een kalender lopen via
`assertMagKalenderBewerken` en de groepstak in `bewerkbareWeken` in
`weekSchedules.ts`: groepskalender → groepsrol PLANNER, atleet →
patiëntkoppeling. De atleet ziet `groupPlanName` op kalenderitems en op
`plannedItem` in `getTodayExercises`.

# Twee wearables op één dag: de eerste bron wint, en dat slot zit in de WHERE

Een gebruiker kan tegelijk een Apple Watch, een Polar en Strava hebben. Die
meten deels hetzelfde, dus iemand moet de dag "bezitten". De regel staat op
één plek, [`src/server/wearables/source-lock.ts`](src/server/wearables/source-lock.ts),
en luidt: **strikt de eerste bron die een dag of nacht levert houdt hem, een
tweede bron vult alleen aan wat leeg bleef.**

Hoe het misging: de regel bestond alleen als voorfilter in de Polar-sync,
terwijl `ingestWearableData` een kale `upsert` op `userId_date` deed. Polar
week dus voor de Apple Watch, maar Apple overschreef een Polar-nacht compleet
inclusief het bronlabel. In de praktijk was het geen "eerste wint" maar "Apple
wint altijd", en een dubbeldrager zag van zijn tweede wearable nooit iets.

Drie dingen om te onthouden als je hier komt:

- **Het slot hoort in de WHERE van de schrijfactie**, niet in een
  lees-dan-schrijf. Twee syncs kunnen tegelijk binnenkomen; de database
  beslist wie er eerst was.
- **Stil weggooien mag alleen als een ánder de dag al vastlegde.** De
  iOS-bridge schuift zijn HealthKit-anker door zodra de server 200 teruggeeft,
  ongeacht of de rij is weggeschreven. Een genegeerde nacht komt daar nooit
  meer langs. Een dag die nog niemand heeft bestaat niet als rij en wordt dus
  altijd aangemaakt, dus gaten vult iedereen.
- **`VitalsEntry` heeft twee eigenaars**, `source` voor de nachtgroep (rust-HR,
  HRV, ademhaling, polstemperatuur) en `daySource` voor de daggroep (energie,
  VO2max). Zonder die splitsing kaapt een middagsync met alleen dagwaarden het
  label van een rij waarvan de HRV van een ander apparaat kwam.
- **Dagtotalen kennen géén eigenaar: de hoogste waarde wint.** Dat geldt voor
  `steps` en `activeEnergyKcal`. Allebei lopen ze de hele dag op, dus het
  apparaat dat je het langst om had heeft de volledigste telling. Eerste-wint
  pakte hier twee keer verkeerd uit op 12-09-2026: een Polar-sync van 8252
  blokkeerde een hele dag Apple Watch die op 14852 uitkwam, en de actieve
  energie bleef op 647 kcal staan terwijl de hardloop van die dag er alleen al
  566 was. `basalEnergyKcal` en `vo2Max` volgen die uitzondering bewust NIET:
  een basaalverbruik is een formule uit lichaamsmaten en VO2max een
  puntschatting, daar telt niets op en zou "hoogste wint" alleen de meest
  optimistische bron kiezen.

Workouts vallen hier buiten: die ontdubbelen op tijd-overlap in
[`dedupe.ts`](src/server/wearables/dedupe.ts) en vullen elkaars lege velden
daar al aan.

# RLS verplicht op ELKE nieuwe public-tabel

De anon-key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) zit in de browserbundle. Een
`public`-tabel zónder RLS is daarmee rechtstreeks leesbaar/schrijfbaar via
de Supabase REST-API, buiten de app om. Supabase-linter flagt dit als
`rls_disabled_in_public`.

**Regel: wie een tabel toevoegt, zet in dezelfde migratie RLS aan.** Niet
los laten en "later de force-migratie draaien" — dat is precies hoe
`pain_entries` en de clinical-tests-tabellen (`clinical_tests`,
`patient_test_assignments`, `patient_test_results`) door de mazen vielen.

Minimaal (Prisma draait als owner en bypasst RLS, dus deny-all volstaat):

```sql
ALTER TABLE public.<tabel> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "default_deny" ON public.<tabel>
  FOR ALL TO public USING (false) WITH CHECK (false);
```

`prisma db push` zet GEEN RLS — na een push die een tabel toevoegt altijd
de RLS-migratie meesturen. Vangnet bij drift:
`supabase/migrations/20260521_force_rls_all_public.sql` is idempotent en
zet RLS + `default_deny` op elke tabel die het mist (geen DROP). Check de
staat met een query op `pg_class.relrowsecurity` voor `public`-tabellen.

## Tone of voice

Bij het schrijven of herschrijven van tekst voor dit product (UI-copy, notificaties,
marketing, blogs, patiëntadviezen, e-mails): volg `docs/tone-of-voice.md` en match
het juiste register. De AI-taal-blacklist daarin is hard (o.a. geen em-dashes, geen
holle marketingwoorden, geen slogan-antitheses).

# Kinvent: lees sprongen uit `_resultsModels`, nooit uit de samenvatting

De koppeling met Kinvent (`src/lib/kinvent/`, router `kinvent.ts`) leest
uitsluitend Kinvents lichte "common"-endpoints en de analyse met
`detailed=false`; de kopie van hun documentatie ligt buiten de repo in
`~/kinvent-koppeling/docs-2026-09/`. Twee dingen die uit die documentatie en
uit eigen praktijkdata kwamen en die je niet aan de payload ziet:

- **Een sprong (JUMP_ANALYSIS) heeft drie lagen.** De velden bovenin zijn
  relatief (piekkracht in veelvouden lichaamsgewicht, vermogen in W/kg) en
  `jumpHeight` daar is meestal een gemiddelde. `_repResults` is een
  ongedocumenteerde kg-laag die bij eenbenige sprongen ontbreekt; de eerste
  parser las die en liet daardoor 47 van de 162 praktijksprongen vallen.
  `_resultsModels` is het gedocumenteerde model per sprong, in Newton, met
  `mass` (kg) en `weight` (N) ernaast. `parseJump` leest alleen die laag, en
  `weight / mass` hoort 9,81 te zijn: dat is de eenheidscontrole.
- **Krachttests komen in kilogram, IMTP zonder rechterwaarde.** K-Pull, K-Grip,
  IMTP en Nordic staan in kgf (gedocumenteerd). Bij een IMTP serialiseert
  Kinvent alleen `_maxValue` (beide platen) en `_maxLeftValue`; rechts is het
  verschil. De variant met alleen `weight` is een weging op de platen, geen
  krachtmeting: `parseBodyWeight` maakt er het ijkpunt van voor de
  eenheidscontrole, want BASE legt zelf geen lichaamsgewicht vast.

Importeren blijft altijd een voorstel (`buildCandidates`) dat de therapeut
bevestigt; een geïmporteerde waarde overschrijft nooit een handmatig
ingevoerde. Nieuwe Kinvent-tabellen: migratie
`20260914_kinvent_koppeling.sql`, met RLS, nog niet op productie gedraaid.
