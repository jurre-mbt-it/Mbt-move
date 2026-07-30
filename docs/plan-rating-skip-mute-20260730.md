# Beoordeel-popup: overslaan onthouden en per type dempen

*30 juli 2026 · raakt web-repo (server) + mbt-gym-mobile (app)*

## Aanleiding

Wie vaak synct (bijvoorbeeld dagelijks fietsen met de watch) krijgt bij elke
app-start de beoordeel-popup opnieuw voor dezelfde ritten. Oorzaak: "Later" in
de sheet haalt het item alleen uit de lokale wachtrij; `wearables.unratedActivities`
geeft alles met `ratedAt: null` (venster 7 dagen) bij de volgende verversing
gewoon weer terug.

Belangrijk voor de oplossingskeuze: een overgeslagen rit mist géén data. De
sync zet al een geschatte RPE uit de hartslag (`rpeFromHeartRate`, Karvonen) en
de belastingscurve rekent met `CardioLog.rpe` (fallback 5 zonder hartslag). De
popup voegt alleen subjectieve verfijning toe (eigen RPE, gevoel, notitie).
We slaan daarom géén verzonnen "gemiddelde beoordeling" op: de schatting van
de dag zelf is accurater, en een beoordeling die de patiënt niet gaf hoort
niet als beoordeling in het dossier.

## Besluit

1. **Overslaan wordt onthouden** (server-side, per rit). Een overgeslagen rit
   komt nooit meer terug in de popup-wachtrij.
2. **Per activiteitstype dempen, omkeerbaar.** Bij elke derde overgeslagen rit
   van hetzelfde type (3, 6, 9, …; laatste 30 dagen; alleen zolang het type
   niet gedempt is) biedt de app aan om dat type helemaal stil te houden.
   Weer aanzetten kan in Instellingen.

## Datamodel (additief, geen nieuwe tabellen, dus geen RLS-werk)

- `CardioLog.skippedAt DateTime?` — gezet bij "Overslaan" in de popup.
  Los van `ratedAt`: beoordelen via het detailscherm blijft mogelijk en wint
  (zodra `ratedAt` gevuld is doet `skippedAt` er niet meer toe).
- `User.ratingMutedActivities CardioActivity[] @default([])` — types waarvoor
  de popup stil is. Bewust niet op `NotificationPreference` (dat is puur push,
  met een master-switch die hier niets mee te maken heeft) en geen nieuwe
  tabel (zou meteen RLS-plicht meebrengen).

Uitrol: `prisma db push` (alleen nieuwe kolommen op bestaande tabellen).

## Server (`src/server/routers/wearables.ts`)

- `unratedActivities`: filtert extra op `skippedAt: null` en sluit
  `ratingMutedActivities` van de gebruiker uit (`activity: { notIn: … }`,
  alleen als de lijst niet leeg is).
- Nieuw `skipRating({ id })` (`wearablesProcedure`, ownership via
  `patientId: ctx.user.id`, zelfde patroon als `rateActivity`): zet
  `skippedAt = now()`. Retourneert `{ ok, activity, skippedOfType, muted }`
  met `skippedOfType` = aantal overgeslagen ritten van dat type in de laatste
  30 dagen en `muted` = staat het type al in de demp-lijst. De client beslist
  daarmee of het demp-aanbod verschijnt; de server houdt geen
  "al aangeboden"-boekhouding bij.
- Nieuw `setRatingMute({ activity, muted })`: voegt toe aan of verwijdert uit
  `ratingMutedActivities`. Idempotent; zelfde mutation dempt én herstelt.
- Nieuw `ratingMutes` (query): de huidige demp-lijst, voor het
  instellingen-scherm.

## App (mbt-gym-mobile)

**`components/rating-queue.tsx`**

- `skip()` schuift optimistisch door naar het volgende item en vuurt
  `wearables.skipRating` op de achtergrond (fout = stil negeren; ergste geval
  is dat de rit nog één keer terugkomt).
- Antwoordt de server met `skippedOfType >= 3`, `skippedOfType % 3 === 0` en
  `muted: false`, dan een `Alert`:
  - Titel: "Fietsritten stil houden?" (naam uit de bestaande `ACTIVITY_NL`-map)
  - Tekst: "Je sloeg nu 3 fietsritten over. Wil je dat we hier niet meer om
    vragen? De schatting uit je hartslag blijft meetellen. Terugzetten kan
    bij Instellingen."
  - Knoppen: "Blijf vragen" (niets) / "Niet meer vragen" →
    `setRatingMute({ activity, muted: true })` en alle items van dat type
    lokaal uit de wachtrij.
- Backdrop-tik en wegvegen worden het echte "later": de hele ronde sluit
  lokaal (wachtrij leeg, géén server-call) en komt bij de volgende
  foreground/refresh terug. Het huidige gedrag (backdrop skipt één item en de
  volgende sheet verschijnt meteen) vervalt.

**`components/rating-sheet.tsx`**

- Knop "Later" hernoemen naar "Overslaan" (die bewaart nu de skip).
- `onSkip` (persistent, knop) en `onClose` (ronde pauzeren, backdrop/veeg)
  worden aparte callbacks.

**`app/settings.tsx`**

- Nieuwe sectie "Beoordeel-popups", alleen zichtbaar als `ratingMutes` iets
  teruggeeft: per gedempt type een rij met switch om de popup weer aan te
  zetten (`setRatingMute({ activity, muted: false })`).

Het activity-detailscherm verandert niet: de "Beoordeel"-knop blijft de weg
om een overgeslagen of gedempte rit alsnog te beoordelen.

## Randgevallen

- **Oude app-builds**: kennen `skipRating` niet en houden het oude lokale
  gedrag; de servervelden zijn additief, niets breekt. Geen version-gate nodig.
- **Meerdere apparaten**: skips en demp-lijst staan server-side, dus iPhone en
  iPad blijven consistent.
- **Dossier blijft eerlijk**: `feelScore` blijft leeg, de RPE blijft de
  hartslag-schatting met het "· geschat"-label. Er komt geen `ratedAt` op een
  rit die de patiënt niet beoordeelde.
- **Web**: geen web-UI gebruikt `unratedActivities`; alleen de servervelden
  veranderen daar.

## Testen

- Vitest (web): de demp-aanbod-regel (elke 3e, alleen niet-gedempt) als pure
  functie testen; filtergedrag van `unratedActivities` op `skippedAt`/demp-lijst
  waar dat zonder DB kan.
- `tsc` schoon in beide repo's.
- Simulator: popup overslaan → app herstarten → rit komt niet terug; 3e skip
  van hetzelfde type → aanbod; dempen → geen popup meer; Instellingen →
  weer aanzetten → popup komt terug; backdrop-tik → ronde weg, na foreground
  weer terug.
- Op device pas te testen na een nieuwe EAS-build (zie mobile-repo-werkwijze).

## Volgorde van uitrol

1. Web-repo: schema + endpoints, deploy (additief, oude clients merken niets).
2. Mobile-repo: wachtrij/sheet/instellingen, `tsc`, simulator-QA.
3. EAS-build volgens de wachtrij-afspraken in de mobile-repo.
