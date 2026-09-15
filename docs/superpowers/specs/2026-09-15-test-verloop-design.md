# Verloop per test voor de patiënt

Datum: 15-09-2026. Aanleiding: Jurre vroeg of een patiënt met een
revalidatieprotocol zijn tests en de voortgang per herhaalde test kan inzien.
Dat kon niet: testrapporten waren alleen voor de therapeut, het
revalidatiescherm in de app toonde per criterium alleen een statusstip, en
alleen Kinvent-metingen hadden een grafiek.

## Wat de patiënt krijgt

- **Tests-overzicht** in de app (route `test-verloop`), bereikbaar via een
  tegel op home. Eén regel per test met de laatste uitslag, het aantal
  metingen en de zonekleur. Kinvent-metingen staan er als aparte regel bij.
- **Detail per test**: grafiek over de tijd, doellijn van de fase, laatste
  uitslag groot, en alle metingen onder elkaar. Bij een bilaterale test kies
  je tussen links/rechts en LSI.
- **Revalidatiescherm**: per criterium de laatste meting met datum. Heeft het
  criterium een catalogustest met metingen, dan opent een tik de grafiek van
  die test met de drempel van dát criterium als doellijn.
- Hetzelfde op het web-patiëntportaal (patiënt en atleet).

De therapeut ziet dezelfde schermen voor een patiënt (app: blok Tests op het
patiëntprofiel; web: tab Tests), inclusief conceptrapporten, met een label.

## Regels

1. **Koppelen via de catalogustest.** Twee rapportregels horen bij dezelfde
   test als ze hetzelfde `catalogItemId` hebben. Regels zonder catalogustest
   (lege test, Kinvent-import zonder catalogus) groeperen op genormaliseerde
   naam + soort + eenheid. Nooit samenvoegen over die grens heen: een
   catalogus-Quadriceps in N en een losse "Quadriceps" in kg zijn twee reeksen.
2. **Alleen definitieve rapporten voor de patiënt.** `TestReport.status =
   FINAL`. Een concept verschijnt nooit op het toestel van de patiënt. De
   therapeut ziet ook concepten.
3. **Waarden afgerond** met `roundTestValue` (hele getallen, verhoudingen en
   per-kilo twee decimalen).
4. **Doellijn**: bij een criterium uit het lopende traject de drempel van dat
   criterium (`lsiMinGreen` op LSI, `newtonMinGreen` op links/rechts). Zonder
   criterium de groene zonegrens van de catalogustest op de geplotte maat.
   Regels zonder catalogustest krijgen geen doellijn: hun zones zijn
   standaardwaarden, geen klinisch doel. Standaardcriterium op het overzicht:
   het eerste criterium (op fasevolgorde) dat nog niet gehaald is, anders het
   laatste.
5. **Alleen eigen data.** `testReports.myTestHistory` leest `ctx.user.id` en
   neemt geen patientId aan. `testReports.historyForPatient` draait op
   therapistProcedure met dezelfde behandelrelatiecheck als de rapporten.

## Bouwstenen

- `src/lib/test-report/verloop.ts`: pure functie `bouwTestVerloop(regels,
  criteria, opties)` → gegroepeerde reeksen met punten, laatste uitslag,
  criteria en standaarddoel. Getest in `src/lib/__tests__/test-verloop.test.ts`.
- `testReports.myTestHistory` en `testReports.historyForPatient`.
- `rehab-data`: `catalogItemId` additief op elk criterium.
- App: `app/test-verloop/index.tsx`, `app/test-verloop/[key].tsx`,
  `components/test-verloop.tsx`, doellijn in `MultiLineChartV2` (`goal`),
  `app/rehab.tsx`, home-tegel, blok Tests op `app/patient/[id].tsx`.
- Web: `src/components/test-verloop/TestVerloop.tsx` (recharts met
  ReferenceLine), pagina's `/patient/tests`, `/athlete/tests`, link op de
  rehab-pagina's en dashboards, kaart op de therapeutpagina.

## Buiten scope

Advies- en interpretatietekst uit het rapport tonen aan de patiënt, PDF's
delen, en een pushmelding bij een nieuw definitief rapport.
