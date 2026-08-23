# Dagbelasting: van p90-plafond naar p90-anker

**Datum:** 2026-08-23
**Raakt:** `src/lib/exertion.ts`, `src/server/routers/wearables.ts` (commentaar), `exertion.p3` in de app-locales

## Aanleiding

De dagbelasting-kaart las 10,0 van de 10 na een gewone duurloop, op een dag met een
goed herstel. Bij navraag bleek dat geen meetfout: de Edwards-TRIMP van die dag klopte
tot op de minuut met het ruwe hartslag-histogram. Het probleem zat in de schaal.

## Wat er misging

`exertionScore` deelde de TRIMP van vandaag door de p90 van de voorgaande dagen in het
venster van 60 dagen en klemde het resultaat op 100. Daarmee wás de p90 de bovenkant van
de schaal. Drie gevolgen:

1. **Een tiende van je dagen zit per definitie op 10,0.** De p90 is niet je uitschieter,
   het is je gewone zware dag. Elke normale training raakte dus het plafond.
2. **Boven de p90 is niets meer te onderscheiden.** Een dag van 1× p90 en een van 2× p90
   lazen allebei 10,0. Juist het verschil tussen "stevig" en "veel te veel" verdween.
3. **Het doelbereik en de score meten niet hetzelfde.** Het doelbereik in
   `buildOverview` (`min = 1,5 + 0,03 × readiness`, `max = 2,5 + 0,055 × readiness`) is
   op een absolute schaal geijkt en loopt tot maximaal 8,0 bij een perfect herstel. Een
   score die op elke trainingsdag 10,0 aantikt, ligt daar altijd meer dan 1 boven, en de
   kop sloeg dan om naar "eerst herstellen". Op een echt profiel van 60 dagen gebeurde
   dat 16 van de 46 geijkte keer. Een waarschuwing die op elke trainingsdag afgaat,
   waarschuwt niet meer.

## Besluit

De p90 wordt het **anker** van de schaal in plaats van het plafond, via een verzadigende
curve:

```
score = 100 × (1 − e^(−trimp / p90))
```

De p90-keuze zelf, het venster van 60 dagen en de drempel van zeven bruikbare dagen
blijven ongewijzigd. De functie geeft nog steeds 0-100 terug, dus de clients veranderen
niet mee.

### Waarom deze curve en niet gewoon een hogere referentie

De voor de hand liggende ingreep is de referentie omhoog zetten (p98, of het maximum van
het venster). Dat schaalt de curve lineair mee en verlaagt daarmee ook de ONDERKANT met
tientallen procenten. Precies die onderkant was in juli 2026 tegen Athlytic geijkt (zie
`LIGHT_HRR_FLOOR` in `exertion.ts`) en die ijking wil je niet slopen om de bovenkant te
repareren.

De verzadigende curve valt bij kleine ratio's samen met de oude lineaire schaal en buigt
alleen daarboven af. De ijkpunten van juli blijven daardoor staan.

### Ijkpunten van de nieuwe schaal

| dag | oud | nieuw |
| --- | --- | --- |
| 8% van je p90-dag | 0,8 | 0,8 |
| halve p90-dag | 5,0 | 4,0 |
| je p90-dag | 10,0 | 6,3 |
| tweemaal je p90 | 10,0 | 8,6 |
| driemaal je p90 | 10,0 | 9,5 |

10,0 vraagt ruim vijf keer je p90. Dat is de bedoeling: 10 hoort "buiten alles wat je tot
nu toe gedaan hebt" te betekenen, niet "een gewone dinsdag". Ter externe controle: bij
Whoop is een stevige training ongeveer 14 van 21 strain, oftewel 6,7 op een tienschaal.

## Wat er expliciet NIET verandert

- **Het doelbereik.** Dat was altijd al op een absolute schaal geijkt; de score was de
  kapotte helft. Nagerekend op een profiel van 60 dagen gaat "op koers" van 4 naar 14
  dagen en zakt "eerst herstellen" van 16 naar 2, en die 2 zijn de dagen met een zware
  belasting op een slecht herstel. Precies waar die kop voor bedoeld is.
- **De TRIMP-berekening.** `computeExertionDay` blijft ongemoeid.
- **De opslag.** De score wordt bij het uitlezen berekend, niet bewaard. Er is dus geen
  migratie en de hele historie herrekent zichzelf zodra dit live staat.

## Uitrol

De formule zit server-side en wordt door zowel de web-app als de iOS-app via
`wearables.overview` opgehaald. Een web-deploy verandert het cijfer in beide direct; er
is geen app-build voor nodig.

De uitlegtekst (`exertion.p3`) zit wél in de app-bundel en beschreef de oude definitie
("een 10 staat voor een van je zwaarste dagen"). Die is aangepast in `nl.json` en
`en.json` en gaat mee met de eerstvolgende build. In de tussentijd staat er kort een
uitleg die niet meer bij het getal past; dat is bewust geaccepteerd boven het uitstellen
van de fix.

## Testdekking

`src/lib/__tests__/exertion.test.ts` is nieuw. Vastgelegd: null onder zeven bruikbare
dagen, filtering van niet-positieve referentiedagen, het ankerpunt op 63, de onderkant
die op zijn plek blijft, dat zware dagen onderling onderscheidbaar blijven, en de
grenzen 0 en 100.
