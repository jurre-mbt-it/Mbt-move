# Activiteitstypen, meting bij de krachtsessie, en het trainingsdetailscherm

**Datum:** 2026-08-23
**Raakt:** `CardioActivity`, `CardioLog`, `SessionLog`, de HealthKit-brug en de
Strava-sync, `load-curve.ts`, `patient.sessionDetail`, en in de app het nieuwe
`app/training/[id].tsx`

## Aanleiding

Drie waarnemingen uit de app, in dezelfde week:

1. In de kalender heette vrijwel alles "Cardio". Een hike van 18 kilometer las
   hetzelfde als een rondje op de crosstrainer.
2. Een krachttraining die je op je horloge start levert wél een hartslagcurve
   op, maar die was nergens te zien bij de training zelf.
3. Op één dag stonden drie identieke kaarten voor dezelfde wandeling.

Bij het uitzoeken bleek er een vierde ding stuk dat niemand had gemeld.

## Wat er misging

### Alles heette "Cardio"

De HealthKit-brug in de app kende zeven `HKWorkoutActivityType`-nummers. Alles
daarbuiten viel naar `OTHER`, en `OTHER` heet in de app "Cardio". Hiken (24),
krachttraining (20 en 50), HIIT (63) en yoga (57) zaten er niet bij. Het ruwe
type werd nergens bewaard, dus achteraf viel niet meer te zien wat het geweest
was. Aan de Strava-kant werd `Hike` op `WALKING` geplakt en bestond kracht niet.

### De training telde dubbel

Wie zijn oefeningen in de app logt én op zijn horloge een workout start, legt
dezelfde training twee keer vast: op het horloge de tijd en de hartslag, in de
app de sets en reps. Die twee wisten niets van elkaar. Gevolg: twee kaarten in
de kalender, en in `load-curve.ts` twee keer sRPE voor één training.

### De ontdubbeling keek de verkeerde kant op

`findCrossSourceDuplicate` zocht alleen naar rijen van een ándere bron
(`source: { not: sourceOfNew }`). Dat vangt "Apple Watch én Strava", maar niet
het geval dat een tweede app zijn eigen workout naast die van de watch in Apple
Health schrijft: dan levert HealthKit twee records met verschillende UUID's voor
één training, van dezelfde bron. Vandaar de drie identieke kaarten.

### `timeInZones` was in de praktijk altijd leeg

Niet gemeld, wel gevonden: de brug stuurde `timeInZones` helemaal nooit mee. Op
een profiel van 36 gesyncte activiteiten was het veld één keer gevuld. Daardoor
gaf `edwardsTrimp` overal `null` en stond het TRIMP-deel van de belastingscurve
(`load-curve.ts`, `trimp` en `hrSessionCount`) al maanden uit. De hartslagcurve
(`series`) was er wél, bijna altijd.

## Besluiten

### Kleine enum, ruw type ernaast

`CardioActivity` krijgt er vier waarden bij: `HIKING`, `STRENGTH`, `HIIT`,
`YOGA`. Dat zijn precies de typen die de app ánders behandelt (belasting,
spiermoeheid, wel of geen tempo tonen). Alles daarbuiten blijft `OTHER`.

Daarnaast een kolom `CardioLog.sourceActivity` met het ruwe type van de bron
("hiking", "VirtualRide", "pickleball"). Het label pakt eerst onze enum en valt
anders terug op een nette weergave van dat ruwe type. Zo heet padel gewoon
"Padel" zonder dat elke nieuwe sport een migratie kost, en is een verkeerd
gemapte rij achteraf nog te herkennen.

Onbekende HealthKit-nummers komen mee als `hk-<nummer>` in plaats van als
niets. Dan is later te zien wát er langskwam.

**Wat dit niet repareert:** rijen die er al staan hebben geen ruw type, dus die
blijven "Overig" heten. Ze zijn wel te herstellen met een hersync, en dat is
veilig zodra de ontdubbeling hieronder werkt.

### De meting hoort bij de sessie

`CardioLog.sessionLogId` (uniek) koppelt een op de watch gemeten workout aan de
`SessionLog` met de sets en reps. Gekoppeld is die rij de MÉTING bij die sessie:
geen eigen kaart in de kalender, geen eigen regel in de activiteitenlijst, geen
eigen sRPE in de belastingscurve. De TRIMP telt wél gewoon mee, want dat is de
gemeten hartslagbelasting van die dag en die stond nergens anders.

De matchregel staat in `server/wearables/session-match.ts`:

- alleen `STRENGTH`, `HIIT`, `YOGA` en `OTHER`. Een hardloop die toevallig over
  een krachtsessie heen valt is een meetfout, geen match;
- tijdvenster van de sessie uit de gelogde duur, terug gerekend vanaf het
  afronden. Dat is het betrouwbare signaal;
- zonder gelogde duur het venster tussen starten en afronden, maar alleen als
  dat korter is dan vier uur. De overlapregel eist 50% van de kórtste van de
  twee, dus een sessie die 's ochtends gestart en 's avonds afgerond is zou
  anders elke losse workout uit die acht uur naar zich toe trekken;
- bij meerdere kandidaten wint de sessie waarvan het midden het dichtst bij dat
  van de meting ligt.

Het koppelen gebeurt van twee kanten: bij het binnenkomen van een meting, en
bij het afronden van een sessie. Anders hangt het van de volgorde af of een
training gekoppeld raakt.

### Strain deelt het ankerpunt met de dagbelasting

De strain van een training is `sessionStrain(trimp, recentDayTrimps)` — letterlijk
dezelfde curve en dezelfde referentiedagen als `exertionScore`. Geen eigen
ankerpunt per training.

De reden is dat de twee getallen naast elkaar op één scherm komen te staan. Een
training zit ín een dag; zou de training tegen andere trainingen geijkt worden
en de dag tegen andere dagen, dan kan er "training 7,1 · dag 6,3" verschijnen.
Met hetzelfde anker is die volgorde per constructie gegarandeerd: de TRIMP van
de training is kleiner dan die van de dag, en de curve is monotoon.

### Tijd-in-zone uit de hartslagcurve

`bpmHistogramFromSeries` zet de curve om in hetzelfde bpm-histogram dat de
dagbelasting gebruikt; `computeExertionDay` doet daarna het rekenwerk. Bewust
via het histogram en niet rechtstreeks naar zones, want dan volgen de dag en de
training gegarandeerd dezelfde zone-regels, inclusief de lichte band onder zone
1.

Aandachtspunten in die omzetting:

- het meetinterval komt uit de vólledige reeks, dus inclusief punten zonder
  hartslag. Anders schrijft het punt vóór een ontbrekende meting die minuut
  alsnog op zijn eigen zone bij;
- elk punt telt voor de afstand tot het volgende, begrensd op de mediaan. Zonder
  die begrenzing levert één meting na een uur pauze een vol uur in de zwaarste
  zone op.

De reeks werd bovendien afgekapt op 240 punten van een minuut, dus na vier uur
hield hij op. De bucket wordt nu breder bij lange sessies in plaats van de
staart korter.

### Ontdubbeling kijkt naar alle gesyncte rijen

`findDuplicate` (was `findCrossSourceDuplicate`) laat het bron-filter vallen.
Dat is veilig: we komen daar alleen langs als er nog géén rij met dezelfde
externalId bestond, want een hersync van dezelfde workout wordt eerder al
bijgewerkt. Handmatig gelogde cardio (geen externalId) blijft met rust.

Wat er al staat ruimt `scripts/dedupe-cardio-logs.ts` op. Droogloop is de
standaard; met `--apply` verdwijnen de kopieën. Per groep blijft de rijkste rij
staan: een beoordeling van de gebruiker weegt het zwaarst, dan een koppeling aan
een sessie, dan de hartslagcurve.

## Het trainingsdetailscherm

Eén scherm (`app/training/[id].tsx`) in plaats van drie plekken die elk een deel
lieten zien. Ingangen: de workout-bibliotheek en de kalender.

Van boven naar beneden: naam en datum, dan de strain als boog met de kerncijfers
eronder (tijd, RPE, gemiddelde en maximale hartslag), dan de hartslagcurve met
de zoneverdeling, dan de oefeningen, dan de knoppen.

Een boog en geen balk, omdat dit geen stand ten opzichte van een doelbereik is.
De dagbelasting beantwoordt "kan er vandaag nog iets bij?" en heeft daarom een
bereik; deze beantwoordt alleen "hoe zwaar was dit?". Met een doelbereik erbij
zou een zware training als waarschuwing lezen terwijl er niets aan de hand is.

De hartslagsectie verschijnt alleen als er echt gemeten is. Wie zonder horloge
traint hoort geen lege grafiek te zien.

`OPNIEUW DOEN` en `BEWERKEN` verschijnen alleen als het scherm via de
bibliotheek is geopend; die knoppen werken op de lokale workout, en een training
die je via de kalender opent heeft geen lokale tegenhanger. Een workout zonder
`sessionLogId` (nooit gesynct) opent nog de oude popup: er is dan geen
serversessie, en die popup is dan de eerlijke weergave.

## Wat er expliciet NIET verandert

- **De dagbelasting.** Die komt uit het dag-histogram en telt niet per
  activiteit; de duplicaten raakten dus de belastingscurve (sRPE), niet dit
  cijfer.
- **De TRIMP-berekening.** `computeExertionDay` blijft ongemoeid; de strain
  gebruikt hem juist.
- **Het doelbereik.** Dat hoort bij de dagbelasting en komt op het
  trainingsscherm niet voor.

## Testdekking

- `lib/__tests__/hr-series.test.ts`: bucketen op 5 bpm, tijd van niet-gemeten
  punten valt weg, een pauze telt niet als meettijd, en de aansluiting op
  `computeExertionDay`.
- `lib/__tests__/exertion.test.ts`: de strain deelt het ankerpunt met de dag en
  kan er niet bovenuit komen.
- `server/wearables/__tests__/dedupe.test.ts`: duplicaat binnen dezelfde bron
  (het geval uit de praktijk) én tussen bronnen, en handmatige logs blijven
  buiten schot.
- `server/wearables/__tests__/session-match.test.ts`: wel kracht, geen hardloop,
  geen sessie die al een meting heeft, de dichtstbijzijnde bij twee kandidaten,
  en het openstaande venster van uren dat niets naar zich toe mag trekken.

## Uitrol

1. Migratie `20260823_activity_types_and_session_match.sql` draaien. Additief,
   maar enum-waarden zijn niet terug te draaien.
2. Server deployen. Vanaf dat moment worden nieuwe syncs juist gelabeld en
   gekoppeld, en wordt tijd-in-zone afgeleid.
3. `npx tsx scripts/dedupe-cardio-logs.ts` (droogloop), dan met `--apply`.
4. App-build. De nieuwe labels, het detailscherm en het meesturen van
   `sourceActivity` zitten in de app-bundel.

Stap 2 zonder stap 4 is veilig: de server accepteert een payload zonder
`sourceActivity` gewoon.
