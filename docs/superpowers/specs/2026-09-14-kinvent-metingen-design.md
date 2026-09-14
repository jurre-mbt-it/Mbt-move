# Kinvent-metingen inzichtelijk (ontwerp, 2026-09-14)

Goedgekeurd door Jurre in het gesprek van 14 september, avond. Links-rechts als
**verschil in procent met richting** ("rechts 8% lager"), niet als LSI.

## Wat

Een pagina per patiënt, `/therapist/patients/[id]/kinvent`, vanaf de
Kinvent-kaart op tab Tests. De kaart zelf toont nog de laatste vijf metingen en
een knop "Alle metingen".

1. **Grafiek over de tijd.** Keuze van meting (CMJ tweebenig, CMJ eenbenig,
   squat jump, drop jump, of een krachttest op titel) en maat (hoogte,
   piekkracht links/rechts, verschil %, RSI). Elke meting één punt.
2. **Lijst met hoofdpunten.** Datum, test, hoogte of piek L/R, verschil %,
   RSI. Uitklappen toont per sprong of herhaling alles wat bewaard is.
3. **Later de app:** zelfde gegevens via een leesroute voor de atleet
   (`kinvent.myMeasurements`), één scherm voor iPhone, iPad en Android;
   vraagt een EAS-build.

## Data

- `kinvent_jump_reps` krijgt `rfdTotal`, `rfdLeft`, `rfdRight` (N/s, uit
  `totalRfd`/`leftRfd`/`rightRfd`). Het asymmetriepercentage rekenen we zelf
  uit piek L/R, zodat de richting eenduidig is.
- Nieuw: `kinvent_strength_results` (per activity: patiënt, protocol/activity,
  datum, exerciseType, titel, apparaat, piek L/R/enkel in kg) en
  `kinvent_strength_reps` (per herhaling: zijde, piek, gemiddelde, RFD tot
  piek, gemiddelde RFD, tijd tot piek, impuls). Beide RLS default_deny.
- `commitImport` schrijft de krachtdetails altijd (upsert op activityCode), ook
  als de rapportregel al bestond. Zo is een bestaande import aan te vullen door
  de metingen nog een keer op te halen; het rapport blijft ongemoeid.
- Pure rekenlaag in `src/lib/kinvent/measurements.ts`: `asymmetryPct`,
  `formatAsymmetry`, `trendSeries`. Getest zonder database.

## Buiten scope nu

H:Q-ratio uit twee metingen; app-scherm (na build); export naar PDF.
