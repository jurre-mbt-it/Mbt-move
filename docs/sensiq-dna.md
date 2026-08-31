# DNA van sensiq.co

Gemeten 21-08-2026 op 1440x900 (desktop) en 392px (mobiel), via computed styles in
de browser. Dit is meetwerk, geen indruk: alle waarden hieronder komen uit de
gerenderde pagina zelf.

Reden voor dit document: Jurre wees sensiq.co aan als voorbeeld voor de publieke
BASE-pagina. De eerste keer namen we het skelet over en plakten er de MBT-huid op.
Dat werd afgekeurd als "te veel AI". Dit document legt vast wat die site werkelijk
doet, zodat de volgende poging op mechaniek stuurt in plaats van op gevoel.

---

## 1. De correctie op mijn eerdere lezing

Ik meldde eerder "5.200 pixels in zes secties". Dat was de **mobiele** opmaak.

| | sensiq (desktop) | onze pagina (voor) | onze pagina (nu) |
|---|---|---|---|
| hoogte | 12.035 px | 11.567 px | 7.309 px |
| secties | 8 | 12 | 6 |

Sensiq is dus **niet korter dan wat wij hadden**. Lengte was nooit het probleem.
Het verschil zit in wat die lengte doet.

## 2. Het echte mechanisme: plaklagen

Vier elementen staan op `position: sticky`, elk **868 px hoog** (de vensterhoogte),
met `top: 15.84px`. Ze zitten in ouders van **2520**, **1800** en **2700** px.

Dat betekent: één beeld blijft staan terwijl je er twee tot drie schermen aan
scrollt, en verandert onderweg. Ongeveer **7.000 van de 12.000 pixels** is
plakscene, verdeeld over drie secties.

Daar komt het verschil vandaan. Sensiq heeft weinig momenten met veel verblijfstijd;
wij hadden twaalf momenten met korte verblijfstijd. Niet minder lengte, maar minder
onderwerpen die elk langer duren.

**Gevolg voor ons:** de scroll-scene die we net verwijderd hebben was op zichzelf
niet fout. Fout was dat 3.400 px eraan opging voor het atletenaccount, dat we zelf
een uitbreiding noemen. Diezelfde mechaniek onder het therapeutendashboard zou wel
kloppen.

## 3. Typografie

| rol | familie | maat | gewicht | tracking | regelhoogte |
|---|---|---|---|---|---|
| H1 | Clash Grotesk | 64,8 px | 500 | -0,02em | 0,92 |
| H2 | Clash Grotesk | 72 px (piek 88) | 500 | -0,02em | 0,90 |
| H3 | Clash Grotesk | 22 px | 500 | -0,01em | 1,30 |
| lopende tekst | Inter Display | 20 px | 500 | -0,016em | 1,30 |
| labels | Overused Grotesk | 13 px | 600 | +0,08em, hoofdletters | 1,20 |

Drie dingen die opvallen:

**Er is bijna geen gewichtsverloop.** 959 elementen op 500, 53 op 600, 8 op 400. Geen
700, geen 900. Contrast komt volledig uit **maat**, niet uit vet. Dat is de grootste
enkele reden dat die pagina rustig oogt bij grote koppen.

**Regelhoogte onder 1,0 op koppen.** 72 px tekst op 64,8 px regelhoogte. Regels
raken elkaar bijna. Bij ons staat de kop op 0,94, dus dat komt overeen.

**De tekstkolom is smal.** Gemeten breedtes van lopende alinea's: 299, 296, 320 px.
Dat is 30 tot 35 tekens per regel, veel smaller dan de 65 tot 75 die je normaal
aanhoudt. Kan alleen omdat die alinea's in een plakscene naast een beeld staan en
kort zijn.

**Zij gebruiken wél kleine hoofdletterlabels boven secties** (Overused Grotesk 13 px,
+0,08em, in bruin). Onze monolabels zijn dus niet het probleem; het probleem was dat
er twaalf van waren in hetzelfde stramien.

## 4. Kleur

| rol | waarde |
|---|---|
| grond | `#E7E6E4` warm grijs |
| tweede grond | `#E7E1D8` |
| derde grond (slot) | `#6B665B` grijsbruin |
| inkt | `#0F0F16` bijna zwart, blauwe zweem |
| lichte inkt | `#FBFAE8` bleek geel-crème |
| labelkleur | `#584A3B` bruin |
| gedempt | `#837E73` en `#BAB9B5` |
| accent | `#EBE234` zuurgeel |

De strategie is **ingehouden met één schreeuw**: het zuurgeel komt vijf keer voor op
de hele pagina. De grond is geen wit en geen crème maar een warm grijs met bijna geen
verzadiging. Labels staan niet in een transparantie van de inkt maar in een **eigen
bruine kleur**, en randen ook (`#CBC6C0`), niet in `rgba(ink, 0.2)`.

Dat laatste is een echt verschil met ons: onze haarlijnen zijn transparanties van de
inkt. Bij sensiq zijn het eigen kleuren, en dat leest warmer.

## 5. Vorm

- **Rondingen: 8 px en 16 px**, plus pillen op 999px. Sensiq is niet vierkant.
- Randen: 1 px in `#CBC6C0`.
- Schaduwen: zacht, groot en met negatieve spreiding, bijvoorbeeld
  `0 24px 60px -20px rgba(15,15,22,0.25)`.
- Containers: 1440 en 1408 px vol, tekstkolommen op 720 en 640 px.
- Sectiepadding: 88 px, 64 px, of nul waar een plakscene het zelf regelt.

Hier staan we lijnrecht tegenover elkaar: **MBT is vierkant en zonder schaduw, sensiq
is rond en met schaduw.** Dat is geen detail dat je stilletjes overneemt; dat is een
merkbesluit. Wij houden vierkant.

## 6. Beweging

- Versoepeling: `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo) en
  `cubic-bezier(0.32, 0.72, 0, 1)` (de Apple-curve).
- Duur: 0,2 s voor kleur, 0,24 s voor tekstkleur, 0,4 s voor doorzichtigheid,
  0,45 s voor verplaatsing.
- 90 elementen staan onder een `transform`. Dit is een pagina die vrijwel volledig op
  scroll-gestuurde transformaties draait.

Onze `--e-out` was al exact dezelfde out-expo. Die stond alleen kapot
(`--e-out: var(--e-out)`, zelfverwijzend) en is nu gerepareerd.

## 7. Techniek

Astro, geen Framer of Webflow, geen Next. Twaalf afbeeldingen plus één canvas of
video. Elke inhoudelijke sectie heeft beeld; alleen het slot en de voettekst niet.

## 8. Wat wij hiervan overnemen, en wat niet

**Overnemen:**

1. **Weinig onderwerpen, lange verblijfstijd.** Eén plakscene onder het
   therapeutendashboard, niet onder het atletenaccount.
2. **Contrast uit maat, niet uit gewicht.** Eén gewicht aanhouden en koppen groter
   zetten in plaats van zwaarder.
3. **Regelhoogte onder 1,0 op de grote koppen.** Doen we al.
4. **Labels en randen een eigen kleur geven** in plaats van een transparantie van de
   inkt.
5. **Elke inhoudelijke sectie heeft beeld.** Bij ons betekent dat: echte schermen.

**Niet overnemen:**

1. **De rondingen en de schaduwen.** MBT is vierkant en werkt met haarlijnen. Dat is
   het merk, niet een gebrek.
2. **De warme grijze grond.** Wij gaan juist naar de donkere grond van de app, zodat
   een schermopname zonder naad in de pagina valt. Dat besluit staat.
3. **Het zuurgeel.** Wij hebben oranje als actiekleur en mint als metingkleur.

Zie `../src/components/base-site/` voor de implementatie en het ontwerpsysteem van de
praktijksite (`Website/mbt-forest/docs/design-systeem.md`) voor de vormregels.

---

# Herlezing onder Impeccable 4.1.1

De eerste lezing hierboven gebruikte versie 3.9.1. Die splitste werk in "brand" en
"product". 4.1.1 gooit dat om naar vier bezoekersmodi, en scherpt twee dingen aan die
hier direct van toepassing zijn.

## De modus is Persuade

De vraag is niet meer "is dit marketing of product", maar **wat succes voor de bezoeker
betekent op dit scherm**. Bij Persuade: de bezoeker besluit en handelt. Drie eisen die
de nieuwe versie er hard aan hangt:

1. Het openingsbeeld maakt het aanbod begrijpelijk en aantrekkelijk.
2. Er is een zichtbare primaire actie.
3. De pagina toont iets dat **alleen dit product kan bewijzen**.

Punt drie is waar onze oude pagina zakte. Nagetekende panelen bewijzen niets: die kan
iedereen tekenen. Een echt scherm uit BASE is het enige bewijsmateriaal dat niemand
anders heeft. Dat is dezelfde conclusie als hierboven, maar nu als eis in plaats van
als smaak.

Sensiq doet dit met de ring: elke plakscene is een demonstratie van het product zelf.

## De verzadigde-looks-lijst noemt onze pagina bij naam

4.1.1 somt drie clusters op waar AI-ontwerp in blijft hangen. De derde luidt letterlijk:
haarlijnen in krantenstijl, een cursieve display-schreef, en kleine gespatieerde
monolabels.

Dat is precies het recept van onze oude pagina: haarlijnen op 20 en 38 procent, Fraunces
cursief voor nadruk, JetBrains Mono in hoofdletters boven elke sectie. Jurres oordeel
"te veel AI" was dus geen gevoel; het is een benoemd patroon.

Belangrijk is wat je daaruit **niet** moet concluderen. Twee van de drie ingrediënten
zijn merkbesluiten van MBT, vastgelegd in `design-systeem.md`: haarlijnen dragen het
ontwerp, en monolabels zijn nodig omdat het scramble-effect een monospace vereist.
Identiteit wint van een lijst met verzadigde patronen. Die blijven dus.

Het derde ingrediënt is dat niet. **Fraunces staat nergens in het MBT-ontwerpsysteem.**
De typografietabel daar noemt Big Shoulders, Inter Tight en JetBrains Mono. Fraunces is
alleen op deze pagina ingevoerd, als `--serif` voor cursieve nadruk. Het is dus geen
merkbesluit maar een reflex, en 4.1.1 zet Fraunces met naam op de lijst van gezichten
die betekenen dat je bent gestopt met zoeken.

**Conclusie: de cursieve schreef gaat eruit, de haarlijnen en de monolabels blijven.**
Nadruk in de lopende tekst lost je op met gewicht of met de metingkleur, niet met een
tweede lettergezicht. Dat is één ingreep die het hele recept breekt.

## Kleur verplicht zich op paginaschaal

Nieuwe formulering in 4.1.1: kleur committeert zich op paginaschaal, in vlakken die hele
gebieden bezitten, niet als accenten verspreid over een neutrale grond. Persuade heeft
toestemming voor de stevigere strategieën.

Sensiq doet precies dat, en dat had ik hierboven te zwak opgeschreven: het zijn niet
"drie gronden", het zijn **drie vlakken die elk een heel gebied bezitten**, met een
grijsbruin slotvlak van 900 px hoog dat de pagina afsluit. Het zuurgeel is daarnaast een
accent van vijf voorkomens.

Onze pagina is nu ingehouden: één donkere grond, met `secBand` twee tinten ernaast. Dat
is toegestaan, maar het laat iets liggen. De goedkoopste winst: **het slot een eigen
vlak geven** in plaats van een tint verschil.

## Twee kleinere dingen

**Ondergrens voor functionele tekst is nu 11 px.** Onze monolabels staan op 0,7rem, dus
11,2 px. Net erboven, maar de knoplabels op 0,72rem en de bijschriften moeten daar niet
onder zakken. In de app zitten labels van 10 px; die vallen er wél door.

**Waarheid bindt claims, geen demonstraties.** 4.1.1 zegt het expliciet: je mag
illustratiemateriaal op volle kwaliteit maken, mits je het als verzonnen labelt waar een
bezoeker het voor echt zou kunnen aanzien. Wat je nooit verzint zijn prijzen, klanten,
benchmarks en mogelijkheden die het product niet heeft. Onze aanpak klopt daarmee: echte
schermen met verzonnen namen, plus het label "voorbeeldwaarden uit een fictief traject".

## Wat dit toevoegt aan de lijst hierboven

Bij "overnemen" komt erbij:

6. **Het slot een eigen kleurvlak geven**, zoals hun grijsbruine afsluiting.

Bij "niet overnemen" verandert niets.

Nieuw, en los van sensiq:

7. **Fraunces eruit.** Geen tweede lettergezicht voor nadruk.
