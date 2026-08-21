# Soepele start van een revalidatietraject

Ontwerpdocument, 21 augustus 2026. Web (Next.js/tRPC/Prisma); iOS blijft ongewijzigd maar mag nergens breken.

## 1. Wat we bouwen

Een therapeut die een revalidant in BASE zet, moet zonder omwegen van "patiënt bestaat nog niet" naar "traject loopt, nulmeting staat klaar" kunnen. De intake en klinische werkhypothese gebeuren in een ander programma (EPD) en blijven buiten BASE; de flow begint bij het aanmaken van de patiënt.

Vandaag liggen de stappen verspreid over vier plekken zonder rode draad: patiënt uitnodigen (patiëntenlijst), protocol activeren (patiëntpagina, `RehabActivationToggle`), testrapport aanmaken en metingen invoeren (`/therapist/test-reports`), plan op de kalender (week-planner). Bovendien bestaan er twee gescheiden meetwerelden: protocol-criteria (`RehabCriterion`, afvinken met vrije-tekstwaarde) en de test-library (`TestCatalogItem`/`TestReport`, echte links/rechts-waarden met zones). Wie een quadriceps-meting doet voert die nu twee keer in.

We bouwen twee dingen:

1. **De hybride startflow**: direct na patiënt aanmaken opent op de patiëntpagina een "Traject starten"-dialoog (protocol + datums + nulmeting klaarzetten), en een traject-checklist-kaart op de patiëntpagina toont daarna wat nog openstaat. Dezelfde dialoog is bereikbaar voor bestaande patiënten en na het afsluiten van een traject.
2. **De koppeling tussen criteria en test-library**: een meetbaar criterium wijst naar een catalogus-test. Eén meting in een testrapport werkt automatisch het criterium bij (rood/oranje/groen). Dit is tegelijk de voorbereiding op de Kinvent-koppeling die eraan komt.

## 2. Vastgestelde besluiten

Uit de vragenronde van 21 augustus:

| Besluit | Keuze |
| --- | --- |
| Kinvent | Echte data-koppeling is het einddoel, maar die is bij ons nog in de maak en niet live. Nu alleen de architectuur voorbereiden, geen zichtbare Kinvent-UI. |
| Startmoment | Los van de intake (die zit in het EPD). De flow begint bij patiënt aanmaken in BASE. |
| Inhoud van de flow | Uitnodiging app, protocol + criteria, baseline-metingen. Plan op de kalender bewust NIET in de flow. |
| Criteria ↔ test-library | Ja, hard koppelen: één meting vult rapport én criterium. |
| Vorm | Hybride: traject-dialoog direct na aanmaken + blijvende checklist-kaart. Geen wizard-tunnel. |

## 3. De flow voor de therapeut

### 3.1 Nieuwe patiënt

1. Patiënt aanmaken + uitnodigen zoals vandaag (e-mail-invite of code-invite vanaf de patiëntenlijst; placeholder-account tot acceptatie). Geen wijziging aan de invite zelf.
2. Na succesvol aanmaken navigeert de webapp door naar de patiëntpagina met een query-parameter (bv. `?traject=start`), waardoor de **Traject starten-dialoog** direct opent. De bestaande succes-dialoog met "meteen programma maken" vervalt of verhuist mee; dat is een implementatiedetail, maar de route na aanmaken is altijd: patiëntpagina.
3. De dialoog is een uitbreiding van de bestaande `RehabActivationToggle`-sheet en vraagt:
   - revalidatie-protocol (uit `rehab.listProtocols`);
   - operatiedatum en/of blessuredatum (optioneel, zoals nu);
   - vinkje **"Nulmeting klaarzetten"**, standaard aan.
4. Bevestigen doet één ding vanuit de therapeut gezien, twee dingen technisch: `rehab.activateForPatient` (bestaand) en, met het vinkje aan, het klaarzetten van het baseline-testrapport (sectie 6). De dialoog eindigt met twee uitgangen: **"Naar nulmeting"** (rapport openen en meteen invoeren) of **"Klaar"** (terug naar de patiëntpagina).
5. Overslaan kan altijd; de checklist-kaart onthoudt wat er nog mist.

### 3.2 Checklist-kaart op de patiëntpagina

Zolang de patiënt een lopend traject heeft waarvan nog iets openstaat, toont de patiëntpagina bovenaan een compacte kaart met drie regels, elk één klik naar de juiste plek:

- **Uitnodiging geaccepteerd** — de patiënt heeft het account geactiveerd (placeholder-status weg). Zolang niet: knop "Uitnodiging opnieuw versturen" (bestaande resend).
- **Traject actief** — protocol gekozen. Zolang niet: opent de traject-dialoog.
- **Nulmeting ingevuld** — er bestaat sinds `activatedAt` minstens één testrapport met minstens één ingevulde meetwaarde. Zolang niet: opent het klaargezette rapport (of maakt het alsnog aan).

Alles afgevinkt: de kaart verdwijnt. Geen lopend traject: geen kaart, wel de bestaande "traject starten"-ingang in het revalidatie-blok. Er komt geen Kinvent-regel op de kaart zolang de koppeling niet bestaat; geen "binnenkort"-knoppen.

### 3.3 Bestaande patiënt en volgende trajecten

Dezelfde dialoog opent vanaf het revalidatie-blok op de patiëntpagina (zoals de huidige toggle) en vanuit de afsluit-flow van een traject ("Nieuw traject starten"). De episode-logica (hoogstens één open traject, historie blijft leesbaar) bestaat al en verandert niet.

## 4. Datamodel: criteria leren de test-library kennen

Twee nullable kolommen op bestaande tabellen; geen nieuwe tabellen, dus geen nieuwe RLS nodig (de bestaande deny-all-policies dekken dit):

```prisma
model RehabCriterion {
  /// Optionele koppeling aan een catalogus-test. Gezet → een meting van die
  /// test in een testrapport werkt dit criterium automatisch bij. NULL →
  /// criterium blijft puur handmatig afvinkbaar (bv. "hop zonder pijn").
  catalogItemId String?
  catalogItem   TestCatalogItem? @relation(fields: [catalogItemId], references: [id], onDelete: SetNull)
}

model RehabCriterionStatus {
  /// Herkomst van een automatisch gezette status: de meting die dit criterium
  /// kleurde. NULL bij handmatig gezette statussen.
  reportEntryId String?
  reportEntry   TestReportEntry? @relation(fields: [reportEntryId], references: [id], onDelete: SetNull)
}
```

Let op de multi-tenant-asymmetrie: protocollen zijn globaal (admin-beheerd), catalogus-testen zijn praktijk-gescopet (`practiceId` NULL = globale seed). **Een criterium mag alleen naar een globale catalogus-test wijzen** (`practiceId = NULL`), anders verwijst een globaal protocol naar een test die andere praktijken niet kunnen lezen. De admin-koppel-UI en de seed filteren daarop; de server valideert het bij `adminUpdateCriterion`.

Verder:

- `rehab.adminUpdateCriterion` en `adminCreateCriterion` accepteren `catalogItemId`; het admin-protocolbeheer krijgt per criterium een test-picker (alleen globale, actieve testen).
- Een gecureerd seed-script koppelt de Melbourne VKB-criteria aan de bestaande catalogus-testen (expliciete mapping in het script, geen fuzzy matching). Criteria zonder logische tegenhanger blijven ongekoppeld.

## 5. Eén keer meten, overal bijgewerkt

Het hook-punt is `testReports.updateEntry` (daar landen ingevoerde waarden). Na het opslaan van een entry met `catalogItemId` en een bruikbare waarde:

1. Zoek het open traject van de patiënt (`findOpenTracker`).
2. Zoek in het protocol de criteria met datzelfde `catalogItemId`.
3. Bereken de status:
   - heeft het criterium eigen bilaterale drempels (`isBilateral` met `newtonMin*`/`lsiMin*`), gebruik die op de links/rechts-waarden (bestaande LSI-logica);
   - anders: de zone van de geplotte waarde via de bestaande `computePlottedValue`/`computeZone` uit `src/lib/test-report/compute.ts` (groen ≥ `zoneGreenMin`, oranje ≥ `zoneOrangeMin`, anders rood).
4. Upsert `RehabCriterionStatus` met status, geformatteerde `measurementValue`, `measurementDate = report.performedAt`, `reportEntryId` en `updatedById = therapeut`.
5. **Nieuwste meting wint, nooit andersom**: sla de upsert over als de bestaande status een recentere `measurementDate` (fallback: `updatedAt`) heeft dan `report.performedAt`. Handmatig overschrijven via de bestaande `updateCriterionStatus` blijft altijd mogelijk en wordt door een oudere meting nooit stilletjes teruggedraaid.

Entries zonder waarde (klaargezette nulmeting) doen niets. Het verwijderen van een entry of rapport laat de criterium-status staan (`SetNull` op de herkomst); de status is een klinische registratie, geen afgeleide view. Ongekoppelde criteria gedragen zich exact als vandaag.

## 6. Baseline-rapport klaarzetten

`testReports.create` krijgt een optionele input `fromTrackerId`. De server:

1. controleert dat de tracker bij de patiënt hoort en open is;
2. verzamelt de gekoppelde catalogus-testen van het protocol (uniek per `catalogItemId`, in fase/criterium-volgorde);
3. maakt het rapport met entries via het bestaande `specFromCatalog`-pad, zonder waarden;
4. vult de kop vooraf in: `measurementNumber` = aantal bestaande rapporten + 1, `trajectLabel` = protocolnaam, `rehabPhaseLabel` = indicatieve fase op basis van operatiedatum (bestaande week-berekening), `injuryGoal` uit de traject-notitie als die er is.

Een protocol zonder gekoppelde testen levert een leeg rapport op met alleen de kop; de therapeut voegt dan zelf testen of een batterij toe zoals vandaag.

## 7. Kinvent: de stekkerdoos ligt klaar

De echte koppeling is een eigen, later traject (de integratie aan Kinvent-zijde is nog niet live). Wat dit ontwerp regelt is de landingsplaats: een toekomstige import hoeft per catalogus-test alleen een meetwaarde in een testrapport-entry te schrijven, en sectie 5 laat die meting automatisch doorstromen naar criteria, tracker en voortgang. `TestCatalogItem.source` ("KINVENT K-PULL · ISOMETRISCH") bestaat al als menselijke bron-aanduiding. Er komt in deze ronde geen Kinvent-UI, geen placeholder-knop en geen schema-uitbreiding voor externe id's; dat is additief wanneer het nodig is.

## 8. Rechten, rollen en mobiel

- Traject starten, rapport klaarzetten en de doorwerking draaien op `therapistProcedure`: klinische schrijf-acties. De coach leest de checklist-kaart en de tracker zoals nu, maar start geen traject.
- Toegang tot de patiënt loopt overal via de bestaande checks (`assertTreating`/`hasPatientAccess`); de nieuwe endpoints introduceren geen nieuw toegangspatroon.
- iOS (aparte repo, builds t/m 79 in omloop, geen version-gate): alle wijzigingen zijn additief. `activateForPatient` houdt zijn drie takken en zijn coulance voor null-datums; nieuwe inputs zijn optioneel; `calendarRange` blijft onaangeroerd. De app toont automatisch bijgewerkte criterium-statussen vanzelf via de bestaande lees-endpoints.
- Geen gespiegelde bestanden (`cardio-workout.ts`, prescription-constanten) geraakt; `check:mirror` is hier niet van toepassing.

## 9. Bewust buiten scope

- **Plan op de kalender**: blijft een aparte stap na de startflow (besluit vragenronde).
- **Echte Kinvent-sync**: eigen ontwerp + traject zodra de koppeling aan Kinvent-zijde live is.
- **Testbatterijen als tijdlijn-protocol** (`durationWeeks`/`targetWeek`): blijven bestaan als los gereedschap; dit ontwerp maakt het `RehabProtocol` leidend voor trajecten en verandert niets aan batterijen.
- **iOS-UI voor de startflow**: web-therapeutportaal eerst.
- **Coach-schrijfrechten** op trajecten: ongewijzigd.

## 10. Acceptatiecriteria

1. Vanaf de patiëntenlijst: patiënt aanmaken → traject actief mét klaargezette nulmeting, zonder de patiëntpagina te verlaten (dialoog + één doorklik naar het rapport).
2. Een links/rechts-meting invoeren in het testrapport zet het gekoppelde criterium automatisch op de juiste kleur, met waarde, datum en zichtbare herkomst op de tracker.
3. Een oudere meting (rapport met eerdere `performedAt`) overschrijft nooit een recentere criterium-status; handmatig gezette statussen blijven handmatig aanpasbaar.
4. Ongekoppelde criteria en patiënten zonder traject gedragen zich exact als voorheen.
5. De checklist-kaart toont de juiste stand voor: verse patiënt (0/3), geaccepteerde uitnodiging zonder metingen (2/3), en verdwijnt bij 3/3 of zonder lopend traject.
6. Dezelfde startdialoog werkt voor een bestaande patiënt en na het afsluiten van een traject.
7. Bestaande iOS-builds blijven foutloos werken tegen de nieuwe server (geen gewijzigde input-contracten).
