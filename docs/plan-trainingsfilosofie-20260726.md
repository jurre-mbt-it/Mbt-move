# Plan: trainingsfilosofie naar coachbeslissingen (herzien)

Datum: 2026-07-26. Status: PLAN, nog niet uitvoeren.

Dit is de herziening van het aangeleverde plan
(`2026-07-26_114737-base-trainingsfilosofie-claude-code.md`) na een volledige
audit van beide repo's. Het oorspronkelijke plan is inhoudelijk goed, maar de
schrijver kende de codebase niet: zes bestaande systemen die de nieuwe features
rechtstreeks raken ontbreken in zijn eigen "niet opnieuw bouwen"-lijst. Daardoor
staat er werk in dat al gedaan is, en ontbreekt werk dat wel nodig is.

Wat hieronder staat is de uitvoerbare versie: kleiner op release 1 en 3, scherper
op release 2, en met de echte gaten benoemd.

## Wat het oorspronkelijke plan niet wist

| Bestaand systeem | Waar | Welke geplande feature dit dupliceert |
|---|---|---|
| `RehabProtocol` / `RehabPhase` / `RehabCriterion` | schema, geseed | D: fases met `keyGoals[]`, `typicalStartWeek/EndWeek` en criteria met streefwaarden |
| `TestBattery.durationWeeks` + `TestBatteryItem.targetWeek` | schema | D: een batterij is al een tijdlijn-protocol met meetmomenten per week |
| `buildDailyStatus()` | `mbt-gym-mobile/lib/daily-status.ts` | B: pure rule engine, belasting maal herstel, zelfde inputs |
| `HashTag` / `TagVocabularyItem` | schema | F: praktijk-brede themalijst met precies de goede scope-semantiek |
| `ExerciseCollection` | schema | F: benoemde oefeningen-sets per therapeut |
| `ExerciseLog.phase` (`WARMUP` / `MAIN`) | schema, behandelscherm | C: `PRIMING` uit de voorgestelde rol-enum is hetzelfde |

Daarnaast: er zijn al vijf test- en meetsystemen (`TestCatalogItem`/`TestBattery`/
`TestReport`, `ClinicalTest`/`PatientTestAssignment`/`PatientTestResult`,
`AssessmentTest`/`PatientAssessment`, `RehabCriterion`, `RunningAnalysis`). Het
oorspronkelijke plan overweegt voor CMJ een `PerformanceMonitoringSession`. Dat
zou de zesde worden. Niet doen.

## Kernbeslissingen

1. **RIR wordt een parameter, geen schemakolom.** Besluit Jurre 2026-07-26: het
   heet "RIR" (niet "technische RIR", te lang) en het gaat in `STANDARD_PARAMS`
   naast Tempo, RPE, Gewicht, Afstand, Hartslag, Moeite en Band kleur. Dat kost
   nul migraties: voorgeschreven waarden reizen mee in `ProgramExercise.extraParams`
   en `WeekScheduleDayItemExercise.extraParams`, gelogde waarden in
   `ExerciseLog.extraParams`. De betekenis (herhalingen die nog mogelijk zijn met
   behoud van afgesproken techniek, ROM, controle en intentie) staat in de
   uitleg bij het veld, niet in de veldnaam.

   Hiermee vervalt het voorstel uit het oorspronkelijke plan voor
   `technicalRirMin/Max`-kolommen op twee tabellen. Er waren al drie manieren om
   RPE vast te leggen (`IntensityType.RPE` met bereik, de `RPE`-slider in
   `STANDARD_PARAMS`, en `SessionLog.exertionLevel`); een vierde veld op dezelfde
   as zou de therapeut alleen maar een keuzeprobleem geven.

2. **Stopreden en techniekkwaliteit gaan mee als parameters.** Zelfde reden,
   zelfde plek. `Stopreden` als select (Doelreps, Techniekgrens, Pijn,
   Vermoeidheid, Tijd, Anders) en `Techniek` als select (Goed, Acceptabel,
   Matig). Beide zijn in de praktijk log-only: een therapeut schrijft geen
   stopreden voor. Dat is geen bezwaar, `Pijnniveau` in
   `DEFAULT_CUSTOM_PARAMS` werkt nu al zo.

   Gevolg: aggregeren gebeurt in TypeScript over geladen logs, niet in SQL.
   Dat is precies wat `readyForProgression` al doet (het laadt `exerciseLogs`
   en mapt eroverheen), dus er gaat niets verloren. Zou er later wel een
   dashboard komen dat over duizenden logs op stopreden moet filteren, dan is
   promoveren naar een kolom een losse, additieve migratie.

3. **De adaptieve dosering bouwt bovenop `daily-status.ts`, niet ernaast.**
   Die functie classificeert al belasting maal herstel naar een niveau met een
   `driver`. Een tweede matrix met eigen drempels geeft op dezelfde dag
   tegenstrijdig advies op web en mobiel, en `daily-status.ts` zit niet in
   `check:mirror`, dus dat zou niemand merken. De classificatie verhuist naar
   web als canonieke bron en gaat de mirror-check in.

4. **Geen zesde testsysteem.** CMJ-monitoring gaat via `TestReport` en
   `TestCatalogItem` (`cmj-height` is al geseed).

5. **Geen tweede periodiseringsmodel.** Blokdoelen hangen aan
   `WeekSchedule.phaseType` en lenen de tijdlijn van `TestBattery.durationWeeks`.

6. **Migratie-conventie: schema plus Supabase-SQL, geen `prisma migrate`.**
   De repo heeft geen `prisma/migrations/`. De werkwijze is `schema.prisma`
   aanpassen, `prisma db push`, en in dezelfde stap een
   `supabase/migrations/*.sql` met RLS plus een entry in
   `scripts/check-migrations.ts`. Het oorspronkelijke plan vraagt om een echte
   Prisma-migratie; dat zou baselining van ongeveer negentig modellen tegen de
   live database vergen. AGENTS.md staat in de repo en gaat voor.

## Release 1

### A. RIR, stopreden en techniek

**Wat er al is.** `STANDARD_PARAMS` met zeven parameters, gespiegeld naar
mobiel in `lib/prescription-mirror.ts` en bewaakt door `check:mirror`.
Voorgeschreven parameters renderen al read-only in beide sessie-runners via
`formatPrescribedParam`. Gelogde parameters reizen al mee in de payload van
`patient.logSession` (max twintig, label max zestig tekens, waarde max
tweehonderd).

**Wat er ontbreekt, en dat zijn drie concrete dingen.**

*Eerste gat: een waarde van 0 wordt stil weggegooid.*
`filledParams()` in `src/lib/session-sets.ts:87` filtert op
`p.value !== 0`. RIR 0 betekent "tot technisch falen gegaan", precies de waarde
waar een coach op stuurt, en die zou nooit worden opgeslagen. Hetzelfde geldt
aan de voorschriftkant: `formatPrescribedParam()` in
`src/lib/prescription.ts:191` beschouwt `value === 0` zonder bovengrens als
leeg, dus een voorgeschreven "RIR 0" rendert helemaal niet.

Fix: beide functies moeten een parameter met ondergrens 0 als geldig
behandelen. `SessionParam` draagt `min` al; `PrescribedParam` niet, dus die
krijgt er een optioneel `min` bij. Dit is een echte bug die nu al latent
aanwezig is voor elke slider die bij 0 begint.

*Tweede gat: de iOS-runner kan helemaal geen parameters loggen.*
`app/session.tsx` (mobiel) toont voorgeschreven parameters alleen als chips
(regel 821-822). De invoer-parameters (`customParams` in `lib/workouts.ts:275`)
bestaan uitsluitend in `app/workouts/new.tsx`, de eigen-workout-bouwer van de
atleet. In de voorgeschreven-programma-runner is er dus geen veld om RIR,
stopreden of techniek in te vullen. Dit is verreweg het grootste bouwwerk van
feature A.

Daarbij: `ParamType` in `mbt-gym-mobile/lib/custom-params.ts` is
`'number' | 'text' | 'select'` en kent `'slider'` niet, terwijl RPE in
`STANDARD_PARAMS` een slider is. Die union moet mee.

*Derde gat: de progressiepoort kijkt niet naar techniek.*
`src/server/insights/rules/readyForProgression.ts` adviseert nu ongeveer plus
tien procent gewicht op basis van pijn en adherence, zonder enige technische
voorwaarde.

**Te bouwen.**

- `src/lib/program-constants.ts`: `RIR`, `Stopreden` en `Techniek` toevoegen aan
  `STANDARD_PARAMS`.
- `mbt-gym-mobile/lib/prescription-mirror.ts`: dezelfde drie in
  `STANDAARD_PARAMS`. `check:mirror` valt om zodra ze uiteenlopen.
- `src/lib/session-sets.ts` en `src/lib/prescription.ts`: de nul-waarde-fix.
- `src/lib/rir-progression.ts` (nieuw, puur) plus tests. Beslist of een
  zwaardere belasting als progressie telt.
- `readyForProgression.ts`: raadpleegt die helper.
- `mbt-gym-mobile/app/session.tsx`: parameter-invoer per oefening, met de
  voorgeschreven waarde als vertrekpunt.
- `mbt-gym-mobile/lib/custom-params.ts`: `'slider'` in `ParamType`.
- Uitleg bij het RIR-veld in de builder, in de tone-of-voice van
  `docs/tone-of-voice.md`.

**Tests** (`src/lib/__tests__/rir-progression.test.ts`):

1. zwaarder plus techniek Goed plus RIR binnen doel geeft een progressiesignaal;
2. zwaarder plus techniek Matig geeft geen signaal;
3. stopreden Techniekgrens vóór de doelreps geeft geen loadverhoging;
4. stopreden Pijn geeft geen progressievoorstel;
5. logs zonder deze parameters (alles wat er nu al ligt) blijven geldig en
   leveren geen vals positief;
6. RIR 0 overleeft de rondgang door `filledParams`.

**Acceptatie.** RIR is planbaar en logbaar in web en iOS. Bestaande programma's
en logs werken ongewijzigd door: parameters zijn opt-in per oefening. Geen
progressiesuggestie beloont technische achteruitgang. `check:mirror` slaagt.
Geen migratie.

### B. Adaptieve sessiedosering

**Wat er al is.** `buildDailyStatus()` (mobiel) zet readiness-band, load-status
per modaliteit, week-op-week-sprong, slaap en stress om in een niveau plus
adviestekst plus `driver`. Aan web-kant geven `overloadRisk` (vorm onder min
dertig gedurende N dagen), `deloadNeeded` (aanhoudende pijn), `painFlare` en
`readyForProgression` al concrete dosisadviezen aan de therapeut, met
percentages erin.

**Wat er ontbreekt.** Geen daarvan wordt een concreet voorstel voor de sessie
van vandaag dat de atleet accepteert of afwijst. Dat is het hele gat.

**Te bouwen.**

- `src/lib/training-day.ts` (nieuw): de niveau-classificatie uit
  `daily-status.ts`, letterlijk overgezet, web wordt canoniek. Mobiel importeert
  hem via de mirror.
- `src/lib/adaptive-session.ts` (nieuw, puur): niveau in, sessie-aanpassing uit.
- Toevoegen aan `scripts/check-mobile-mirror.ts`, want anders drijft dit weer
  uit elkaar.

Invoer en uitvoer zoals in het oorspronkelijke plan (§6), met één wijziging:
`removeRoles` hangt af van feature C, dus dat veld blijft leeg tot C er is en de
engine valt zolang terug op set-reductie.

**Beslisregels** ongewijzigd overgenomen: GREEN plan uitvoeren, AMBER eerst
accessoires weg en sets twintig tot dertig procent omlaag, RED volume dertig tot
vijftig procent omlaag met minimale kwaliteitsdosis of overslaan. Toenemende
pijn of duidelijke technische achteruitgang overruled readiness. Ontbrekende
wearabledata levert nooit een rood advies, alleen een beperkte datakwaliteit.
Wearabledata veroorzaakt nooit zelfstandig een trainingsverbod.

**Opslag.** Nieuwe tabel `SessionAdjustment`. Dit kan bewust niet als JSON-kolom
op `SessionLog`: bij niveau `SKIP` bestaat er per definitie geen `SessionLog` om
het aan te hangen, en juist die keuze wil je terugzien. Velden: patiënt, datum,
voorgesteld niveau, gekozen niveau, multipliers, redenen, versie van de rule
engine, optioneel `weekScheduleDayItemId` en `sessionLogId`. RLS aan met
deny-all, plus een entry in `scripts/check-migrations.ts`.

Het opgeslagen masterplan wordt nooit stilzwijgend aangepast. Het voorstel is een
uitvoeringsvariant voor vandaag.

**Tests** (`src/lib/__tests__/adaptive-session.test.ts`): de acht gevallen uit
het oorspronkelijke plan §6, plus een negende: dezelfde invoer geeft in
`training-day.ts` en in `buildDailyStatus()` hetzelfde niveau.

### C. Oefenrollen en sessiebudget

**Wat er al is.** `durationFromExercises()` in `src/lib/planned-load.ts` rekent
de duur al eenheid-bewust uit en zit in de mirror-check.
`ExerciseLog.phase` (`WARMUP` / `MAIN`) bestaat en wordt gebruikt in het
behandelscherm.

**Botsing die opgelost moet worden.** `PRIMING` uit de voorgestelde rol-enum is
hetzelfde als `WARMUP`. Voorstel: `PRIMING` valt af, rollen dekken alleen wat
`phase` niet dekt. De rol-enum wordt dan `MAIN`, `DEVELOPMENT`, `PREHAB_ANCHOR`,
`PREHAB_FOCUS`, `MAINTENANCE`, `RECOVERY`.

**Te bouwen.** Enum `ExerciseRole` plus een nullable kolom op `ProgramExercise`
en `WeekScheduleDayItemExercise` (per context, niet op `Exercise`: dezelfde
oefening kan in het ene programma hoofdwerk zijn en in het andere onderhoud).
`sessionBudgetSec` op `Program` en `WeekScheduleDayItem`, standaard zestig
minuten, optioneel voor bestaande plannen. Live geplande duur in de builder,
waarschuwing boven honderdvijf procent van het budget, reductievoorstel op
volgorde van rol. `MAIN` en `PREHAB_ANCHOR` worden nooit automatisch verwijderd.

**Val die twee keer eerder is misgegaan.** `setItemExercises` en `programs.save`
doen delete plus create: wat de client niet meestuurt is weg. De rol moet dus
door `toItemExercisePayload()` in
`src/components/week-planner/QuickExerciseBuilder.tsx:89`, door de
programma-builder, én door de iOS-programma-editor
(`mbt-gym-mobile/app/program-editor/[id].tsx`). Mist er één, dan wist opslaan de
rollen stil.

**Tests.** Duur onder budget geeft geen waarschuwing, erboven wel. De
reductievolgorde verwijdert eerst recovery en ontwikkelingswerk. `MAIN` en
`PREHAB_ANCHOR` blijven staan. De bestaande duurberekening verandert niet voor
programma's zonder rollen.

## Release 2

### D. Blokdoelen en sporttransfer

Driekwart bestaat al. `RehabPhase` heeft benoemde fases met `keyGoals[]` en een
weekvenster, `RehabCriterion` heeft streefwaarden met stoplichtdrempels, en
`TestBattery.durationWeeks` plus `TestBatteryItem.targetWeek` vormen samen al een
tijdlijn met meetmomenten. `WeekSchedule` draagt `phaseType`, `isDeload`,
`targetLoad` en `weekNote`.

Wat echt nieuw is: `PhysicalQuality` als blokdoel naast `PhaseType`, zodat
"Accumulation" onderscheiden kan worden in hypertrofie, maximaalkracht of
weefselcapaciteit, plus de koppeling naar een sport-KPI.

Ontwerpvraag die vóór de bouw beantwoord moet worden: wordt het blok een eigen
record op kalenderdatums, of een veld op `WeekSchedule` naast `phaseType`? Het
tweede is veel goedkoper en past bij de bestaande weekmetadata. Het eerste is
nodig als een blok expliciet een titel, rationale, nulmeting en eindmeting moet
dragen. Neiging: eigen record, want zonder nulmeting en eindmeting is de
transferkaart leeg, en `weekNumber` is geen bruikbare sleutel (geen
unique-constraint, in productie vrijwel altijd 1). Ankeren op kalenderdatum via
`src/lib/week-dates.ts`.

De transferkaart toont data en laat de coach duiden. Geen automatische conclusie
op basis van één test.

### E. Key sessions en wedstrijden

Het fundament staat: `WeekItemKind` kent al `EVENT` en `TEST`, en `TEST` hangt al
aan een `TestBattery`. Alleen metadata is nieuw: prioriteit (A, B, C,
`KEY_SESSION`), sporttype, starttijd, en optioneel `isCompetition`.

`patient.calendarRange` blijft filteren op `PROGRAM` en `WORKOUT`. Web-atleet en
iOS doen allebei `quickCategory ?? 'STRENGTH'`, dus een event zou daar als
krachttraining verschijnen, met een startknop naar de sessie-runner. Er is geen
version-gate. Het filter gaat pas open ná een mobiele release die `kind` leest.
Tot die tijd gebruikt de server events alleen voor planning en
interferentielogica.

Regel: waarschuwen bij zware ontwikkelingskracht binnen achtenveertig tot
tweeënzeventig uur voor een A-wedstrijd. Lichte bekende prehab één dag vooraf
mag. Priming mag bij laag volume, ruime RIR en geen nieuwe excentrische prikkel.
De waarschuwing is overrulebaar met een rationale.

Tests moeten de Amsterdamse datumgrenzen rond zomer- en wintertijd raken, want
`startDate` staat als NL-middernacht opgeslagen en UTC-rekenen zit er een hele
week naast.

### F. Prehab-anker en roterende focus

De thema's bestaan al. "Coach stelt per sport relevante thema's in (voet,
kuit/soleus, achilles, hamstrings, adductoren, romp/heup)" is letterlijk
`TagVocabularyItem`: praktijk-gescoped met `practiceId` NULL als globale seed,
met fuzzy-matching tegen typevarianten en episode-groepering al eromheen
gebouwd.

Nieuw is alleen: een thema koppelen aan een oefening in een programma
(`PREHAB_ANCHOR` versus `PREHAB_FOCUS` uit feature C), en waarschuwen als een
gekozen anker langer dan de ingestelde periode ontbreekt. Geen waarschuwing als
de coach het anker bewust pauzeert. Geplande rust en deload geven geen rode
waarschuwing.

Geen universele blessurepreventieclaim in de copy.

## Release 3

### H. Follow-up van vierentwintig tot tweeënzeventig uur

Dit is geen feature, dit is een filter. De infrastructuur is compleet:
`patient.getPendingPainFollowUps` (venster van zestien tot achtenveertig uur,
met dedup per oefening per dag), `patient.submitPainFollowUp`,
`ExerciseLog.painAfter24h` en `morningStiffness`, plus `pain-follow-up.tsx` op
mobiel en `patient/follow-up/page.tsx` op web.

Het enige wat de algemene versie tegenhoudt is `program: { tendinopathyMode: true }`
in de where-clause.

**Belangrijk, en dit stond fout in de eerste versie van dit plan.** Er is
vandaag géén push voor de pijn-follow-up. De query is pull-only: hij voedt een
kaartje op het home-scherm van de app (`app/(tabs)/index.tsx:1044`). De
`daily-reminders`-cron pusht alleen `push.reminder` en `push.insight`. Wie het
kaartje negeert, ziet het na achtenveertig uur vanzelf verdwijnen.

Het venster naar tweeënzeventig uur trekken zou dus enkel betekenen dat het
kaartje drie dagen blijft staan in plaats van twee. Dat is de verkeerde kant op.
Besluit Jurre 2026-07-26: dat gebeurt niet.

De meetvraag en de vraagfrequentie zijn twee verschillende dingen. Wat we willen
weten is hoe lang de reactie duurde (binnen vierentwintig uur, vierentwintig tot
achtenveertig, achtenveertig tot tweeënzeventig, of langer). Dat lees je uit het
antwoord, niet uit drie dagen doorvragen.

Ontwerp:

- Eén vraag, op ongeveer vierentwintig uur: ben je weer op je normale niveau?
- Antwoord "ja" betekent reactie binnen vierentwintig uur. Klaar, niets meer.
- Antwoord "nog niet" plaatst één vervolgvraag op ongeveer achtenveertig uur, en
  in het uiterste geval één op tweeënzeventig uur. De categorie "langer dan
  tweeënzeventig uur" komt van de patiënt die zelf zegt dat hij er nog niet is.
- Nooit meer dan één openstaande vraag per sessie.
- Onbeantwoord laten is een geldig antwoord: het kaartje verdwijnt en komt niet
  terug.
- Geen pushnotificatie voor deze flow. Blijft in-app, zoals nu.

Verder te doen: het `tendinopathyMode`-filter vervangen door triggercondities
(nieuwe oefening, hoge excentrische belasting, pijn tijdens of na de sessie,
coach markeert monitoring, ongebruikelijk hoge load), en velden voor DOMS en
stijfheid toevoegen. Meer dan tweeënzeventig uur maakt een signaal voor de
coach, niet voor de patiënt.

Het peesprotocol houdt zijn eigen regels en wordt niet platgeslagen tot algemene
DOMS-logica. DOMS zonder pijn is geen blessurealarm.

Dit is de goedkoopste echte winst in het hele plan.

### G. CMJ-readiness

`cmj-height` staat al in `scripts/test-catalog-data.ts:69` en `TestReport` kan
het al dragen. Te bouwen is een lichte monitoringflow die geen volledig
testrapport vereist, bovenop `TestReport` in `DRAFT`. Geen nieuw model.

Protocol: drie pogingen, gemiddelde van drie, zelfde meetbron. Twee tot drie
familiarisatiesessies tellen niet mee voor de baseline. Persoonlijke typische
fout berekenen en alleen dalingen groter dan de eigen meetruis markeren. De
algemene vijf-procentgrens alleen als tijdelijke terugval en duidelijk als
voorlopig gelabeld.

CMJ kan het adaptieve advies versterken maar veroorzaakt nooit zelfstandig een
`SKIP`.

### I. Middenafstandsjablonen

Pure content op bestaande structuren: `WeekPlanTemplate` met `practiceId` NULL
als globale seed, plus een testbatterij. Zes plansjablonen (800m en 1500m, elk
algemene opbouw, maximale kracht, wedstrijdonderhoud) en één
middenafstand-batterij met CMJ, een krachtproxy, RSI waar apparatuur is, een
sprinttest en een sportspecifieke KPI.

Geen vaste "elite versus recreatief"-zones zonder verdedigbare bron en
populatiematch. Geen universele gewichten.

`RunningAnalysis` bestaat al als bron voor hardloop-KPI's.

## Herziene volgorde

Het oorspronkelijke plan zet H in release 3. Dat is zonde: het is de kleinste
wijziging met de meeste opbrengst, en het raakt niets van wat daarna komt.

1. **H** (follow-up generiek maken, één vraag per sessie, geen push) en de
   nul-waarde-fix uit A. Klein, af, en direct nuttig.
2. **A** (RIR als parameter, iOS-parameterinvoer, progressiepoort).
3. **C** (rollen en budget), want B leunt erop voor `removeRoles`.
4. **B** (adaptieve dosering) bovenop `training-day.ts`.
5. **D**, **E**, **F**.
6. **G**, **I**.

Velocity-based training blijft buiten scope tot er betrouwbare hardware en een
invoerpad gekozen is.

## Migratie en beveiliging

Nieuwe tabellen in dit plan: `SessionAdjustment` (B) en mogelijk een blokrecord
(D). Nieuwe kolommen: `ExerciseRole` plus `sessionBudgetSec` (C), eventmetadata
(E), follow-upvelden (H). Feature A vergt niets.

Voor elke schemawijziging geldt:

1. `schema.prisma` aanpassen, dan `prisma db push`. Er is één database en dat is
   de productiedatabase, dus dit gebeurt alleen met expliciete toestemming.
2. In dezelfde stap een `supabase/migrations/*.sql` met RLS aan en een
   `default_deny`-policy. `prisma db push` zet geen RLS.
3. Een entry in `scripts/check-migrations.ts`.
4. Alles additief en nullable, zodat bestaande rijen en oude app-builds blijven
   werken.
5. Patiëntdata scopen via directe `PatientTherapist`-relatie of therapeut binnen
   dezelfde praktijk. De coach blijft buiten de praktijk en ziet alleen direct
   gekoppelde atleten. Bind de praktijk-tak expliciet aan `role === 'THERAPIST'`.
6. DPA-gating blijft actief.
7. Geen vrije medische tekst naar externe AI.

## Verificatie, en wat daarbij niet klopt

Na elke feature, in `/Users/eva/mbt-gym`:

```
npm test
npm run check:mirror
npm run build
```

Voor de mobiele repo `npm run lint` en `npx tsc --noEmit`, daarna opnieuw
`npm run check:mirror` vanuit web.

Twee dingen die het oorspronkelijke plan als groen aanneemt en dat niet zijn:

- **`npm run lint` haalt nooit exitcode 0.** De baseline is 3252 errors en 68289
  warnings, waarvan 1777 bestanden uit `.claude/worktrees` komen: scratch-worktrees
  die niet in de eslint-ignores staan. In de echte `src/` gaat het om ongeveer
  vijfenvijftig bestanden, allemaal pre-existing. De regel is dus: geen nieuwe
  fouten in aangeraakte bestanden, niet "lint moet groen".
- **`npm run db:check` laadt `.env.local` niet** en faalt kaal op een ontbrekende
  `DATABASE_URL`. Werkend commando:
  `node --env-file=.env.local ./node_modules/.bin/tsx scripts/check-migrations.ts`.
  Zo gedraaid zijn alle migraties groen.

Verder: er is precies één testbestand in de hele repo
(`src/lib/__tests__/muscle-fatigue.test.ts`, veertien tests). Prescription,
planned-load, readiness en training-load hebben er geen. De nieuwe pure helpers
uit dit plan komen er met tests bij, TDD.

Functioneel handmatig testen, minimaal: plan maken en toewijzen aan meerdere
atleten, voorschrift correct op mobiel, RIR en stopreden synchroniseren, het
adaptieve voorstel wijzigt alleen de uitvoering en niet het masterplan, een
legacyprogramma zonder de nieuwe parameters start normaal, event en notitie
verschijnen niet als workout bij de patiënt, tijdzone rond maandag en zomertijd
blijft kloppen, offline loggen synchroniseert zonder dubbele sessies.

## Openstaande vragen voor Jurre

1. **Stopreden en techniek als parameter, akkoord?** Kernbeslissing 2. Het
   alternatief is kolommen op `ExerciseLog`, wat een migratie kost maar wel in
   SQL filterbaar is. Aanbeveling: parameters, en pas promoveren als er een
   dashboard komt dat het nodig heeft.
2. **`PRIMING` laten vallen ten gunste van het bestaande `WARMUP`?** Feature C.
3. **Blokdoel als eigen record of als veld op `WeekSchedule`?** Feature D.
   Aanbeveling: eigen record, anders is de transferkaart leeg.
4. **Mag ik `prisma db push` draaien tegen productie?** Vanaf feature C is dat
   nodig. Alle wijzigingen zijn additief en nullable.
