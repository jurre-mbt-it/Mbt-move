# EMG-onderbouwing spierbelasting per oefening

**Datum:** 2026-07-21
**Status:** onderzoek afgerond, waarden nog NIET doorgevoerd in de app
**Doel:** de `muscleLoads` per oefening (1-5 per regio) onderbouwen met peer-reviewed EMG-studies, en zichtbaar maken welke oefeningen géén onderbouwing hebben.

---

## 0. Belangrijkste bevinding: lees dit eerst

Het onderzoek leverde één conclusie op die zwaarder weegt dan alle losse cijfers:

> **%MVIC-waarden uit verschillende studies zijn niet onderling vergelijkbaar.**

Uit een systematische review van 19 deadlift-EMG-studies (Martin-Fuentes 2020, PLoS ONE):
slechts 8 van de 19 volgden de SENIAM-richtlijn voor elektrodeplaatsing, er werden
**vier onverenigbare normalisatiemethodes** gebruikt (%MVIC in maar 7 van de 19, de rest
%peak-RMS, absolute microvolts of %1RM), en de belasting varieerde van gematchte %1RM tot
vooraf bepaalde RM-belastingen.

**Gevolg voor ons:** de vaste conversie die nu bovenaan `seed-exercises.ts` staat
(0-20% = 1, 21-40% = 2, enzovoort) toegepast op cijfers uit verschillende studies levert
systematisch inconsistente tags op. Twee oefeningen kunnen dezelfde score krijgen terwijl
de onderliggende metingen niet vergelijkbaar waren.

Dat betekent niet dat de huidige waarden waardeloos zijn. Het betekent dat ze het beste te
lezen zijn als **klinische inschatting met EMG als richtsnoer**, niet als meetwaarde. Voor
ons doel (relatieve belasting per regio voor herstel-inschatting) is dat prima, zolang we
niet doen alsof het precisie-data is.

**Advies:** behandel de EMG-cijfers hieronder als houvast bij twijfel, en laat jouw
klinische oordeel leidend zijn. Vertrouw geen enkele losse %MVIC-waarde op de komma.

---

## 1. Wat wél hard onderbouwd is

Acht claims overleefden adversariële verificatie (elke claim door drie onafhankelijke
verificateurs op weerlegging getoetst). Alleen deze staan hier.

### 1.1 Hip thrust versus back squat — glutes

| | bovenste gluteus max | onderste gluteus max |
|---|---|---|
| Barbell hip thrust | 69,5 %MVIC | 86,8 %MVIC |
| Back squat | 29,4 %MVIC | 45,3 %MVIC |

n=13 getrainde vrouwen, ~10RM, alle gemiddelden P=.004.
**Bron:** Contreras B, Vigotsky AD, Schoenfeld BJ, Beardsley C, Cronin J. *A Comparison of
Gluteus Maximus, Biceps Femoris, and Vastus Lateralis EMG Activity in the Back Squat and
Barbell Hip Thrust Exercises.* J Appl Biomech. 2015;31(6):452-458. PMID 26214739.

**Aanbevolen tags:** hip thrust Glutes **4-5** · back squat Glutes **3** (bandbreedte 2-4).

Drie kanttekeningen die de verificateurs meegaven:
- De hoofdauteur is patenthouder van The Hip Thruster (belangenverstrengeling, gemeld in het artikel).
- Piekwaarden overschrijden 100 %MVIC (vastus lateralis 244%), een bekend validiteitsprobleem.
- Andere studies geven back-squat glutes juist ~55% gemiddeld en ~80% piek. Daarom een
  bandbreedte in plaats van het letterlijke cijfer uit deze ene studie.
- **Let op:** hogere EMG betekent niet automatisch meer spiergroei. Plotkin 2023 vond
  vergelijkbare glute-groei bij hip thrust én squat. Relevant als iemand de tag leest als "groeiprikkel".

### 1.2 Squat versus leg press versus leg extension — hamstrings

De squat geeft ongeveer 1,6 tot 2x zoveel hamstring-activiteit als leg press en knee
extension, maar vanaf een lage basis (~27-41 %MVIC).
**Bron:** Escamilla RF et al. *Biomechanics of the knee during closed kinetic chain and open
kinetic chain exercises.* Med Sci Sports Exerc. 1998;30(4):556-569. PMID 9565938.
Richting bevestigd in Escamilla 2001 (PMID 11528346) en Ebben 2009.

**Aanbevolen tags:** back squat Hamstrings **2** · leg press Hamstrings **1-2** ·
leg extension Hamstrings **1** (antagonist-niveau).

### 1.3 Quadriceps is hoek- en ketenafhankelijk

Quadriceps-activatie laat zich niet vangen in één getal per oefening. Gesloten keten
(squat, leg press) piekt rond de diepste geteste knieflexie (~90°), open keten (leg
extension) piekt juist bij bijna volledige extensie.
**Bron:** Escamilla 1998; Martin-Fuentes/Oliva-Lozano/Muyor; Balshaw & Hunter (hoek-specifieke normalisatie).

**Aanbevolen tag:** squat, leg press én leg extension allemaal Quadriceps **4-5**, met de
notitie dat de score ROM-afhankelijk is.

Binnen de regio verschilt de spiermix wel: leg extension belast relatief meer de rectus
femoris (93,8 versus 69,5 %MVIC ten opzichte van leg press, p=0.002), gesloten keten meer
de vasti (VL 105,5 versus 87,9 %MVIC, p=0.003). Dat verandert de regio-score niet, maar is
relevant voor revalidatie-copy of een eventuele sub-tag.

### 1.4 Onderrug bij trekoefeningen

| oefening | lumbale erector spinae | tag |
|---|---|---|
| Bent-over row | 66 ± 20,0 %MVC (significant hoger dan alle andere) | Onderrug **4** |
| Pull-up | 46 | **3** |
| Prone I-Y-T raises | 47 | **3** |
| Seated row | 44 | **3** |
| Inverted row | 44 | **3** |
| Chin-up | 42 | **3** |
| TRX row | 30 ± 18,2 | **2** |
| Lat pulldown | 20 ± 16,5 | **1-2** |

**Bron:** Edelburg HR. *Electromyographic analysis of the back muscles during various back
exercises.* MS thesis, University of Wisconsin. Mechanistisch ondersteund door Fenwick,
Brown & McGill, J Strength Cond Res. 2009.
**Betrouwbaarheid: medium** (2-1 stemmen; scriptie, geen peer-reviewed tijdschrift).

### 1.5 Rotator cuff — side-lying external rotation

Side-lying externe rotatie bij 0° abductie geeft de hoogste infraspinatus (62 %MVIC) en
teres minor (67 %MVIC) van zeven veelgebruikte schouderoefeningen.
**Bron:** Reinold MM, Wilk KE, Fleisig GS et al. J Orthop Sports Phys Ther. 2004;34(7):385-394.

**Aanbevolen tag:** Schouders **4** — maar let op: dit reflecteert **alleen de cuff**, de
deltoid-activiteit is juist laag. Onze regio Schouders bundelt deltoids én cuff, dus de
score dekt hier iets anders dan bij bijvoorbeeld een overhead press.

### 1.6 Kuiten bij deadlift

Mediale gastrocnemius is significant hoger bij conventioneel dan bij sumo, maar beide
absoluut laag (~26 versus ~19 %MVIC).
**Bron:** Escamilla RF, Francisco AC, Kayes AV, Speer KP, Moorman CT. *An electromyographic
analysis of sumo and conventional style deadlifts.* Med Sci Sports Exerc. 2002.

**Aanbevolen tags:** conventional deadlift Onderbeen **2** · sumo deadlift Onderbeen **1**.
Geen van beide is een serieuze kuit-oefening.

---

## 2. Waar de app nu afwijkt van het bewijs

Concreet te overwegen aanpassingen. Links de huidige waarde in de app, rechts wat het
onderzoek suggereert.

| oefening | regio | nu | voorstel | opmerking |
|---|---|---|---|---|
| Back Squat | Glutes | 4 | **3** (2-4) | huidige waarde aan de hoge kant |
| Back Squat | Hamstrings | 3 | **2** | squat is geen hamstring-oefening |
| Barbell Hip Thrust | Hamstrings | 4 | **2-3** | Contreras mat 40,8 %MVIC biceps femoris = band 2-3 |
| Leg Press | Hamstrings | 2 | **1-2** | grensgeval, mag blijven |
| Conventional Deadlift | Onderbeen | ontbreekt | **2** | toevoegen |
| Sumo Deadlift | Onderbeen | ontbreekt | **1** | toevoegen |
| Lat Pulldown | Onderrug | ontbreekt | **1-2** | toevoegen |
| Cable Row (zittend) | Onderrug | ontbreekt | **3** | toevoegen |
| Chin-Up | Onderrug | ontbreekt | **3** | toevoegen |
| Pull-Up | Onderrug | ontbreekt | **3** | toevoegen |
| Inverted Row | Onderrug | ontbreekt | **3** | toevoegen |
| Barbell Row | Onderrug | 4 | **4** | klopt al |
| Leg Extension (machine) | Hamstrings | ontbreekt | **1** | optioneel, antagonist-niveau |
| Sidelying External Rotation | Schouders | 4 | **4** | klopt al |
| Back Squat / Leg Press / Leg Extension | Quadriceps | 5 / 4 / 5 | **4-5** | binnen bandbreedte, laten staan |

De meeste bestaande waarden blijken dus redelijk te kloppen. De grootste systematische
afwijking: **onderrug-belasting bij trekoefeningen ontbreekt bijna overal**, terwijl die
meetbaar aanwezig is. Dat is relevant voor onze herstel-berekening, want de onderrug
stapelt nu onzichtbaar.

---

## 3. Oefeningen zonder EMG-onderbouwing — jouw lijst

Van de 264 oefeningen in de app is er voor **ongeveer 15 een geverifieerde EMG-bron**. De
rest heeft geen bewijs dat de adversariële toets doorstond. Dat is geen fout in de app,
maar een grens van de literatuur: veel revalidatie- en isolatie-oefeningen zijn simpelweg
nooit met EMG onderzocht, of alleen in kleine ongepubliceerde studies.

Deze families hebben **geen enkele geverifieerde onderbouwing** en leunen volledig op
klinische inschatting. Hier is jouw expertise leidend:

**Onderste extremiteit**
- Alle kuitoefeningen (staande/zittende calf raise, single leg) — inclusief het onderscheid gastrocnemius versus soleus
- Alle lunge- en step-up-varianten (walking, reverse, lateral, Bulgarian split squat, Cossack, skater)
- Nordic hamstring curl, glute-ham raise, leg curl (liggend/zittend)
- Hamstring-specifiek werk in het algemeen
- Hip hinge behalve deadlift: good morning, kettlebell swing, 45° back extension, RDL
- Glute-isolatie: clamshell, side-lying abduction, cable abduction, pull-through, frog pump, monster/sumo walks
- Hack squat, sissy squat, wall sit, belt squat, Zercher, box/pause/tempo squat

**Bovenlichaam**
- Alle horizontale druk: bench press, incline, push-up varianten, dips, fly
- Alle verticale druk: overhead press, dumbbell press, lateral raise, Arnold press, landmine, Z-press
- Armen: biceps curl, triceps pushdown, overhead extension
- Rotator cuff en scapula behalve side-lying ER: scaption/empty can, prone Y/T/W, face pull, PNF-patronen, wall slides

**Romp en overig**
- Alle core-oefeningen: plank, side plank, dead bug, Pallof press, ab-wheel, hanging leg raise, cable crunch
- Nek (flexie/extensie isometrie) — nauwelijks bruikbare EMG gevonden
- Voeten en intrinsieke voetspieren — geen bruikbare EMG gevonden
- Alle mobiliteitsoefeningen (die hebben terecht geen spierbelasting)

### Wat ik voorstel voor deze lijst
Niets aanpassen tenzij je iets tegenkomt dat niet klopt. De huidige waarden komen uit de
eerdere EMG-ronde en zijn een redelijke inschatting. Waar jij bij het werken met patiënten
merkt dat een oefening zwaarder of lichter aanvoelt dan de app suggereert, pas je 'm aan —
dat is betrouwbaarder dan een %MVIC uit een studie met dertien deelnemers.

---

## 4. Vervolgstappen

1. **Besluiten** welke van de aanpassingen in §2 je wilt doorvoeren. Mijn advies: doe in
   elk geval de ontbrekende onderrug-tags bij trekoefeningen, en de squat-hamstrings van 3
   naar 2. De rest is optioneel.
2. Doorvoeren gebeurt in `prisma/seed-exercises.ts` plus een klein update-script voor de
   bestaande rijen in productie (net als de regio-backfill).
3. De `muscle-loads-audit.json` uit de regio-migratie blijft je tweede review-lijst:
   daar staan de 371 oefeningen waar de handmatig ingestelde waarde afwijkt van de
   automatische schatting.

## Bronnen

- Contreras B et al. J Appl Biomech. 2015;31(6):452-458. PMID 26214739
- Escamilla RF et al. Med Sci Sports Exerc. 1998;30(4):556-569. PMID 9565938
- Escamilla RF et al. Med Sci Sports Exerc. 2001;33(9):1552-1566. PMID 11528346
- Escamilla RF et al. Med Sci Sports Exerc. 2002 (sumo versus conventional deadlift)
- Reinold MM et al. J Orthop Sports Phys Ther. 2004;34(7):385-394
- Martin-Fuentes I, Oliva-Lozano JM, Muyor JM. PLoS ONE. 2020;15(2):e0229507
- Ebben WP. Int J Sports Physiol Perform. 2009;4(1):84-96
- Fenwick CMJ, Brown SHM, McGill SM. J Strength Cond Res. 2009
- Edelburg HR. MS thesis, University of Wisconsin (medium betrouwbaarheid)
- Neto WK et al. systematic review, gluteus maximus activation
- Plotkin D et al. Frontiers in Physiology. 2023 (hypertrofie-uitkomst, geen EMG)
