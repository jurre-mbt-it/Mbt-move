# Atletengroepen: één weekindeling naar een hele groep, plus groepsdashboard

Datum: 14 september 2026. Status: ontwerp, ter controle aan Jurre.

## Doel

Een coach kan een groep atleten maken (bijvoorbeeld "Selectie"), daar een
periodisering voor plannen ("Periodisering 2026/27") in de gewone weekplanner,
en die met één handeling naar alle leden sturen. Daarna is elke kopie van de
atleet zelf: individueel bijsturen raakt de groep niet, en een volgende
verzending vervangt alleen de gekozen weken. Op de groepspagina staat een
dashboard met de status van elke atleet in één oogopslag.

## Beslissingen uit het gesprek

- **Verzendlijst, geen levende koppeling.** De groepskalender is leidend; de
  coach kiest zelf het moment van "Stuur naar iedereen". Geen automatisch
  synchroniseren, geen terugmelding van individuele wijzigingen naar de groep.
- **Per week vervangen (keuze B).** Bij verzenden kies je weken; in die weken
  worden bij elk lid de items van deze groep vervangen. Andere weken, eigen
  items, andere programma's en andere groepen blijven staan. Dagen vóór vandaag
  en items met een gelogde sessie blijven altijd staan.
- **Kalendergebonden (keuze A).** De groep heeft een startdatum (maandag van
  week 1); week 3 is voor iedereen dezelfde kalenderweek. Einddatum optioneel.
- **Coach is eigenaar.** De coach maakt de groep en beheert de staf. Per
  toegevoegde therapeut kiest de coach een rol, later te wijzigen:
  **Meekijken** (dashboard en kalender lezen), **Meeplannen** (ook de
  groepskalender bewerken) of **Beheren** (ook verzenden en leden beheren).
  Alleen de groep verwijderen en staf beheren blijft altijd bij de coach.
  Therapeuten buiten de groep zien niets van de groep; een atleet die ook hun
  patiënt is, zien zij via de gewone behandelkoppeling.
- **Meerdere groepen per atleet mag.** Twee groepen op één dag geven twee
  trainingen naast elkaar.
- **De atleet ziet de programmanaam.** Elke verzonden training draagt
  "Onderdeel van Periodisering 2026/27".
- **Bewust later:** therapeut als eigenaar van een groep, automatisch
  synchroniseren, groepsoverzicht van gelogde sessies per training.

## Datamodel

Additieve migratie `supabase/migrations/20260914_atletengroepen.sql`, RLS met
default deny op de nieuwe tabellen (alle toegang via de server).

- **`athlete_groups`**: `id`, `name` (groepsnaam), `planName` (programmanaam,
  wat de atleet ziet; leeg = groepsnaam), `description?`, `ownerId` (coach),
  `startDate` (maandag), `endDate?`, `lastSentAt?`, `createdAt`, `updatedAt`.
- **`athlete_group_members`**: `groupId`, `patientId` (User), `addedAt`,
  `lastSentAt?`. Uniek op (groep, atleet).
- **`athlete_group_staff`**: `groupId`, `userId` (therapeut of coach),
  `role` = `OWNER` | `VIEWER` | `PLANNER` | `MANAGER`, `addedAt`. De eigenaar
  staat hier ook, zodat één query "mijn groepen" oplevert. Rechten per rol:

  | Handeling                          | VIEWER | PLANNER | MANAGER | OWNER |
  |------------------------------------|:------:|:-------:|:-------:|:-----:|
  | Dashboard en kalender bekijken     |   ja   |   ja    |   ja    |  ja   |
  | Notitie per lid schrijven          |   ja   |   ja    |   ja    |  ja   |
  | Groepskalender bewerken            |        |   ja    |   ja    |  ja   |
  | Stuur naar iedereen                |        |         |   ja    |  ja   |
  | Leden toevoegen en verwijderen     |        |         |   ja    |  ja   |
  | Naam, programmanaam, periode       |        |         |   ja    |  ja   |
  | Staf toevoegen, rol wijzigen       |        |         |         |  ja   |
  | Groep verwijderen                  |        |         |         |  ja   |
- **`week_schedules.groupId?`**: de groepskalender bestaat uit gewone
  weekschema's met `groupId` gevuld, `patientId` leeg, `isTemplate` false,
  `weekNumber` 1..N en `startDate` op de echte maandag, net als
  `planTemplateId` dat voor bibliotheekplannen doet. Alles wat de planner kent
  (bloklijst, cardio-workout, notities, groepen, klembord) werkt daardoor
  ongewijzigd op een groep. `listWithItems` en `ensureWeek`-achtige paden
  krijgen naast `patientId` een `groupId`-variant.
- **`week_schedule_day_items.groupId?` en `sourceItemId?`**: herkomst op de
  kopie bij de atleet. `groupId` zegt "van deze groep", `sourceItemId` welk
  groepsitem de bron was. Individueel bewerken laat de markering staan. Bij
  verwijderen van een lid of een groep gaat de verwijzing op null (rij blijft,
  `onDelete: SetNull`).
- **Notitie van de coach per lid**: `athlete_group_members.note?`
  (tekst, max 500). Alleen zichtbaar voor staf van de groep; nooit voor de
  atleet, nooit in dossierkopieën.

Let op de TS2589-regel uit AGENTS.md: geen nieuwe Json-kolommen, dus geen
extra `omit`-werk; de nieuwe kolommen zijn scalars.

## Server: router `athleteGroups`

Alle procedures via `coachStaffProcedure` (coach, therapeut, admin), met een
helper `assertGroupRole(groupId, minimaal: 'VIEWER' | 'PLANNER' | 'MANAGER' |
'OWNER')` die de rol van de handelende gebruiker tegen de tabel hierboven
legt (admin leest altijd mee, zoals overal in het coachportaal; schrijven
doet een admin niet).

- `list` (mijn groepen, met ledenaantal en laatst verzonden),
  `get`, `create` (naam, programmanaam, startdatum, einddatum), `update`,
  `delete` (alleen eigenaar; bevestiging met ledenaantal in de UI).
- `addMembers` / `removeMember`: leden moeten aan de handelende gebruiker
  gekoppelde atleten zijn (coach: directe koppeling; therapeut: eigen
  patiënt). `setMemberNote`.
- `addStaff({ email, role })` / `setStaffRole` / `removeStaff` (alleen
  eigenaar): de coach werkt zonder praktijk, dus een therapeut wordt gezocht
  op het e-mailadres van een bestaand therapeutaccount, zoals uitnodigen nu
  werkt. De eigenaar kan zichzelf niet verwijderen of degraderen.
- `weeks(groupId)`: de weken van de groep (nummer, maandag, aantal items) voor
  het verzendvenster.
- `send({ groupId, weekIds, memberIds })`: zie hieronder.
- `dashboard(groupId)`: zie hieronder.

### Verzenden

Pure planningsfunctie in `src/server/lib/group-send.ts` (testbaar zonder
database): gegeven de groepsweken, de bestaande weken en items van het lid,
vandaag en de gelogde item-ids, levert hij per week een lijst "te verwijderen
item-ids" en "te kopiëren bronitems met doel-dag". Regels:

1. Per gekozen groepsweek: zoek de week van het lid met dezelfde maandag
   (`mondayKeyOf`, zoals `planTemplates.applyToPatient`); ontbreekt hij, maak
   hem aan met `weekNumber` = max + 1 en `startDate` = die maandag.
2. Verwijder in die week alle items met `groupId` = deze groep, behalve op
   dagen vóór vandaag en items met een gelogde sessie.
3. Kopieer de groepsitems van die week naar de overeenkomstige dag via
   `copyItemToDay` (bloklijst, cardio, groepen, notities komen mee) en zet
   `groupId` en `sourceItemId`. Dagen vóór vandaag worden overgeslagen.
4. Uitbehandelde of gearchiveerde leden worden overgeslagen en teruggemeld.
5. Eén transactie per lid; daarna `notifyNewSchedule(patientId)` één keer.
6. Resultaat: per lid aantal weken en trainingen, plus de lijst overgeslagen
   leden. `lastSentAt` op groep en lid bijgewerkt.

### Dashboard

`dashboard(groupId)` levert per lid één rij, samengesteld uit bestaande
bouwstenen, zonder nieuwe opslag:

- **Status**: `geblesseerd` als er in de laatste 7 dagen een `PainEntry` met
  NRS ≥ 4 is of `injuryInfo` gevuld is; anders `ok`. Met de laatste locatie.
- **Fris**: `computeReadiness` op vitals, slaap en welzijn van vandaag →
  GREEN/AMBER/RED/LEARNING, of `geen wearable` als er geen vitals in 14 dagen
  zijn.
- **Vorm**: de vorm (TSB) en het `loadStatus`-label uit `training-load.ts`
  over dezelfde curve als `patients.loadCurve`, plus de weekbelasting.
- **Deze week**: gepland (items in de huidige week, markeringen uitgezonderd)
  en gedaan (sessies gekoppeld aan die items, of per datum gelogd).
- **Laatste training**: datum, RPE, gevoel, met sessie-id voor de link.
- **Volgende**: eerstvolgende geplande training vanaf vandaag.
- **Aandacht**: true bij geblesseerd, RED, overreaching, of 0 gedaan bij ≥ 2
  gepland en het is donderdag of later. Sorteert bovenaan.
- **Notitie** van de coach.

De samenstelling per rij zit in een pure functie `src/lib/group-dashboard.ts`
met vaste voorbeelddata in de test; de router haalt alleen data op.

## Schermen

### Coachportaal en therapeutportaal

- **Groepen** (nieuw menupunt in beide portalen; therapeut ziet alleen groepen
  waar hij staf van is): lijst met naam, programmanaam, leden, startdatum,
  laatst verzonden. Aanmaken alleen voor de coach.
- **Groepspagina**: kop (namen, periode, knoppen "Plannen" en "Stuur naar
  iedereen"; knoppen verschijnen alleen bij voldoende rol), tabblad
  **Dashboard** (standaard) en tabblad **Leden en staf** (staf met rolkeuze
  Meekijken / Meeplannen / Beheren, alleen voor de eigenaar bewerkbaar).
  Dashboard: tellers (aandacht nodig, geblesseerd, geen wearable), filter
  "alleen wie aandacht vraagt", tabel met de kolommen hierboven, naam opent de
  atleetpagina, notitieveld per rij (opslaan bij verlaten van het veld).
- **Weekplanner**: de kiezer bovenin krijgt een kopje **Groepen** boven de
  atleten. Bij een groep: badge met groepsnaam in de kop, knop "Stuur naar
  iedereen", en verder de planner zoals hij is (`patientId` wordt `groupId`
  in de queries; geen sessies, geen belastingsbalk).
- **Verzendvenster**: weken van de groep vanaf de huidige week aangevinkt,
  oudere weken inklapbaar; leden allemaal aangevinkt, nieuwkomers (nooit
  verzonden) gemarkeerd; samenvatting "4 weken, 12 atleten, 36 trainingen";
  waarschuwing dat groepstrainingen in die weken bij die leden vervangen
  worden. Resultaat als toast, met overgeslagen leden.

### Atleetkant

- Web: kalender en runner tonen bij een verzonden training "Onderdeel van
  <programmanaam>". `calendarRange` en `getTodayExercises` geven daarvoor
  `groupPlanName` mee (join op de groep). Verder geen wijziging: een
  verzonden training is een gewoon item, dus loggen, bloklijst, cardio en
  metingen werken zoals ze zijn.
- App: werkt meteen (gewone items). Het label "Onderdeel van …" komt in de
  agenda-tegel en het trainingsscherm bij de volgende build; additief veld.

## Rechten en veiligheid

- Groep zichtbaar voor eigenaar en staf; wat iemand mag volgt de roltabel
  en wordt op de server per procedure afgedwongen, niet alleen in de UI.
  Admin leest mee.
- Leden toevoegen alleen uit eigen gekoppelde atleten of patiënten.
- Verzenden controleert per lid opnieuw de koppeling en de uitbehandeld-status
  (zelfde `assertPatientLink`/`assertNotDischarged` als plan toepassen).
- Nieuwe tabellen: RLS + default deny in dezelfde migratie.
- Auditlog-regel bij verzenden (groep, aantal leden, weken), zonder PII.
- AVG-docs: verwerkersregister en DPIA krijgen de groepsnotitie erbij als
  nieuw gegeven van de coach over de atleet (geen medische inhoud bedoeld,
  wel vrije tekst; zelfde behandeling als `weekNote`).

## Randgevallen

- Twee groepen op één dag: twee trainingen; een verzending raakt alleen de
  eigen `groupId`.
- **Persoonlijk en groep bijten elkaar niet, in beide richtingen.** Verzenden
  laat persoonlijke programma's, losse trainingen en items van andere groepen
  staan. Andersom: een persoonlijk programma of plan toepassen bij de atleet
  laat groepstrainingen staan. Concreet: `planTemplates.applyToPatient` in de
  stand "vervangen" verwijdert voortaan alleen items zónder `groupId` (nu
  maakt hij de hele week leeg), en de UI zegt dat erbij. Programma's koppelen
  (PROGRAM-item) voegt al toe zonder iets te verwijderen.
- Lid verwijderd of groep verwijderd: trainingen blijven, verwijzing leeg.
- Einddatum: alleen informatief en de grens van het verzendvenster.
- Verzenden buiten het zichtbare venster van de atleet: agenda's halen per
  periode op, dus dat komt vanzelf mee.
- Een lid zonder weekschema: wordt aangemaakt, zoals bij plan toepassen.
- Lege groepsweek: verwijdert wel de groepsitems van die week bij de leden
  (dat is de gekozen betekenis van "vervangen"); het venster meldt "0
  trainingen" bij zo'n week.

## Tests en controle

- Unit: `group-send.ts` (verleden overslaan, gelogd behouden, alleen eigen
  groep verwijderen, week aanmaken), `group-dashboard.ts` (status, aandacht,
  deze-week-telling) met vaste data.
- Router: `athleteGroups.send` tegen de testdatabase met twee leden en twee
  verzendingen (tweede verzending vervangt alleen de gekozen week en laat een
  individueel aangepaste andere week staan); rollen: een VIEWER die probeert
  te plannen of te verzenden krijgt FORBIDDEN.
- i18n: nieuwe validatiemeldingen in `error-messages.ts` en de bestaande test.
- Keten: na de bouw met de testatleet "Jurre test" doorlopen: groep maken,
  plannen, verzenden, kalender van de atleet op het web, en de
  `calendarRange`/`getTodayExercises`-aanroepen die de app gebruikt.

## Buiten scope

Therapeut als eigenaar van een groep, automatisch synchroniseren, terugmelden
van individuele wijzigingen, groepsoverzicht van gelogde sessies per training,
app-label vóór de volgende build.
