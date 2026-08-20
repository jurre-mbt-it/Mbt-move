# Ontwerpsysteem BASE-app

Vastgelegd 2026-08-20. Lees dit vóór je iets aan de vormgeving van de app verandert.
Voor tekst geldt `docs/tone-of-voice.md`. Voor de publieke site en de praktijksite
geldt `Website/mbt-forest/docs/design-systeem.md`; dit document is er bewust
anders dan dat.

Identieke kopie hoort in `mbt-gym-mobile/docs/app-ontwerpsysteem.md`. Wijzig je er
één, wijzig ze allebei.

---

## 1. Waarom dit bestaat

De app en de website deelden letterlijk dezelfde ondergrond `#0E2729` en dezelfde
mono hoofdletter-labels. Daardoor leek de app een uitsnede van de site in plaats
van een eigen product. Het palet mag hetzelfde blijven, dat is de familie. De
ondergrond, het kader en de labeltaal niet.

Wat in beide werelden gelijk blijft en waar je dus vanaf blijft:

- de kleurwaarden zelf (petrol, crème, oranje, mint, de dataramp);
- de betekenisregel: **oranje is actie, mint is meting**;
- het woordmerk BASE.

---

## 2. De regel: twee uitvoeringen

De app kent twee uitvoeringen. Welke je gebruikt hangt af van wat de gebruiker op
dat scherm doet, niet van wie hij is.

### Instrument, waar je scant en handelt

Kaarten met diepte scheiden de rijen zodat je oog per blok kan stoppen.

- therapeutendashboard;
- weekplanner en agenda;
- gezondheid, belasting en andere overzichten;
- lijsten: patiënten, oefeningen, programma's.

### Zonder kader, waar je leest of één ding doet

Geen kaarten. Haarlijnen en witruimte dragen de structuur, en de cijfers worden
het beeld.

- testrapport en voortgang;
- sessie-runner, één oefening tegelijk;
- samenvattingen en PDF-weergaven;
- uitleg, instellingen, juridische pagina's.

**Twijfel je?** Vraag of iemand het scherm *scant* of *leest*. Scannen vraagt om
blokken, lezen vraagt om lijnen. Een dashboard mag dichter zijn dan een
voortgangspagina; dat is geen inconsistentie maar het systeem.

Waarom niet overal zonder kader: op het dashboard lopen drie urgentierijen zonder
kader visueel in elkaar over, en dan is de urgentie alleen nog een gekleurd woord.
Op een scherm dat je 's ochtends in tien seconden scant is dat een verslechtering.

---

## 3. Vlakken

| rol | waarde | opmerking |
|---|---|---|
| grond, Instrument | `#0A1C1D` | dieper dan de site, zelfde tint |
| kaart, verloop boven | `#163539` | |
| kaart, verloop onder | `#0F2628` | |
| bovenrand kaart | wit 6% | hierdoor ligt de kaart er echt bovenop |
| kaartschaduw | `0 8px 20px rgba(0,0,0,0.34)` | |
| grond, Zonder kader | `#0C2224` | |
| haarlijn, Zonder kader | mint 16% | de lijn draagt hier het ontwerp |

De site gebruikt haarlijnen om structuur te maken, de app gebruikt vlakken en
schaduw. Dat is het verschil, en het is opzet.

**Alleen dieper, niet koeler.** Een eerste poging zette de grond op `#071518`,
dieper én blauwer dan het origineel. Dat zag er te koud uit. De tint volgt nu
dezelfde groen-teal verhouding als `#0E2729`; het onderscheid komt puur uit de
diepte.

**Afronding blijft staan**, 10 tot 14 pixels. De site is overal hard afgesneden,
dus die ronding werkt in je voordeel. Zet hem niet op 0 "voor de consistentie".

---

## 4. Labels en cijfers

**Labels in gewone schrijfwijze**, in Archivo. Geen mono hoofdletters meer: dat is
het handelsmerk van de site, met dat omspringende scramble-effect erbij.

**Mono blijft voor wat het hoort te zijn**: getallen, eenheden en tijden. Martian
op het web, JetBrains Mono in de mobiele app.

In Zonder kader worden de cijfers juist **Archivo 600** op groot formaat, niet
mono. Ze zijn daar het beeld, niet de meting in een tabel.

Omvang van deze wijziging: 228 plekken met `uppercase` in de web-app en 54
mono-plekken in de mobiele app. Mechanisch werk dat geen logica raakt.

**Wat er in code met hoofdletters gebeurde.** Los van de CSS stond er op 285
plekken een `.toUpperCase()`. Die zijn in augustus 2026 als volgt afgehandeld:

| groep | aantal | besluit |
|---|---:|---|
| labels van tegels en velden | 76 | weg |
| namen van mensen, programma's, protocollen | 81 | weg |
| datums uit `toLocaleDateString` | 7 | weg |
| dagafkortingen (MA, DI, WO) | 8 | **blijven**, conventie boven een weekkolom |
| initialen in een avatar | 5 | **blijven**, een initiaal ís een hoofdletter |
| functioneel (bevestigingsveld, hexcode-vergelijking) | 8 | **blijven**, geen weergave |
| hele zinnen in kapitalen | 100 | **blijven voorlopig**, bewuste keuze |

Die laatste groep is bewust niet aangeraakt. Het gaat om zinnen als
`{n} SETS · DOEL {reps}` en `GEACCEPTEERD OP {datum}`, waar de kapitalen in de
brontekst staan. Dat vraagt herschrijven per geval en niet één aanroep weghalen:
haal je alleen de aanroep weg, dan krijg je `Knie 3B · DOOR Jurre Kok`, en dat
leest slechter dan het origineel. Pak je dit ooit op, doe het dan per scherm.

**Let op de prijs.** Labels in gewone schrijfwijze zijn groter dan mono kapitalen
van 8,5 pixel. Hetzelfde scherm wordt daardoor ongeveer elf procent hoger. Zet het
label op 11,5 pixel en breng de kaartpadding een tandje terug als dat knelt.

---

## 5. Datakleuren

De dataramp van acht tinten is het gezicht van de app, en de site heeft die niet.
Zet hem dus consequent in.

Twee correcties ten opzichte van nu:

- **slaap naar staalblauw `#7FB0D8`**, niet nog een keer cyaan naast mint;
- **beweging naar het merkgoud `#F5B942`**, in plaats van het losse `#f2b33d` dat
  alleen in `charts-v2` bestond.

Gaat de app ooit naar een lichte ondergrond, dan heb je een **tweede set
datakleuren** nodig: mint en goud zijn op licht niet leesbaar. Dat is de reden dat
de lichte richting ("Dossier") niet gekozen is.

---

## 6. Beweging

`--e-out: cubic-bezier(.16,1,.3,1)`, dezelfde curve als de praktijksite. Dat mag
hetzelfde zijn: beweging is geen merkkenmerk waar iemand twee producten aan
herkent.

Wat de app **niet** overneemt van de site: het scramble-effect op labels. Dat hoort
bij de etalage, niet bij gereedschap dat je dertig keer per dag opent.

---

## 7. Waar het in de code zit

    src/app/globals.css                 tokens web (--p-bg en verder)
    mbt-gym-mobile/constants/theme.ts   tokens mobiel (P, Radius, Font)
    mbt-gym-mobile/components/charts-v2.tsx   CV-palet voor grafieken

De shadcn-tokens in `globals.css` hangen aan `.athletic-dark` en volgen de
vlakken hierboven. Verander je een vlak, loop dan die blok ook langs.
