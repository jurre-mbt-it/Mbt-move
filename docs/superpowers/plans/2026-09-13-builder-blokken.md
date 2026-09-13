# Builder op de bloklijst

Vervolg op `2026-09-13-planner-blokken.md` (spec §7 noemde dit als open). Wens
Jurre 13-09: "de builder ook op deze manier, zelfde pop-ups, toevoegen simpel".

## Ontwerp

- **Data.** `program_exercises` krijgt dezelfde blokkolommen als de planner-rijen
  (`blockKind`, `exerciseId` nullable, `repsPerSet`, `amrap`, `phase`,
  `isBodyweight`, `completionOnly`, `trackMax`, `text`, `videoUrl`,
  `durationSec`). `programs.groups Json?` = `Record<'w{week}d{day}', ItemGroups>`.
  Migratie `20260913_programma_blokken.sql`, additief.
- **Server.** `ProgramExerciseInput` accepteert de blokvelden (validatie per
  soort zoals `blockInputSchema`); `create`/`save`/`duplicate` schrijven alle
  kolommen via één helper; `programs.get` geeft ze terug; `patient.getTodayExercises`
  filtert oefeningsrijen voor `exercises` (iOS-veilig) en geeft `blocks` +
  `groups` van de dag van vandaag terug, in beide takken (planner-item en
  programma). "Opslaan als programma" vanuit de planner neemt notities, pauzes
  en groepen mee.
- **Builder.** `BuilderExercise` krijgt de blokvelden; de dagweergave wordt
  `BlockRows` (zelfde als het zijpaneel) met `+ Oefening` → `ExerciseBlockDialog`.
  De bibliotheek-zijbalk blijft als snelle toevoeger (klik/sleep = oefening met
  standaardwaarden, daarna bewerken via de pop-up). `ProgramExerciseBlock` en
  `SupersetGroupBlock` verdwijnen uit de builder. Supersets/circuits via de
  pop-up (groep-select en circuitformulier); de oude selectie-superset-knop gaat weg.
- **Buiten scope (ronde 2):** slepen van rijen, rechtermuismenu, lasso, iOS.

## Stappen

1. Schema + migratie + compile-fixes (programs.ts, patient.ts, edit-page, weekSchedules).
2. Router: input, writes, get, getTodayExercises `blocks`/`groups`, list-count.
3. Builder: types, conversies `builderToBlock`/`draftToBuilder`, dagweergave, dialoog, opslaan met `groups`, edit-page laadt `groups`.
4. tsc + vitest + browsercheck op /therapist/programs/new; migratie op prod; commit.
