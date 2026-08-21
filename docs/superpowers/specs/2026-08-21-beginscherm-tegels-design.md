# Beginscherm-tegels: laatste training en deze week

Ontwerp, 21 augustus 2026.

## Aanleiding

Een sporter meldde dat hij na het afronden van zijn programma zijn workout niet
terugzag. Zijn sessie stond compleet in de database en bovenaan zijn eigen
historie, maar op het beginscherm was er niets dat ernaar verwees. Het onderzoek
daarnaar legde twee fouten in de tegelrij bloot.

**De weekteller telt binnen één programma.** `completedThisWeek` in
`patient.getTodayExercises` filtert op `programId`, en de server kiest bij
meerdere actieve programma's het oudste. Frank Hansen heeft er twee. Hij trainde
dinsdag Schema A en vrijdag Schema B; de tegel stond op 1/1 en zijn sessie van
vrijdag telde nergens in mee.

**De totaalteller kent geen cardio.** `getSessionStats` telt alleen `SessionLog`.
Gemeten op 21 augustus:

| | Tegel toont | Werkelijk |
|---|---|---|
| Rencia Hugo | 0 | 38 activiteiten, 42u57 |
| Kaya Rall | 0 | 13 activiteiten, 15u55 |
| Jamie Rijff | 13 | 140 activiteiten, 55u02 |
| Lars van de Sanden | 19 | 49 activiteiten, 34u29 |
| jurre@movementbasedtherapy.nl | 20 | 56 activiteiten, 64u58 |

Twee mensen zien "TOTAL 0 SESSIONS · all-time logged" terwijl ze veertig uur
hebben getraind.

Meetellen van gesyncte activiteiten is verantwoord: van de 295 cardio-logs duurt
er maar 25 korter dan tien minuten, en het gemiddelde per soort ligt tussen 28 en
87 minuten. Dat zijn trainingen, geen ruis.

## Wat er komt

De tegelrij op beide beginschermen wordt:

Zoals het er voor Frank op 21 augustus uit had gezien:

```
LAATSTE                      DEZE WEEK
VANDAAG                      2  TRAININGEN
Schema B · 8 oef · 79 min    2u31 · 4 totaal
```

**LAATSTE** toont de meest recente activiteit, kracht of cardio. Groot de dag
("VANDAAG", "GISTEREN", anders "19 AUG"), daaronder wat het was. Dit is de tegel
die de melding wegneemt: je rondt af, komt op je beginscherm en ziet je werk
staan.

**DEZE WEEK** toont het aantal trainingen deze week over alle programma's, losse
workouts en cardio. Eronder de tijd van deze week en de all-time teller als
context. De grote getallen gaan bewust over de week, want daar kun je vandaag nog
iets mee; een all-time uurtotaal is een kilometerteller.

De pijntegel verdwijnt van het patiënt-beginscherm. Pijn hoort niet de blikvanger
te zijn op een beginscherm, en hij staat al rijker in Resultaten (sectie PIJN &
INSPANNING met dagtrend en richting) en in Geschiedenis (tegel plus kleur per
sessie). De quick action eronder wijst er met "Programma · pijn · trouw" al naar.

## Data

Eén serveraanroep. `patient.getSessionStats` krijgt velden erbij:

```ts
{
  total: number,              // ONGEWIJZIGD: krachtsessies all-time
  week: {
    count: number,            // kracht + cardio, maandag t/m zondag
    seconds: number,
  },
  allTime: { count: number }, // kracht + cardio
  last: null | LastActivity,
}
```

`total` blijft exact wat het nu is. Build 82 en ouder staan in TestFlight en lezen
dat veld; extra velden negeren ze. Er is dus geen version-gate nodig.

`LastActivity` draagt de velden die `EventDetailSheet` nodig heeft, in de vorm van
`CalEvent` uit `components/schedule-calendar.tsx`: voor kracht `kind: 'session'`
met id, programnaam, duur, RPE, pijn en aantal oefeningen; voor cardio
`kind: 'cardio'` met id, activiteit, duur, afstand, tempo, hartslag, zone, RPE,
pijn en notitie. De sheet haalt het oefeningdetail voor krachtsessies zelf op via
`patient.sessionDetail`.

`LastActivity` draagt daarnaast `completedAt`. De sheet-props `eventDate` en
`isToday` leidt de client daaruit af; die gaan niet over de lijn.

Alles zijn `count`- en `sum`-aggregaties plus één `findFirst` per soort. Er gaan
geen rijen over de lijn.

Weekgrens is maandag 00:00 tot en met zondag, gelijk aan hoe `completedThisWeek`
het nu al doet. De bestaande week-telling in `getTodayExercises` blijft staan,
want die stuurt de "week compleet"-boodschap bij een flexibel programma; hij
voedt alleen de tegel niet meer.

Krachtsessies tellen mee met dezelfde uitsluiting als nu: `status: 'COMPLETED'`,
zonder de tendinopathie-dagrondes.

## Tikken

**LAATSTE** opent de sessie zelf. `EventDetailSheet`
(`components/schedule-calendar.tsx`) doet dit al voor kracht en cardio en hangt
alleen aan `{ event, eventDate, isToday, onClose }`, dus zonder kalenderstaat. De
component en het `CalEvent`-type worden geëxporteerd en het beginscherm rendert
de sheet zelf. Geen nieuwe route, geen nieuw endpoint.

**DEZE WEEK** opent het Weekschema (`/kalender`). Dat toont via `calendarRange`
kracht en cardio op datum, dus het getal en de bestemming tellen hetzelfde. Niet
naar My Workouts: dat scherm leest `getSavedWorkouts()` uit AsyncStorage en toont
alleen zelfgebouwde workouts van dit toestel, geen programma-sessies en geen
cardio.

`MetricTile` krijgt een optionele `onPress` en wikkelt zichzelf dan in
`TapScale`, gelijk aan de gezondheidstegels.

## Randgevallen

**Nog nooit getraind.** LAATSTE toont een streepje met "nog niets gelogd" en is
niet tikbaar. DEZE WEEK toont 0.

**Wel getraind, niet deze week.** DEZE WEEK toont 0 met de all-time teller
eronder; LAATSTE laat zien hoe lang geleden het was. Dat samen is precies de
informatie die nu ontbreekt.

**Vergeten timers tellen mee.** Carel van Diggelen heeft een krachtsessie van 326
minuten staan, Lars één van 180. Er komt geen tweede klem op de weergave:
`clampSessionDurationSec` begrenst al bij het schrijven, en een display-klem zou
het weektotaal laten afwijken van de sessies die je kunt openen. Zulke sessies
horen in de data rechtgezet te worden.

**Oude app-builds.** Zie hierboven: `total` blijft staan.

## Testen

De web-repo heeft vitest, de mobiele repo geen test-runner. Cross-repo controles
staan in `scripts/`, zoals `check:mirror` en `check:session-payload`.

Server: unit tests op de aggregatie in de web-repo. Weekgrens rond maandag 00:00
en zondag 23:59, een patiënt met twee actieve programma's die in beide traint
(telt 2, niet 1), cardio zonder krachtsessies (telt, en `last` wijst naar de
cardio-log), tendinopathie-dagrondes tellen niet mee, en geen enkele activiteit
geeft `last: null`.

Client: de dag-labelfunctie ("VANDAAG", "GISTEREN", "19 AUG") en het samenstellen
van de subregel zijn pure functies en gaan in een module die vanuit de web-repo
te toetsen is, zoals `lib/session-payload.ts`.

## Buiten scope

De programma-gebonden weekteller in `getTodayExercises` blijft zoals hij is; die
hoort bij de "week compleet"-boodschap van een flexibel programma en is daar
correct. Geschiedenis blijft krachtsessies tonen. De 1RM-, belastings- en
wearable-schermen blijven ongemoeid.
