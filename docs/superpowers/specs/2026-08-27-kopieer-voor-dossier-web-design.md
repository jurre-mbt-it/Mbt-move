# Kopieer voor dossier (web) — ontwerp

**Datum:** 2026-08-27
**Status:** goedgekeurd, in uitvoering

## Probleem

In de iOS-app zit onder "start behandeling" een kopieerknop: één tik en de
afgeronde sessie staat als platte tekst op het klembord, klaar om in het EPD
te plakken. De webapp — waar de therapeut op de iPad tijdens de behandeling
werkt — heeft dat niet. Wie de behandeling in het EPD wil vastleggen, typt
alles over.

Twee momenten waarop het nodig is:

1. **Direct bij afronden.** De therapeut vult RPE/pijn/duur in en wil de
   sessie meteen naar het dossier kunnen kopiëren.
2. **Achteraf via historie.** De sessie staat al in de app; het EPD nog niet
   bijgewerkt.

## Wat de web-app méér heeft dan iOS

De iOS-formatter (`lib/session-report.ts`) kent per oefening: naam, repUnit,
sets met reps/gewicht/RPE. De web-sessie draagt daarnaast:

- per-set gewichten (`weightsPerSet`) én per-set reps (`repsPerSet`)
- rep-eenheid per oefening (`repUnit`: reps / reps/zijde / sec / min / m)
- extra parameters (Tempo, Band kleur, Pauze, RPE, …) via `extraParams`
- superset-groep (A..F)
- fase: warming-up vs. hoofddeel (`phase`)
- pijn per oefening (`painLevel` / `painDuring`) en een oefening-notitie
- op sessie-niveau ook `feelScore` (1-5)

Dat gaat allemaal mee in de dossier-tekst — het is precies wat een therapeut
in het dossier kwijt wil.

## Architectuur

### Eén gedeelde formatter: `src/lib/dossier-report.ts`

Puur — geen React, geen Prisma. Zelfde soort module als `session-sets.ts`, en
op dezelfde manier getest met vitest.

```ts
formatSessionForDossier(session: DossierSession): string
formatCardioForDossier(log: DossierCardio): string
copyToClipboard(text: string): Promise<boolean>
```

De drie aanroepplekken bouwen elk hun eigen `DossierSession` uit hun eigen
state en delen daarna dezelfde tekstopbouw. De formatter accepteert bewust
losse, tolerante types (`unknown` voor JSON-velden, strings óf getallen voor
invoervelden) zodat de live-invoer van het behandelscherm er net zo goed in
past als een uit de database geladen sessie.

### Vorm van de tekst

```
Behandeling 27-08-2026 · 45 min

Warming-up
1. Roeien lage weerstand: 1×5 min

Hoofddeel
2. (A) Squat: 3×10 reps @ 40-45-50 kg (Tempo 3-1-1)
3. (A) Romanian deadlift: 3×10-8-6 reps @ 60 kg · pijn 2/10
   Laatste set met band, klacht zakte snel weg
4. Wall sit: 3×45 sec

Pijn 3/10 · RPE 6/10 · Gevoel 4/5
Notities: Rustig opgebouwd, volgende keer gewicht omhoog.
```

Regels:

- **Geen naam of geboortedatum.** Zelfde AVG-keuze als iOS: de therapeut plakt
  in het juiste dossier, en een verkeerde plak kan dan nooit een datalek
  worden. Alleen datum + inhoud.
- Kopjes `Warming-up` / `Hoofddeel` alleen als er écht een warming-up is; de
  nummering loopt door over beide blokken.
- Gewichten via de bestaande `formatWeightsPerSet` (`40-45-50 kg`, allemaal
  gelijk → `50 kg`). Per-set reps op dezelfde manier: gelijk → `3×10 reps`,
  verschillend → `3×10-8-6 reps`.
- Superset als `(A)` vóór de naam.
- Extra parameters tussen haakjes achter de regel — alleen de ingevulde.
- Pijn per oefening als `· pijn 2/10`; een oefening-notitie op een ingesprongen
  vervolgregel.
- Voettekst `Pijn 3/10 · RPE 6/10 · Gevoel 4/5`, dan `Notities: …`.
- Een oefening zonder enige inhoud (geen sets, geen gewicht, geen notitie)
  valt weg.

Cardio krijgt een eigen vorm, want sets/reps bestaan daar niet:

```
Cardio 26-08-2026 · Hardlopen (Intervallen) · 32 min
Afstand 6,20 km · tempo 5:10 /km · HR gem. 148 (max 171) · zone 3
RPE 7/10 · Pijn 1/10
Notities: …
```

### Vier knoppen

| Plek | Knop | Bron van de tekst |
|---|---|---|
| Afrond-modal live behandeling | `KOPIEER VOOR DOSSIER`, secundair, boven OPSLAAN | de live rows + de RPE/pijn/duur die op dat moment in de modal staan |
| Sessie-tegel op patiëntprofiel | kleine `KOPIEER` naast `BEWERK` | `recentSessions` |
| Sessie-bewerkscherm | knop in de footer naast opslaan | de live bewerkte waarden |
| Cardio-tegel op patiëntprofiel | kleine `KOPIEER` | `recentCardioSessions` |

Bij de afrond-modal is het belangrijk dat de knop de *huidige* invoer pakt en
niet de opgeslagen sessie: wat je kopieert is dan gegarandeerd wat je opslaat.

### Server — geen migratie

De kolommen bestaan al; ze worden alleen niet teruggegeven:

- `recentSessions` → `repsPerSet` en `phase` toevoegen aan de select en de
  return (`repUnit` zat er al in).
- `getSessionLog` → `repUnit`, `repsPerSet`, `phase` per oefening en
  `feelScore` op sessie-niveau.

Zonder deze velden levert een kopie uit de historie een ándere tekst op dan
dezelfde sessie live gekopieerd — dat is precies het soort stille afwijking
waar een therapeut niet op moet hoeven letten.

### Feedback

`toast.success('Gekopieerd — plak in het dossier')` (sonner staat er al).
Mislukt het klembord (oudere browser, geen secure context), dan
`toast.error`. De fallback is een verborgen textarea + `execCommand('copy')`,
omdat `navigator.clipboard` op een iPad in een niet-secure context ontbreekt.

## Bewust niet

- **Geen kopieerknop in de patiënt-/atleet-portalen.** Het dossier is
  therapeutenwerk; een patiënt heeft niets aan EPD-tekst.
- **Geen HTML/rich text.** EPD's plakken platte tekst het betrouwbaarst;
  opmaak valt daar toch weg of komt er verminkt in.
- **Geen naam/geboortedatum-optie.** Ook niet als instelling — zie AVG
  hierboven.

## Testen

`src/lib/__tests__/dossier-report.test.ts`, in dezelfde stijl als
`session-sets.test.ts`: uniforme sets, afwijkende sets, per-set gewichten,
rep-eenheden, warming-up/hoofddeel, superset, extra parameters, pijn per
oefening, lege sessie, en de cardio-variant.
