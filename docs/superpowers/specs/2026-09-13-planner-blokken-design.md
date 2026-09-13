# Planner-blokken: oefeningen toevoegen zoals in TeamBuildr

Datum: 2026-09-13
Status: goedgekeurd door Jurre (data en plannerscherm); atleet-kant en testen staan
hieronder als aannames en zijn niet apart afgetekend.
Referentie: schermopnames van TeamBuildr (kalender met "Add Exercise" per dag,
pop-up met typen-balk links, Lift-formulier met opties, custom reps per set).

## 1. Doel

De weekplanner moet aanvoelen als de TeamBuildr-kalender: een dag ís een training,
onder elke dag staat een knop "+ Oefening", die knop opent één brede pop-up met
links een balk van typen (oefening, cardio, circuit, notitie, pauze) en rechts een
volledig formulier. Alles wat nu een vinkje is wordt een schakelaar, sets/reps
krijgen een "per set"-stand (8/6/6/4) en de pop-up blijft open zodat je een hele
training in één keer opbouwt. Huisstijl blijft BASE (Instrument-uitvoering, zie
`docs/app-ontwerpsysteem.md`); alleen het bedieningsmodel komt van TeamBuildr.

Vandaag werkt het in twee stappen: "+ Workout" kiest een tegel en maakt een lege
workout met naam en duur; daarna open je het zijpaneel en bouw je met kleine
chips (sets, reps, L+R, rust, RPE, RIR). Per-set-schema's, supersets, tempo,
opties als lichaamsgewicht of staafsnelheid zijn er niet of alleen verborgen.

## 2. Besluiten (uit het gesprek)

| Vraag | Besluit |
|---|---|
| Waar leven oefeningen? | Dag = één training. "+ Oefening" op de dag maakt op verzoek één workout-item aan en voegt daaraan toe. Meerdere workouts per dag blijven mogelijk, elke workout heeft dan zijn eigen "+ Oefening". |
| Typen in de balk | Oefening (bibliotheek), Cardio, Circuit, Notitie (voor de atleet), Pauze. |
| Warming-up / cooldown | Een fase op een oefeningsrij, geen apart type. |
| Vragenlijst (Science), Health, Video, Progression | Buiten scope. Video later als link op een notitie of oefening. |
| Opties op het oefeningsformulier | Lichaamsgewicht, Alleen afvinken, Staafsnelheid + Piekvermogen, Max bijhouden aan/uit. |
| Custom reps | Schakelaar "Per set" naast reps, geen letters typen. AMRAP als aparte schakelaar. |
| Pop-up | Gecentreerde modal, blijft open na toevoegen, formulier reset naar hetzelfde type. |
| Atleet-kant | Web-sessie-runner leest de nieuwe velden mee in deze ronde. iOS volgt in een latere build. |
| Architectuur | A: één geordende lijst van blokken in de bestaande rijen-tabel. |

## 3. Data

### 3.1 `week_schedule_day_item_exercises` wordt de bloklijst

Bestaande tabel (`WeekScheduleDayItemExercise`), één migratie, geen nieuwe tabel.
RLS staat er al op.

| kolom | type | betekenis |
|---|---|---|
| `blockKind` | `String @default("EXERCISE")` | `EXERCISE` \| `NOTE` \| `BREAK`. Bestaande rijen blijven EXERCISE. |
| `exerciseId` | wordt `String?` | Verplicht bij EXERCISE, leeg bij NOTE/BREAK. Relatie `exercise Exercise?`. |
| `text` | `String?` | Notitietekst (NOTE), optionele tekst bij BREAK. Max 500. |
| `videoUrl` | `String?` | Optioneel bij NOTE. Alleen http(s). |
| `durationSec` | `Int?` | Lengte van een BREAK. 10..3600. |
| `repsPerSet` | `Json?` | `number[]`, precies `sets` lang. `null` = overal `reps`. |
| `amrap` | `Boolean @default(false)` | `reps` is een minimum, atleet doet zoveel mogelijk. |
| `phase` | `String?` | `WARMUP` \| `COOLDOWN`; `null` = hoofddeel. Zelfde woorden als `ExerciseLog.phase`. |
| `isBodyweight` | `Boolean @default(false)` | Geen gewichtsveld voor de atleet. |
| `completionOnly` | `Boolean @default(false)` | Alleen afvinken, geen sets/reps-invoer. |
| `trackMax` | `Boolean?` | `null` = volg `Exercise.trackOneRepMax`; `false` = geen 1RM/PR uit deze rij. |

Wat er níét bijkomt, omdat het er al is:

- **Per zijde**: `repUnit = 'reps/zijde'` of `'sec/zijde'` (`PER_SIDE_UNIT`).
- **Superset/circuit-lidmaatschap**: `supersetGroup` (letter) + `supersetOrder`.
- **Tempo, RIR, staafsnelheid, piekvermogen, voorgeschreven kg**: `extraParams`.
  Een schakelaar voegt de parameter toe of haalt hem weg. Vaste ids/labels:
  `tempo` "Tempo" (text), `rir` "RIR" (number), `bar_speed` "Staafsnelheid"
  (number, m/s), `peak_power` "Piekvermogen" (number, W), `gewicht` "Gewicht"
  (number, kg). De sessie-runner toont `extraParams` al als invoervelden, dus
  staafsnelheid en piekvermogen zijn daar per oefening (niet per set) in te
  vullen. Per set is een latere stap.
- **Intensiteit**: `intensityType` RPE / PERCENT_1RM (+ `intensityMin/Max`).

`reps` blijft altijd gevuld: bij een per-set-schema is het de waarde van set 1.
Oude clients (iOS) lezen dan nog een zinnige "4 × 8".

### 3.2 Groepen op het workout-item

`WeekScheduleDayItem.groups Json?`:

```ts
type ItemGroups = Record<string /* letter A..F */, {
  kind: 'SUPERSET' | 'CIRCUIT'
  name?: string
  rounds?: number        // circuit, 1..10
  timeCapSec?: number    // circuit, optioneel
  restSec?: number       // circuit: rust tussen rondes
}>
```

Een letter zonder vermelding in `groups` is een gewone superset (zoals nu).
`groups` reist mee via `listItemContents`, gecast naar dit platte type, precies
zoals `cardioParams`; nooit in `listWithItems` nesten (TS2589, zie
`reference_mbt_planner_item_content`).

### 3.3 Migratie

`supabase/migrations/20260913_planner_blokken.sql`: kolommen toevoegen,
`exercise_id` nullable maken. Handmatig op prod draaien met
`npx prisma db execute --file ...` (zie `feedback_mbt_supabase_migrations_manual`).
Geen data-backfill nodig.

## 4. Server (`src/server/routers/weekSchedules.ts` e.a.)

- **`setItemExercises`** blijft de naam, accepteert nu blokken. Validatie per soort:
  EXERCISE heeft `exerciseId`; NOTE heeft `text`; BREAK heeft `durationSec`;
  `repsPerSet` heeft precies `sets` elementen (1..1000 elk); `videoUrl` is http(s).
  `order` = positie in de array. Na opslaan:
  - afgeleide duur telt BREAK-rijen mee (`durationSec`) en NOTE-rijen niet;
  - `quickCategory` wordt de dominante categorie van de EXERCISE-rijen (gelijkspel
    = laten staan), behalve als het item `cardioParams` draagt (dan blijft CARDIO)
    of als er geen oefeningsrijen zijn.
- **`listItemContents`** geeft de volledige bloklijst terug (alle nieuwe kolommen,
  `exerciseName`/`exerciseCategory` leeg bij NOTE/BREAK) plus `groups` per item.
- **`ensureDayWorkout({ dayId })`** (nieuw): geeft het laatste WORKOUT-item van de
  dag terug of maakt er één aan (`quickName: 'Training'`, `quickCategory: STRENGTH`,
  `quickDurationSec: 45*60` als plaatsvervanger tot de inhoud de duur bepaalt).
  Zelfde toegangscheck als `addItem`; werkt ook op sjabloon-dagen (plan-editor).
  Bestaat de dag-rij nog niet (lege kalenderdag), dan maakt het die aan zoals
  `addItem` dat nu doet.
- **`setItemGroups({ itemId, groups })`** (nieuw) of onderdeel van `updateItem`:
  vervangt `groups`. Validatie: letters A..F, rounds 1..10, timeCapSec 10..7200,
  restSec 0..600.
- **Kopieerpaden** dragen alle kolommen: kopieer dag, opslaan als sjabloon,
  plan toepassen (`planTemplates.applyToPatient`), plan-editor. Eén gedeelde
  helper `blockColumns(row)` (select + copy) zodat een nieuwe kolom niet stil
  wegvalt. `groups` gaat mee met het item.
- **Atleet-procedures** (`patient.getTodayExercises`, `patient.calendarRange`,
  `patients.ts` sessie-overzicht): het bestaande veld `exercises` bevat alleen
  EXERCISE-rijen (server-side filter, `mapProgramExercise` krijgt nooit een rij
  zonder oefening). `_count.exercises` telt alleen EXERCISE-rijen. Additief nieuw
  veld `blocks` op `plannedItem` met de volledige lijst (soort, tekst, duur,
  fase, groep) en `groups`. Oude clients negeren `blocks`.
- **`patient.logSession`**: `trackMax === false` → geen `estimatedOneRepMax`
  opslaan voor die oefening (de client rekent hem nu; de server wist hem als de
  rij dat zegt). `completionOnly` → log met `setsCompleted = sets`, geen reps/kg.

## 5. Plannerscherm (`src/app/(therapist)/therapist/week-planner/page.tsx`)

### 5.1 Dagcel

- De workout-pil blijft de kop van de training (naam, statusteken, duur) en opent
  het zijpaneel zoals nu.
- Daaronder de blokrijen, compact: soorticoon in categoriekleur, naam, voorschrift
  in mono. Vormen: `3 × 8`, `4 × 8/6/6/4`, `3 × 5+` (AMRAP), `3 × 30 sec`,
  `L+R`-chipje bij per zijde, gekleurd groepsletter-chipje. Warming-up- en
  cooldown-rijen onder een mini-kop (`WARMING-UP`, `COOLDOWN`). Notitie = gedempte
  regel met notitie-icoon; pauze = `Pauze 3:00`.
- Klik op een rij → pop-up in bewerkstand. Hover → kruisje (verwijderen) en
  pijltjes omhoog/omlaag (volgorde). Slepen van rijen is bewust niet in deze
  ronde: de kalender sleept al hele workouts tussen dagen en nesten breekt.
- Onder de rijen van elke WORKOUT altijd zichtbaar `+ Oefening` in oranje. Heeft
  de dag geen workout, dan staat de knop onderaan de dag en maakt hij er één
  (`ensureDayWorkout`) en opent meteen de pop-up.
- Het huidige menu (workout toevoegen, vanuit sjabloon, kopieer dag) verhuist naar
  een `…`-knop in de dagkop (zichtbaar bij hover, altijd op touch). Rustdag,
  bibliotheek-programma, test en doel blijven zo bereikbaar. `AddItemModal` blijft
  bestaan voor die route.
- `WorkoutProfileStrip` blijft alleen voor cardio (zaagtand). Voor kracht nemen de
  rijen zijn plaats in; de regel "N oefeningen" vervalt.
- Alleen-lezen (gearchiveerde patiënt): rijen wel, knoppen niet.

### 5.2 Pop-up `ExerciseBlockDialog` (nieuw, `src/components/week-planner/`)

- `DarkDialogContent`, max-breedte ~880px, Instrument: kaartgrond, 12px radius,
  kop met daglabel + workoutnaam, kruisje. Onder 1024px: volle breedte, balk
  wordt een horizontale tab-rij bovenaan.
- **Balk links** (~76px): Oefening, Cardio, Circuit, Notitie, Pauze. Icoon +
  label in hoofdletters (Figtree). Actief = gevuld in de soortkleur
  (kracht/cardio uit `CATEGORY_COLORS`, circuit = superset-kleur, notitie =
  `--p-gold`, pauze = `inkDim`). In bewerkstand verborgen (type ligt vast).
- **Onderbalk**: primaire oranje knop over de volle breedte `Toevoegen aan
  training` (bewerkstand: `Opslaan`), daaronder stille knop `Leegmaken`.
  Na toevoegen: rij verschijnt in de dag achter de dialoog (optimistisch via
  `listItemContents`-cache), knop toont kort `Toegevoegd`, formulier reset naar
  hetzelfde type, focus terug op de oefeningzoeker. `Opslaan` sluit.
- Props: `{ open, itemId, dayLabel, workoutName, initialType, editBlock?,
  existingBlocks, groups, onClose }`. Werkt op patiënt- én sjabloon-items.
- Schakelaars: `Switch` uit `components/ui/switch.tsx`, herstyled op het palet
  (aan = oranje `--p-brand`, uit = `P.track`), met label rechts en een korte
  hint eronder in `inkDim`, zoals de TeamBuildr-onderregels.

### 5.3 Formulieren

**Oefening** (drie rijen):
1. Oefeningzoeker (combobox over `exercises.list`, categorie-filterchip zoals
   nu in `QuickExerciseBuilder`), Sets (getal + bereik-knop), Reps/tijd
   (eenheid-select `REP_UNITS` zonder de /zijde-varianten + getal + bereik-knop),
   schakelaars `Per set`, `AMRAP`, `Per zijde`.
   `Per set` aan → rij invoervelden `Set 1 … Set N`, voorgevuld met reps; volgt
   het aantal sets. `AMRAP` aan → reps-veld heet `Minimaal`. `Per zijde` zet
   `repUnit` op de /zijde-variant.
2. Instructie (`notes`, max 500), Groep (`–`, A..F met superset-kleur; toont
   `B · Circuit 3 rondes` als de letter een circuit is), Tempo (`extraParams`),
   Rust in seconden.
3. Intensiteit: segment `Geen / RPE / %1RM` met waarde + bereik-knop; RIR-veld.
   Opties (schakelaars): Lichaamsgewicht, Alleen afvinken, Staafsnelheid,
   Piekvermogen, Max bijhouden (aan tenzij `false`), en Fase als segment
   `Hoofd / Warming-up / Cooldown`.
   Bij `Alleen afvinken` aan: sets/reps-velden gedimd (blijven opgeslagen).

**Cardio**: zelfde skelet; zoeker gefilterd op CARDIO + PLYOMETRICS; eenheid
standaard `min` (of `m` als de oefening dat als `defaultRepUnit` heeft);
i.p.v. intensiteit vier schakelaars die elk een doel toevoegen in `extraParams`:
Zone (1..5, id `zone`), Tempo min/km (id `pace`, text `4:30`), Hartslag (id
`hartslag`, bpm), RPE (`intensityType RPE`). Opties: Alleen afvinken, Fase.
De interval-bouwer voor een cardio-dag blijft in het zijpaneel.

**Circuit**: Naam, Rondes (1..10), Tijdslimiet (mm:ss, optioneel), Rust tussen
rondes (s), Beschrijving. Opslaan = `setItemGroups` met de eerstvolgende vrije
letter als `CIRCUIT`, daarna springt de dialoog naar het Oefening-formulier met
die groep voorgeselecteerd. Bestaande circuits zijn te bewerken via het
groepsletter-chipje in de dagcel.

**Notitie**: Tekst (textarea, max 500), Videolink (optioneel). **Pauze**: Duur
(min:sec, standaard 2:00), optionele tekst.

Validatie in de dialoog (inline, geen toast): oefening verplicht; per-set-lijst
compleet; URL http(s); tekst niet leeg. Serverfouten via `toast.error`.

### 5.4 Zijpaneel en plan-editor

- Zijpaneel `ItemDetailContent`: het blok "Geplande oefeningen" toont dezelfde
  rijen (leesbaar) met per rij `Bewerken` → pop-up, en onderaan `+ Oefening`.
  `QuickExerciseBuilder` verdwijnt.
- Coach plan-editor (`src/app/(coach)/coach/plans/[id]/page.tsx`) gebruikt de
  builder nu ook; krijgt dezelfde rijen + pop-up op sjabloon-dagen.

## 6. Atleet-kant (web)

`src/app/(athlete)/athlete/session/page.tsx` en `athlete/schedule/page.tsx`:

- Set-rijen: doel-reps per set uit `repsPerSet[i]`; AMRAP toont `zoveel mogelijk
  (min. 5)`; `isBodyweight` verbergt het kg-veld; `completionOnly` maakt de
  oefening één afvinkknop; `trackMax === false` → geen 1RM-schatting.
- Fase: kopjes `WARMING-UP` / `COOLDOWN` boven de rijen, `ExerciseLog.phase`
  krijgt `WARMUP` (cooldown logt als `MAIN`, want de log-kolom kent geen
  COOLDOWN; uitbreiden is een aparte stap).
- Groepen: opeenvolgende rijen met dezelfde letter krijgen een groepskop
  `SUPERSET A` of `CIRCUIT B · 3 RONDES · 12:00 · RUST 60 S`. Geen ronde-timer in
  deze ronde; de atleet logt per oefening zoals nu.
- Notitie-blok: kaart met de tekst op zijn positie, videolink opent de bestaande
  videomodal. Pauze-blok: rij `PAUZE 3:00` met de bestaande rusttimer-knop.
- Agenda-detail (schedule) toont de rijen zoals de dagcel: `4 × 8/6/6/4`.

iOS: geen wijziging; leest `exercises` (alleen oefeningen) en `reps` (set 1).
Later: `blocks` lezen, per-set-doelen tonen.

## 7. Buiten scope

Vragenlijsten, video-blok, progressie-automatiek, staafsnelheid per set,
slepen van rijen, ronde-timer voor circuits, cooldown als eigen log-fase,
programma-builder-pariteit (de nieuwe kolommen bestaan alleen op planner-rijen),
iOS.

## 8. Testen en verificatie

- Unit (vitest, bestaande opzet volgen): formatter voor het voorschrift
  (`3 × 8`, `4 × 8/6/6/4`, `3 × 5+`, `L+R`), dominante-categorie-afleiding,
  duur-afleiding met pauzes, `blockColumns`-helper (alle kolommen aanwezig),
  zod-validatie van `setItemExercises` (per-set-lengte, NOTE zonder tekst).
- Handmatig in de browser (dev-server, therapeut-portaal): dag zonder workout →
  `+ Oefening` maakt "Training" en opent de pop-up; drie oefeningen achter
  elkaar toevoegen zonder sluiten; per-set-schema; circuit aanmaken en twee
  oefeningen erin; notitie en pauze; rij bewerken; volgorde; kopieer dag; dag
  in sjabloon via plan-editor; atleet-portaal: sessie starten met per-set-doelen,
  AMRAP, alleen afvinken, notitie en pauze zichtbaar.
- `npx tsc --noEmit` schoon; TS2589-bewaking op `listWithItems`.
- Prod: migratie handmatig, daarna deploy via `git archive` + `vercel --prod`
  (nooit vanuit een worktree). Pas na startsein van Jurre.
