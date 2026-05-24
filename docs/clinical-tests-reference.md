# Clinical Tests Reference (MBT)

Bron-data voor de MBT-app `ClinicalTest` library. Alle PubMed-PMIDs zijn live-geverifieerd via PubMed MCP (sessie 2026-05-24).

**Scope:** alleen fysieke testen die de therapeut mét de patiënt uitvoert. PROMs/vragenlijsten (ODI, KOOS, IKDC, HAGOS, VISA, NDI, BCTQ, ASES, DASH, etc.) zijn bewust **niet** opgenomen — die worden buiten de app afgehandeld.

**Constructs (voorgesteld als enum `TestConstruct`):**
`STRENGTH`, `ROM`, `POWER`, `BALANCE`, `ENDURANCE`, `PROVOCATION`, `NEURODYNAMIC`, `MOVEMENT_QUALITY`, `SENSORIMOTOR`, `FUNCTIONAL`, `SPORT_SPECIFIC`, `SENSIBILITY`, `RESPIRATORY`, `EFFUSION`, `DECISION_RULE`

**Body regions (Prisma enum `BodyRegion`):** KNEE, SHOULDER, BACK, ANKLE, HIP, FULL_BODY, CERVICAL, THORACIC, LUMBAR, ELBOW, WRIST, FOOT (overweeg toevoegen: SI_JOINT, CORE, GROIN — bestaande enum dekt het niet 1-op-1).

**Fase-codes:** 1 = acuut/bescherming, 2 = ROM/basis-functie, 3 = kracht/neuromusc, 4 = running/sport-loading, 5 = RTS/performance.

**Level of Evidence (Oxford CEBM):** 1 = systematic review RCT's, 2 = individuele RCT/cohort, 3 = case-control, 4 = case-series, 5 = expert.

---

## REGIO 1 — KNIE (28 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off / Benchmark | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Modified Stroke Test | EFFUSION | Hydrops graderen | Vloeistof mediaal distaal strijken, dan proximaal–distaal medialiseren; score 0/trace/1+/2+/3+ | Doel ≥fase 2: graad 0; ≥1+ wijst op overbelasting | Post-ACLR, post-meniscus, gonartrose, postop | 1–5 | 20032559 | 2 |
| 2 | Knie-circumferentie ±5 cm mid-patella | EFFUSION | Volumemonitor | Meetlint op vaste landmarks, 2 metingen gemiddeld | LSI <1 cm verschil fase 3 | Idem | 1–5 | 22382825 | 4 |
| 3 | Knie-flexie ROM | ROM | Flexie-deficit | Rugligging, hak naar bil; passief + actief | Symmetrie ±5° voor RTS | Post-ACLR, postop, gonartrose | 2–5 | 29089004 | 1 |
| 4 | Heel-Height Difference (prone) | ROM | Extensie-deficit | Buikligging, voeten over rand; verschil hielhoogte (1 cm ≈ 1°) | LSI 0; deficit fase 3+ = rode vlag | Post-ACLR, TKA | 2–5 | 29089004 | 1 |
| 5 | Isokinetische quadriceps 60°/s | STRENGTH | LSI quad | Biodex, 5 reps, zit 90° heup, ROM 90–0° | LSI ≥90%; absoluut ≥3,0 Nm/kg ♂ / ≥2,4 ♀ | ACLR, meniscus, gonartrose, PFP | 3–5 | 27162233, 27215935, 22314862 | 2 |
| 6 | Isokinetische hamstrings 60°/s | STRENGTH | LSI HS | Idem, concentrisch | LSI ≥90% | ACLR (HS-graft), HS-strain | 3–5 | 22314862, 27215935 | 2 |
| 7 | Conventionele H:Q ratio | STRENGTH | Spierbalans | H peak ÷ Q peak | ≥0,55 | ACLR, HS-risico, voetbal | 3–5 | 22382825 | 3 |
| 8 | Functionele H:Q (Hecc 30°/s : Qcon 240°/s) | STRENGTH | Dynamische balans | Isokinetisch beide modi | ≥1,0 sportstreef | ACLR, sprint, HS-revalidatie | 4–5 | 22382825 | 3 |
| 9 | Isometrische quadriceps MVIC (HHD) | STRENGTH | Pragmatische LSI | Zit 60° flex, 3×5 s, hoogste | LSI ≥90%; absoluut ≥3,0 Nm/kg | Idem isokinetiek | 2–5 | 22402434 | 2 |
| 10 | Single-leg leg press 1RM | STRENGTH | Functionele LSI | 3 RM, 1RM-formule | LSI ≥90% | ACLR, meniscus, gonartrose | 3–5 | 22314862 | 3 |
| 11 | Single-leg heel-rise endurance (Hébert-Losier) | ENDURANCE | Plantarflexor capacity | 1 been, 10° DF incline, metronoom 60 bpm, max reps tot vorm-fail | Norm 30–39 j: ♂32, ♀28; LSI ≥90% | Achilles, kuit, ACLR loadshift, PFT | 2–5 | 28886865, 28499192 | 1 |
| 12 | Hip-abductor MVIC (HHD, side-lying) | STRENGTH | Proximale controle | Zijligging, knie gestrekt, HHD lat boven malleolus, 3×5 s | LSI ≥90%; absoluut >30% LG | PFP, ACLR, ITB, lopers | 2–5 | 21335344 | 2 |
| 13 | Single Hop for Distance | POWER | LSI horizontaal | 1 been, max sprong vooruit, landing stabiel 2 s, 3 reps beste | LSI ≥90% (≥95% stricter) | ACLR, meniscus, post-knie-trauma | 4–5 | 1962720, 17311886, 27162233 | 2 |
| 14 | Triple Hop for Distance | POWER | LSI seriële | 3 opeenvolgende hops max | LSI ≥90% | Idem | 4–5 | 1962720, 17311886 | 2 |
| 15 | Crossover Hop | POWER | LSI + frontal-plane | 3 hops over middenlijn (15 cm tape) | LSI ≥90% | Idem; sterker discriminerend | 4–5 | 1962720, 17311886 | 2 |
| 16 | 6-meter Timed Hop | POWER | LSI tijd | Hop 6 m zo snel mogelijk | LSI ≥90% (tijd ≤110%) | Idem | 4–5 | 1962720, 17311886 | 2 |
| 17 | Side Hop Test (Gustavsson) | POWER | Frontal-plane endurance | 2 lijnen 40 cm, max side-hops 1 been in 30 s | LSI ≥90% | ACLR, ACL-deficient | 4–5 | 16525796 | 2 |
| 18 | Single-leg CMJ | POWER | Verticale LSI | 1 been CMJ op force plate/jump mat | LSI ≥90% hoogte | ACLR, PFT, sprintsport | 4–5 | 31050053 | 2 |
| 19 | Drop Vertical Jump (DVJ) | MOVEMENT_QUALITY | Landingsbiomechanica | Stap af box 30 cm, direct max sprong; 2D-camera frontaal+sagittaal | Knie-valgus collapse = risico | ACL preventie/RTS, jeugd | 1, 4–5 | 15722287, 20702858 | 2 |
| 20 | Single-Leg Drop Jump / RSI | POWER | Reactive strength | Drop 20–30 cm, direct max sprong; RSI = hoogte/contacttijd | LSI ≥90%; RSI >1,5 sportstreef | ACLR fase 5, sprint/spring | 5 | 31050053 | 3 |
| 21 | Single-Leg Squat (Crossley) | MOVEMENT_QUALITY | Frontal-plane controle | 5× SLS tot ~60°; observator scoort 6 items | ≥4 slechte items = afwijkend | PFP, ACLR, gonartrose, jeugd | 2–5 | 21335344 | 2 |
| 22 | Y-Balance Lower Quarter | BALANCE | Dynamische balans/mobiliteit | 1 been, max reik anterior/PM/PL met andere voet; normaliseer op beenlengte | Anterior LSI verschil >4 cm = risico; composite <94% = risico | OE algemeen, ACLR, enkel | 1, 3–5 | 17193868 | 2 |
| 23 | Star Excursion Balance Test (SEBT) | BALANCE | Dyn. postural | Idem zonder Y-frame | Composite reductie >6,5% significant | Idem | 1, 3–5 | 17193868 | 2 |
| 24 | Landing Error Scoring System (LESS) | MOVEMENT_QUALITY | 17-item video-score DVJ | DVJ opnemen frontaal+sagittaal; LESS-real-time variant | ≤4 excellent; >6 poor (ACL-risico) | ACL preventie/RTS, jeugd-screen | 1, 4–5 | 19726623 | 2 |
| 25 | Tuck Jump Assessment | MOVEMENT_QUALITY | Plyometrische techniek + fatigue | 10 s aaneen max tuck-jumps; 10 items scoren | ≥6 flaws = aandachtspunt | ACL preventie, jeugd, ACLR fase 5 | 4–5 | 21081640 | 4 |
| 26 | Active Joint Position Sense knie | SENSORIMOTOR | Reproductie targethoek | Zit, ogen dicht; target 45°, pat reproduceert; 3 trials | Gezond <5° error; >3° verschil = significant | ACLR, gonartrose, post-meniscus | 2–4 | 1750935 | 4 |
| 27 | One-leg balance eyes closed (30 s) | BALANCE | Functionele propriocepsis | 1 been, ogen dicht, handen op heupen | Gezond >20 s | ACLR, enkel, gonartrose, valpreventie | 1–5 | 20565735, 18827327 | 3 |
| 28 | 505 Agility Test | SPORT_SPECIFIC | COD-snelheid | 15 m sprint, 180° draai aan 5 m-lijn, terug 5 m; timegates 10–15 m | LSI ≥90%; sport-specifieke norm | ACLR fase 5, voetbal/handbal/basket | 5 | 22137326 | 3 |

---

## REGIO 2 — HEUP (incl. lies/adductoren, proximaal hamstring) (27 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 29 | Hip flexion ROM | ROM | Sagittale mobiliteit | Rugligging, knie 90°, max passieve flex | Norm 110–120°; deficit >10° significant | Hip OA, FAIS, postop | 1–5 | 27231334 | 2 |
| 30 | Hip IR ROM in 90° flexie | ROM | Anterior/intra-art restrictie | Zit of buikligging, passieve IR; goniometer over tibia | <20° of asymmetrie >10° = relevant | FAIS, post-luxatie, hip OA | 1–5 | 22773321 | 2 |
| 31 | Hip ER ROM | ROM | Posterior restrictie | Idem, externe rotatie | Asymmetrie >10°, of <30° gereduceerd | Hip OA, FAIS, post-arthroscopie | 1–5 | 22773321 | 2 |
| 32 | FADIR-test (anterior impingement) | PROVOCATION | FAIS screen | Rugligging, heup 90° flex + ADD + IR; pijn-reproductie | Sens 94%, Spec 9–25%: rule-out | FAIS, labrum | 1 | 22773321 | 1 |
| 33 | FABER (Patrick) | PROVOCATION | Differentiatie hip/SIJ/lumbaal | Rugligging, hak op contralat knie; afstand laterale knie-tafel | Verschil >2 cm = significant | Hip OA, SIJ, FAIS, prox HS | 1 | 22773321 | 2 |
| 34 | Modified Thomas Test | ROM | Psoas/rectus/TFL lengte | Rugligging op tafelrand, contralat knie naar borst; testbeen valt vrij | Heup 0° normaal; >0° flex = psoas-strak; knie <80° = rectus-strak | HFT, FAIS, GTPS, runners | 1–4 | 27231334 | 3 |
| 35 | Trendelenburg / 30 s 1-been stand | FUNCTIONAL | Gluteus medius | 1 been 30 s; observeer pelvis-drop | Drop >2 cm = positief | GTPS, hip OA, post-THA, lopers | 1–5 | 22983121 | 2 |
| 36 | Hip ABD MVIC (HHD side-lying) | STRENGTH | LSI ABD | Zijligging, knie gestrekt, HHD lat boven malleolus, 3×5 s | LSI ≥90%; ~2,5 Nm/kg ♂ voetbal | GTPS, hip OA, ACLR, knie-PF | 2–5 | 26031646, 21335344 | 2 |
| 37 | Hip ADD MVIC (HHD supine) | STRENGTH | LSI ADD | Rugligging, knieën gestrekt; HHD mediaal boven malleolus, 3×5 s | LSI ≥90%; ~3,0 Nm/kg ♂ voetbal | Adductor-related liespijn, voetbal/IJshockey | 2–5 | 26031646, 26031643 | 2 |
| 38 | Hip ER MVIC (HHD seated) | STRENGTH | LSI ER | Zit 90° heup, HHD boven mediale malleolus | LSI ≥90% | FAIS, hip OA, knee-PF | 2–5 | 26031646 | 2 |
| 39 | Hip IR MVIC (HHD) | STRENGTH | LSI IR | Idem, oppositie | LSI ≥90% | Idem | 2–5 | 26031646 | 2 |
| 40 | Hip extension MVIC (HHD prone) | STRENGTH | LSI ext | Buikligging, knie 90° flex; HHD distaal dij | LSI ≥90% | Lumbopelvic, post-THA, GTPS | 2–5 | 26031646 | 3 |
| 41 | Hip flexion MVIC (HHD seated) | STRENGTH | LSI flex | Zit, HHD distaal dij | LSI ≥90%; ratio flex/ADD <0,95 = risico | HFT, ADD-injury preventie | 2–5 | 26031646 | 2 |
| 42 | Adductor Squeeze 0° (long-lever) | PROVOCATION | Pijn-reproductie + kracht | Rugligging, benen gestrekt; vuist of dynamometer tussen mediale malleoli; max 3–5 s × 3 | Pijn-positief; kracht <80% baseline = risico | Adductor-related liespijn (Doha) | 1–5 | 15273182, 19546030, 25313133 | 1 |
| 43 | Adductor Squeeze 45° | PROVOCATION | Idem mid-range | Heup+knie 45°; squeeze tussen knieën | Idem | Idem | 1–5 | 15273182 | 2 |
| 44 | Adductor Squeeze 90° | PROVOCATION | Idem inner range | Heup+knie 90°; squeeze tussen knieën | Idem; vaak pijnlijkst bij acuut | Idem | 1–5 | 15273182 | 2 |
| 45 | Copenhagen 5-second Squeeze | STRENGTH | In-season monitor | 5 s max squeeze, sphygmomanometer/HHD | Daling >15% vs baseline = waarschuwing | Adductor monitor in-season | 4–5 | 25313133 | 3 |
| 46 | Eccentric Hip Adduction Strength (HHD) | STRENGTH | Pre-season risico | Side-lying, top been HHD weerstand, eccentr ADD 3–5 s | Asymmetrie >15% = risico | Adductor preventie | 1, 4–5 | 26031646, 25820456 | 2 |
| 47 | Passive Straight Leg Raise | NEURODYNAMIC | HS lengte + neuro | Rugligging, gestrekt been passief heffen | Norm 70–80°; verschil >10° significant | HS-strain, lumbar radiculo, prox HS | 1–5 | 19996329 | 2 |
| 48 | Askling H-test | FUNCTIONAL | Functionele lengte + apprehension | Rugligging, "lift been zo hoog en snel mogelijk"; meet hoek + vraag apprehension | Apprehensie of >10° verschil = positief; predict RTS | Acute + chronische HS-strain (stretch-type) | 4–5 | 19996329 | 2 |
| 49 | Nordic Hamstring (NordBord) peak force | STRENGTH | Eccentric LSI | Knie 90°, hielen gefixeerd; gecontroleerd voorwaarts vallen; load-cell | <337 N of LSI <90% = risico | HS preventie/RTS, sprintsport | 1, 4–5 | 27660368, 23918443 | 1 |
| 50 | Nordic Break-Point Angle | STRENGTH | Eccentric kwaliteit | 2D-camera 60 fps, goniometer over knie | Lagere hoek = hoger risico | Idem | 4–5 | 23190584 | 2 |
| 51 | Single Leg Hamstring Bridge (30 s) | ENDURANCE | Posterior chain endurance | Rugligging, voet op 60 cm box (knie 20°), tilt-up; tellen reps in 30 s | <20 reps = risico HS-strain | HS preventie/RTS, low back, runners | 2–5 | 23918443 | 2 |
| 52 | 90/90 Hamstring length test | ROM | HS lengte | Rugligging, heup 90°, passieve knie-ext; tekort in graden | Verschil >10° significant; <20° tekort = goed | HS-strain, lumbar, postop | 2–5 | 19996329 | 3 |
| 53 | Step-Down Test (lateral 20 cm) | MOVEMENT_QUALITY | Functionele kracht/controle | Stap af 20 cm trede; observatie: handen, romp-lean, pelvis-drop, knie-valgus | Norm ≥10 reps/30 s; >1 flaw aandachtspunt | PFP, hip OA, GTPS, post-THA | 2–5 | 27231334 | 3 |
| 54 | Single-Leg Bridge Hold (max tijd) | ENDURANCE | Posterior-chain endurance | Rugligging, voet op grond knie 60°, hip max ext, hold tot vorm-fail | Norm >90 s; LSI relevant | Low back, GTPS, HS, post-THA | 2–5 | 23918443 | 3 |

---

## REGIO 3 — ENKEL & VOET (22 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 55 | Ottawa Ankle Rules | DECISION_RULE | Fractuur uitsluiten | Pijn malleolus + onvermogen 4 stappen direct/bij beoordeling = X-ray; idem mid-foot (5e MT-basis, navicular) | Sens 98%, Spec 30%: rule-out | Acuut enkeltrauma | 1 | 1554175 | 1 |
| 56 | Anterior Drawer Test (ATFL) | PROVOCATION | ATFL-laxiteit | Voet 10–20° PF; stabiliseer tibia, trek calcaneus naar voor; pos = excess. translatie of soft end-feel | Sens 74%, Spec 38% (acuut beter na 4–5 dagen) | Acuut + chronisch lat. letsel | 1 | 28053200 | 2 |
| 57 | Talar Tilt Test (CFL) | PROVOCATION | CFL-laxiteit | Neutrale DF; inversie-stress | Sens 50%, Spec 88% | Lat ankle sprain II-III, CAI | 1 | 28053200 | 2 |
| 58 | Squeeze Test (syndesmosis) | PROVOCATION | High-ankle sprain | Compressie tibia/fibula mid-kuit; pos = pijn distaal | Sens 30%, Spec 93% | Syndesmotic letsel | 1 | 29514819 | 2 |
| 59 | External Rotation Stress Test (Kleiger) | PROVOCATION | Syndesmosis | Knie 90°, DF 0°; passieve ER van voet; pos = pijn anterolateraal | Sens 20%, Spec 85% | Syndesmotic letsel | 1 | 29514819 | 2 |
| 60 | Thompson Test | PROVOCATION | Achilles-ruptuur | Buikligging, voeten over rand; squeeze kuit; pos = afwezige PF | Sens 96%, Spec 93% | Acuut Achilles trauma | 1 | 25361863 | 2 |
| 61 | Weight-Bearing Lunge (knee-to-wall) | ROM | DF onder gewicht | Stand voor muur, knie naar muur, hak op grond; meet afstand tenen-muur (cm) of inclinometer | Norm ≥10 cm / ≥35°; LSI verschil >1,5 cm | Achilles, Sever, plantair fasc, post-immo, CAI, knie/PF | 1–5 | 22666642, 16027027 | 1 |
| 62 | Non-WB DF ROM (knie 0° en 90°) | ROM | Passieve DF | Rugligging, knie 0° en 90°; meet hoek end-feel | Norm 10° (knie 0°), 20° (knie 90°); verschil >5° significant | Idem | 1–5 | 22666642 | 2 |
| 63 | Plantairflexie ROM | ROM | Vol PF | Idem, max PF | Norm ~50°; verschil >5° significant | Achilles, post-immo, midfoot | 1–5 | 22666642 | 3 |
| 64 | Subtalar inv/ev ROM | ROM | Frontale plane | Buikligging, knie 90°; inv/ev t.o.v. tibia | Inv ~20°, Ev ~10°; asymmetrie >5° relevant | Lat letsel, post-immo, midfoot | 1–5 | 29514819 | 3 |
| 65 | Isokinetic plantairflexie 30°/s | STRENGTH | LSI PF | Biodex, prone of supine; piek-koppel | LSI ≥90% | Achilles, kuit, PF, post-immo | 3–5 | 28499192 | 2 |
| 66 | Isokinetic dorsiflexie 30°/s | STRENGTH | LSI DF | Idem | LSI ≥90% | Shin splints, drop-foot, post-immo | 3–5 | 28499192 | 3 |
| 67 | Isometric inv/ev MVIC (HHD) | STRENGTH | LSI peroneal (ev) | Side-lying, HHD lat/med voet, 3×5 s | LSI ≥90%; ev:inv ratio ~0,9 | Lat enkel, CAI, peroneal | 2–5 | 29514819 | 2 |
| 68 | Standing Heel-Rise (bilateraal) reps | STRENGTH | PF basaal screen | Stand 2 benen, max heel-rises ROM vol | Norm ≥25 reps; baseline voor single-leg | Pre-loading, ouderen, gonartrose | 1–3 | 28499192 | 3 |
| 69 | Foot Lift Test (modified Romberg) | BALANCE | Postural control eyes-closed | 1 been ogen dicht 30 s; tel "lifts" van standbeen | CAI >5 lifts; gezond <3 | CAI | 1, 3–5 | 16791302 | 3 |
| 70 | Side-Hop Test (10 reps op tijd) | POWER | Lateral hop LSI | 2 lijnen 30 cm, 10 zij-hops 1 been zo snel mogelijk | LSI tijd ≤110%; CAI vaak >120% | CAI, lat letsel RTS | 4–5 | 16791302 | 2 |
| 71 | Figure-8 Hop Test | POWER | Multidirectionele hop | 2 cones 5 m, fig-8 hoppen 2 rondes 1 been | LSI ≤110%; sport-specifiek | CAI, lat letsel RTS | 4–5 | 16791302 | 2 |
| 72 | Silbernagel Hopping Test (25 hops 1-been) | POWER | Reactive PF capaciteit | 25 hops in plaats op 1 been, max effort | LSI ≥90%; pijn-monitor 0–5 acceptabel | Midportion Achilles tendinopathie | 3–5 | 17307888 | 2 |
| 73 | Drop CMJ single-leg | POWER | Reactive strength | Drop 20 cm, direct max sprong | LSI ≥90% RSI | Late-fase Achilles, post-ruptuur RTS sprint | 5 | 17307888 | 3 |
| 74 | Royal London Hospital Test | PROVOCATION | Midport Achilles localisatie | Buikligging, voet over rand; palpatie pijnlijk punt in PF; pijn verdwijnt in DF = positief | Sens 54%, Spec 91% | Midportion Achilles tendinopathie vs paratendinopathie | 1 | 25361863 | 3 |
| 75 | Silbernagel Pain Monitoring Model (in-test NRS 0–10) | FUNCTIONAL | Symptom-tolerantie tijdens load | NRS tijdens, direct na, en 24 h na load | 0–5 acceptabel; >5 of stijging volgende dag = terugschalen | Achilles, patellaire, tendinopathie | 2–5 | 17307888 | 2 |

---

## REGIO 4 — SCHOUDER (32 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 76 | Hawkins-Kennedy | PROVOCATION | Subacromial screen | 90° flex + passieve IR | Sens 79%, Spec 59% | RCRSP, post-trauma | 1 | 22773322, 17720798 | 1 |
| 77 | Neer's Sign | PROVOCATION | Subacromial | Passieve max flex in IR | Sens 72%, Spec 60% | Idem | 1 | 22773322 | 1 |
| 78 | Empty Can (Jobe) | PROVOCATION | Supraspinatus | 90° abd 30° anteflex, max IR; weerstand | Sens 69%, Spec 62% | RC-tendinopathie | 1 | 22773322 | 1 |
| 79 | External Rotation Lag Sign | PROVOCATION | RC-integriteit | Zit, elleboog 90°, schouder 20° abd; max ER, loslaten; pos = lag | Sens 56–98%, Spec 84–98% (grote ruptuur) | Vol-dik RC-laesie | 1 | 22773322 | 1 |
| 80 | Lift-Off (Gerber) | PROVOCATION | Subscapularis | Hand achter rug lumbosacraal, wegtillen tegen weerstand | Sens 18–62%, Spec 89% | Subscapularis-letsel | 1 | 22773322 | 2 |
| 81 | Belly Press | PROVOCATION | Subscapularis (beperkte IR) | Hand op buik, elleboog naar voor; weerstand | Sens 25–75%, Spec 80–98% | Idem | 1 | 22773322 | 2 |
| 82 | Anterior Apprehension Test | PROVOCATION | Anterior instabiliteit | Rugligging, schouder 90° abd, max ER | Sens 72%, Spec 96% (apprehensie als criterium) | Anterior instab, post-luxatie | 1 | 22773322 | 1 |
| 83 | Relocation Test (Jobe) | PROVOCATION | Anterior instab | Vervolg apprehension: druk humerus posterior | Cluster met apprehension | Idem | 1 | 22773322 | 2 |
| 84 | O'Brien Active Compression | PROVOCATION | SLAP screen | 90° flex + 10° ADD + IR (duim down); resist; herhaal in ER | Sens 67%, Spec 37% | SLAP-verdenking | 1 | 22773322 | 2 |
| 85 | Kim Test | PROVOCATION | Posterior labrum | Zit, 90° abd, axiale druk + 45° elevatie + post-inf force | Sens 80%, Spec 94% (met Jerk-test) | Posterior instab | 1 | 22773322 | 2 |
| 86 | Sulcus Sign | PROVOCATION | Inferior laxiteit | Zit, tractie aan elleboog; meet inferior translatie | >1 cm = positief; graad I/II/III | MDI | 1 | 22773322 | 3 |
| 87 | GH IR ROM 90° abductie supine | ROM | GIRD detectie | Rugligging, scapula gestabiliseerd, 90° abd, elleboog 90°; passieve IR; inclinometer | Norm 60–70°; GIRD = >18° verlies vs niet-dom | Overhead-atleten, RCRSP, post-stab | 1–5 | 24790697, 12671624 | 1 |
| 88 | GH ER ROM 90° abductie | ROM | ER-winst (overhead) of verlies (postop) | Idem, max passieve ER | Overhead-dom +6–10°; post-op verlies dom >5° = restrictie | Idem | 1–5 | 24790697 | 1 |
| 89 | Total Rotational Motion (TRM) | ROM | TRM-deficit | Som IR + ER | Verschil dom-niet-dom >5° = risico | Overhead-atleten preventie | 1, 4–5 | 24790697 | 2 |
| 90 | Horizontal Adduction (cross-body) | ROM | PSTI (post. shoulder tightness) | Rugligging, schouder 90° flex; passieve horizontale ADD | Verschil >10° met contralat = beperkt | Overhead-atleten, RCRSP | 1–5 | 24790697 | 2 |
| 91 | Shoulder Flex/Abd ROM | ROM | Globale ROM | Stand of zit; actief en passief | LSI ±5° fase 3+ | Brede schouder | 1–5 | 22773322 | 3 |
| 92 | Isokinetic ER/IR 60–180°/s | STRENGTH | LSI + ratio | Biodex; modified neutral of 90° abd positie | LSI ≥90%; ER:IR 0,66–0,75 normaal; <0,60 risico overhead | RCRSP, post-luxatie, overhead | 3–5 | 8129112, 20587640 | 1 |
| 93 | Isometric ER MVIC (HHD) | STRENGTH | LSI ER | Zit, elleboog 90° tegen romp; HHD distaal ulna; 3×5 s | LSI ≥90% | RCRSP, post-RC, post-luxatie | 2–5 | 20587640 | 2 |
| 94 | Isometric IR MVIC (HHD) | STRENGTH | LSI IR | Idem, resist IR | LSI ≥90% | Idem | 2–5 | 20587640 | 2 |
| 95 | Isometric Abduction MVIC (HHD, scap plane 90°) | STRENGTH | LSI delt/supra | Zit, scap plane 90°; HHD distaal humerus | LSI ≥90% | RCRSP, RC-postop | 2–5 | 20587640 | 2 |
| 96 | Functional ecc-ER : con-IR ratio | STRENGTH | Werpsport ecc ER-capaciteit | Isokin ecc ER 60°/s ÷ con IR 240°/s | ≥1,0 sportstreef; <0,85 = risico | Werpen, tennis, volley | 4–5 | 20587640 | 2 |
| 97 | Scapular Dyskinesis Test (SDT) | MOVEMENT_QUALITY | Scapulaire kwaliteit | 5 reps bilat flex 0–180° en abd met halters (1,4 kg ♀ / 2,3 kg ♂); observatie achter | "Obvious dyskinesis" = relevant; κ 0,48–0,61 | Overhead, RCRSP, post-stab | 1, 3–5 | 19295960, 23580420 | 2 |
| 98 | Scapular Assistance Test (SAT) | PROVOCATION | Symptom-modificatie | Therapeut faciliteert scapula UR tijdens elevatie; pos = pijn ↓ of ROM ↑ | Pos = scapula in management | RCRSP, impingement-pattern | 1 | 23580420 | 3 |
| 99 | Scapular Retraction Test (SRT) | PROVOCATION | Symptom-modificatie | Stabiliseer scapula in retractie; hertest Empty Can/kracht | Pos = scapulaire integratie nodig | RCRSP | 1 | 19131678, 23580420 | 3 |
| 100 | Lateral Scapular Slide Test (LSST) | MOVEMENT_QUALITY | Scapula-positie 3 posities | Afstand inf scapula tot proc spinosus T7 in 3 posities | Verschil >1,5 cm = asymmetrie | Idem | 1 | 23580420 | 3 |
| 101 | CKCUEST (15 s touches) | FUNCTIONAL | Stabiliteit/power | Push-up positie, 2 tape-lijnen 91 cm; alternatief touches in 15 s, 3 trials | College ♂ ~21, ♀ ~18 touches | Post-RC, post-stab, overhead-RTS | 4–5 | 24175137 | 2 |
| 102 | Upper Quarter Y-Balance (UQYBT) | BALANCE | Functionele stabiliteit | Push-up positie, reik 3 richtingen met andere hand; normaliseer op armlengte | Composite >80% armlengte; LSI verschil <7,5% | Idem; lower-load RTS | 3–5 | 22530188 | 2 |
| 103 | Seated Medicine Ball Throw | POWER | Power overhead | Zit met rug tegen muur, ball overhead push, meet afstand; 3 trials | LSI ≥90% (uni-arm); sport-norm | RCRSP-RTS, overhead | 4–5 | 24175137 | 3 |
| 104 | Single-Arm Plyometric Push-Up (Negrete) | POWER | Plyometric upper | 1-arm push-up met klap; vluchttijd of hoogte | LSI ≥90%; sport-norm | Late fase RTS UE | 5 | 21088548 | 2 |
| 105 | Posterior Shoulder Endurance Test (Tonley) | ENDURANCE | Posterior chain endurance | Buikligging, hoofd over rand; vol scapula-retract + horizontale abd met IR vrij tot 90°; 1,5 kg dumbbell, 90°/s metronoom; tellen tot vorm-fail | Norm literatuur-afhankelijk; LSI ≥90% | RCRSP, scap. dyskinesis, overhead | 3–5 | 23580420 | 3 |
| 106 | Functional Throwing Performance Index (FTPI) | SPORT_SPECIFIC | Werp-nauwkeurigheid | Throws naar target 40×60 cm op 4,5 m in 30 s; FTPI = on-target ÷ totaal | Hoge FTPI; sport-specifiek | Overhead-RTS post-RC of -stab | 5 | 20335509 | 3 |
| 107 | Ball Release Velocity (radar) | SPORT_SPECIFIC | Power output | Radar achter target; gemiddelde 3 worpen max effort | Vergelijk pre-injury baseline | Pitchers, handball, waterpolo | 5 | 8129112 | 3 |

---

## REGIO 5 — LUMBALE WERVELKOLOM (18 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 108 | Centralisation Phenomenon (McKenzie) | MOVEMENT_QUALITY | Symptoom-response classificatie | 10 reps voorover/achterover; observeer locatie-shift | Centralisatie = gunstig prognostisch | Acuut/subacuut LBP met of zonder bilat verwezen pijn | 1–2 | 22466247 | 2 |
| 109 | Aberrant Movement Pattern cluster | PROVOCATION | Klinische instabiliteit | 4 items: aberrant mvt, passive lumbar ext positive, prone instability test positive, age <40, SLR >91° | 3+/5 = sterk positief | LBP met flare-pattern, vermoede segm. instab | 1 | 22466247 | 3 |
| 110 | Straight Leg Raise (Lasègue) | NEURODYNAMIC | L4–S1 wortelirritatie | Rugligging, passieve heupflex gestrekt knie; pos = been-pijn onder knie 30–70° | Sens 91%, Spec 26% | Verdenking radiculopathie, post-discec | 1 | 22466247 | 1 |
| 111 | Crossed SLR | NEURODYNAMIC | Hogere specificiteit | Contralat SLR reproduceert homolat | Sens 29%, Spec 88% | Idem | 1 | 22466247 | 1 |
| 112 | Slump Test | NEURODYNAMIC | Neurale weefsel gevoeligheid | Zit, slump romp → cervicale flex → knie-ext → DF; pos = symptoom-reproductie verlicht door cerv. ext | Sens 84%, Spec 83% | LBP met verwezen pijn, neuro-component | 1 | 22466247 | 2 |
| 113 | Femoral Nerve Stretch (Reverse Lasègue) | NEURODYNAMIC | L2–L4 | Buikligging, passieve knieflex; pos = anterior dij-pijn | Sens 50–84% | L2–L4 radiculopathie | 1 | 22466247 | 3 |
| 114 | Modified Schober Test | ROM | Lumbale flex | Stand; marker PSIS + 10 cm cran + 5 cm caud; vol flex; verschil tov 15 cm | Norm ≥5 cm increase (21+ cm); <5 cm = hypomobiel | Spondylartropathie, post-fusie, hypomobiel | 1–4 | 8725925 | 2 |
| 115 | Fingertip-to-floor distance | ROM | Functionele flexie (lumbar+hip) | Stand, voorover, meet vinger tot vloer (cm) | Norm 0–10 cm; verandering >5 cm relevant | LBP brede populatie, lopers | 1–5 | 22466247 | 3 |
| 116 | Lumbar extension (dubbel inclinometer) | ROM | Ext ROM | Stand, dubbele inclinometer L1 en S1, max ext | Norm 25–30°; verlies >10° = facet-related | Facet syndroom, spinaal stenose | 1–4 | 22466247 | 3 |
| 117 | Lateroflexie (fingertip on lateral thigh) | ROM | Lateral flex asymmetrie | Stand, glij hand langs lat dij; afstand vinger-grond of glissade | Asymmetrie >5 cm aandachtspunt | LBP, sport | 1–4 | 22466247 | 3 |
| 118 | Biering-Sørensen Test | ENDURANCE | Lumbar extensor endurance | Buikligging op tafel, romp horizontaal over rand vanaf SIAS; armen gekruist; hold tot fail | Norm ♂ ~145 s / ♀ ~190 s (McGill); <58 s = risico eerste-episode LBP | LBP preventie, chronisch, post-fusie | 2–5 | 6233709, 10453772 | 1 |
| 119 | Trunk Flexor Endurance (McGill) | ENDURANCE | Anterior endurance | Half-zit 60°, knieën 90°, voeten gefix; hold tot fail | Norm ♂ ~140 s, ♀ ~150 s | Idem | 2–5 | 10453772 | 2 |
| 120 | Side-Bridge Endurance L/R | ENDURANCE | Lateral endurance | Zijligging, support elleboog+voeten, lichaam gestrekt; hold tot fail | Norm ♂ ~95 s, ♀ ~75 s; asymmetrie >5% relevant | LBP, lopers, lateraal-load sport | 2–5 | 10453772 | 2 |
| 121 | Luomajoki Battery (6-item) | MOVEMENT_QUALITY | Lumbopelvic motor control | 6 tests: waiter's bow, pelvic tilt sit, 1-leg stand, sitting knee-ext, prone knee-flex (rocking fw), prone rocking bw | ≥2 positief / 6 = dysfunctie | Sub-acute en chronische non-spec LBP | 2–4 | 17850669, 19056854 | 2 |
| 122 | 5 Times Sit-to-Stand | FUNCTIONAL | Lower limb + romp functie | Standaard stoel ~45 cm zonder leuningen, 5 reps zo snel mogelijk, armen gekruist | Norm 40–59 j: ♂ 7 s / ♀ 7,2 s; >12 s = afwijkend | Chronische LBP, postop, lumbar stenose, ouderen | 2–5 | 22466247 | 2 |
| 123 | 6-Minute Walk Test | FUNCTIONAL | Aerobic capaciteit | 30 m looppad standaard | Norm ♂ ~570 m, ♀ ~538 m; chronische LBP vaak <500 m | Chronisch LBP, post-fusie, lumbar stenose | 3–5 | 22466247 | 2 |
| 124 | Timed Up-and-Go (TUG) | FUNCTIONAL | Basale mobiliteit | Stand → 3 m → draai → 3 m → zit, tijd | <10 s normaal; >12 s = valrisico ouderen; >20 s sig. beperkt | Lumbar stenose, post-fusie, ouderen | 1–4 | 22466247 | 2 |
| 125 | Progressive Isoinertial Lifting Evaluation (PILE) | FUNCTIONAL | Work-capacity til-test | Begin 3,6 kg ♀ / 6 kg ♂; til 4× 30 s tussen tafels op 76 cm; verhoog gewicht; stop bij HR-limiet of fail | Resultaat in kg gerelateerd aan beroeps-eis | Chronisch LBP, work-conditioning, post-fusie RTW | 4–5 | 22466247 | 3 |

---

## REGIO 6 — CERVICALE WERVELKOLOM (21 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 126 | Canadian C-Spine Rule | DECISION_RULE | X-ray-noodzaak na trauma | Algoritme 3 hoog-risico, 5 laag-risico, rotatie >45° als laatste filter | Sens 99%, Spec 45% | Acuut cervicaal trauma | 1 | 11597285 | 1 |
| 127 | Wainner Cluster (cerv. radiculopathie) | PROVOCATION | Cluster | 4 items: Spurling + Distraction + ULTT-A + cervicale rotatie betrokken <60° | 3/4 LR+ 6,1; 4/4 LR+ 30,3 | C5–C8 radiculopathie | 1 | 12544957 | 1 |
| 128 | Spurling Test | PROVOCATION | Cerv. radiculopathie | Zit, ext + lateroflex naar betrokken zijde, axiale compressie ~7 kg | Sens 50%, Spec 86% | Idem | 1 | 12544957 | 1 |
| 129 | Cervical Distraction Test | PROVOCATION | Symptoom-relief | Supine, lichte axiale tractie ~13 kg | Sens 44%, Spec 90% | Idem | 1 | 12544957 | 1 |
| 130 | Upper Limb Tension Test A (Mediaan) | NEURODYNAMIC | Cervicale radiculopathie / neuropathie | Sequence: scapula depressie → 110° abd → onderarm sup → pols/vinger ext → elleboog ext → contralat cerv. lateroflex | Sens 97%, Spec 22%; rule-out | C5–C7, brachiale plexus | 1 | 12544957 | 1 |
| 131 | Sharp-Purser Test | PROVOCATION | C1-C2 instabiliteit | Zit, hoofd licht voor; één hand voorhoofd duwt achter, andere stabiliseert C2; pos = klik/reductie/sx-verandering | Sens 69%, Spec 96% (RA) | RA, Down, post-trauma | 1 | 11597285 | 2 |
| 132 | Cervical Flexion-Rotation Test (CFRT) | ROM | C1-C2 disfunctie | Supine, max passieve cerv. flex, dan passieve rot L en R; meet hoek (goniometer of inclinometer) | Norm ~44° beide; ≤32° = positief; asymmetrie >10° relevant | Cervicogene HA, post-WAD met HA | 1–5 | 17416124, 17112768 | 1 |
| 133 | Cervical ROM 6 richtingen (CROM) | ROM | Globale mobiliteit | Zit; flex/ext, lateroflex L/R, rot L/R; CROM standaard | Norm flex ~50°, ext ~63°, lateroflex ~45°, rot ~75°; verlies >10° relevant | Brede cervicale | 1–5 | 28666405 | 2 |
| 134 | Active Cervical Rotation in supine | ROM | Boven vs onderste cervical | Supine met passieve flex tot end-feel, rot passief | Klinisch; geen harde norm | Cervicogene HA, WAD | 1–4 | 28666405 | 3 |
| 135 | Cranio-Cervical Flexion Test (CCFT, Jull) | STRENGTH | Deep neck flexor activatie | Supine, stabilizer onder nek 20 mmHg; chin-tuck zonder hoofd te liften, progressie 22/24/26/28/30 mmHg; hold 10 s × 10 reps | Vol doorlopen: 30 mmHg × 10 reps; meeste neckpijn falen ≥26 mmHg | Chr. nekpijn, cervicogene HA, WAD, post-fusie | 2–5 | 17188923, 16777470 | 1 |
| 136 | Deep Neck Flexor Endurance (chin-tuck supine hold) | ENDURANCE | Endurance | Supine, max chin-tuck (occiput van mat), hold tot occiput valt of vorm-fail; therapeut monitort SCM | Norm asymp ♂ ~38 s, ♀ ~29 s; nekpijn ~24/20 s | Brede nekpijn screening en outcome | 2–5 | 16777470 | 2 |
| 137 | Cervical Flexion MVIC (HHD) | STRENGTH | Absoluut en flex:ext ratio | Supine, HHD op voorhoofd, 3×5 s MVIC | Abs ~135 N (♂) / ~70 N (♀); flex:ext ~0,55–0,65 | Chr. nekpijn, WAD II-III | 2–5 | 16777470 | 2 |
| 138 | Cervical Extension MVIC (HHD) | STRENGTH | Absoluut | Buikligging, HHD op occiput | Norm ~220 N ♂, ~120 N ♀ | Chr. nekpijn, post-fusie, scoliose | 2–5 | 16777470 | 3 |
| 139 | Cervical Lateral Flex MVIC (HHD) | STRENGTH | Asymmetrie | Side-lying, HHD lat hoofd | LSI ≥90%; asymmetrie >10% relevant | Idem | 2–5 | 16777470 | 3 |
| 140 | Bovenste trapezius shrug MVIC (HHD) | STRENGTH | Cervico-scapulair | Zit, HHD op acromion, weerstand tegen shrug | Bilateraal vergelijken; sport-norm | Nekpijn met scapulaire component | 2–5 | 28666405 | 3 |
| 141 | Joint Position Error (JPE, head repositioning) | SENSORIMOTOR | Cervico-proprioceptie | Zit op 90 cm target, laser op cap; ogen dicht, hoofd in rot/ext/flex, terug naar neutraal; meet error in graden | Asymp <4,5°; WAD/chr. nekpijn vaak ≥6° | WAD, chr. nekpijn, cervicogene dizz | 1–5 | 17702636, 12927623 | 2 |
| 142 | Smooth Pursuit Neck Torsion (SPNT) | SENSORIMOTOR | Cervico-oculair | Pat volgt langzaam bewegend object met ogen, neutraal en met romp 45° geroteerd | Verschil neutraal-torsion = positief voor cerv. invloed | Cervicogene dizz, post-WAD | 1–4 | 17702636, 28622488 | 2 |
| 143 | Sharpened Romberg | BALANCE | Statische balans + sensorische uitdaging | Stand tandem, ogen dicht, armen gekruist; tijd tot fail in 30 s | Norm >25 s; <10 s afwijkend | WAD, post-concussie, ouderen | 1–4 | 17702636 | 3 |
| 144 | Cervical Movement Sense | SENSORIMOTOR | Bewegings-detectie | Geblinddoekt; passieve langzame cerv. rot, pat moet richting noemen | Onderzoek met training | Chr. nekpijn met sensorimotor disfunctie | 2–4 | 28622488 | 3 |
| 145 | Pressure Pain Threshold (algometer, cerv + remote) | SENSORIMOTOR | Centrale sensitisatie | Algometer 1 cm² op cervicale paraspinaal + remote (tibial ant); ramp 30 kPa/s tot pijn-onset | WAD: PPT cerv ~150–250 kPa lager dan gezond; remote PPT ook ↓ | WAD, chr. nekpijn, FMS-overlap | 1–5 | 12927623 | 2 |
| 146 | Cold Pain Threshold (cold pressor) | SENSORIMOTOR | Cold-hyperalgesie prognostisch | Hand in 5°C water; pijn-onset/tolerantie | Hyperalgesie = predictor slechtere uitkomst acute WAD | Acute WAD risico-stratificatie | 1 | 12927623 | 2 |

---

## REGIO 7 — ELLEBOOG (19 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 147 | Cozen Test | PROVOCATION | Lat epicondylopathie | Zit, elleboog 90° pronate; weerstand tegen pols-ext + RD; pos = pijn lat epicondyl | Sens 84%, Spec 0–80% (operator) | Lat epicondylopathie | 1 | 20970844 | 2 |
| 148 | Maudsley's Test | PROVOCATION | ECRB-specifiek | Idem positie, weerstand tegen middelvinger ext | Sens 88%, Spec inconsistent | Idem | 1 | 20970844 | 2 |
| 149 | Mill's Test | PROVOCATION | Passieve stretch | Stand achter pat, max wrist flex + pron + elleboog ext passief; pos = pijn | Sens lager dan Cozen; Spec hoger | Idem | 1 | 20970844 | 3 |
| 150 | Medial Epicondylopathy "Golfer's" Test | PROVOCATION | Med epicondylopathie | Elleboog ext + sup; weerstand tegen pols-flex en pron; pos = pijn med | Sens/Spec niet goed bepaald | Med epicondylopathie | 1 | 20970844 | 3 |
| 151 | Moving Valgus Stress Test (O'Driscoll) | PROVOCATION | UCL dynamisch | Schouder 90° abd, max ER; valgus terwijl elleboog snel van vol-flex naar 30° flex | Sens 100%, Spec 75%; pijn tussen 120–70° "shear range" | UCL-letsel werpers (Tommy John) | 1, 4–5 | 15701609 | 1 |
| 152 | Milking Maneuver | PROVOCATION | UCL statisch | Schouder 90° flex + max ER, elleboog >90° flex; pat/therap trekt duim omlaag; pos = pijn med | Sens lager dan moving valgus, Spec hoog | UCL-letsel | 1 | 15701609 | 2 |
| 153 | Valgus Stress at 30° | PROVOCATION | UCL ligamentair | Schouder en elleboog 30° flex; valgus-stress; pos = laxiteit of pijn | Sens 19%, Spec 100% (laxiteit) | Acuut UCL trauma, post-Tommy John | 1 | 15701609 | 2 |
| 154 | Lateral Pivot-Shift Test (PLRI) | PROVOCATION | PLRI / LCL-complex | Supine, schouder boven hoofd; sup + valgus + axiale comp van vol-ext naar flex; pos = subluxatie ~40° flex met klik bij reductie | Anesthesie betrouwbaar; awake matig | Posterolaterale instabiliteit (post-dislocatie, chronisch) | 1 | 2002081 | 3 |
| 155 | Elbow Flexion Test (cubital tunnel) | PROVOCATION | Ulnaris-compressie | Max elbow flex + schouder abd + pols ext; hold 60 s; pos = paresthesieën IV/V | Sens 75%, Spec 99% | Ulnaris-compressie | 1 | 20970844 | 2 |
| 156 | Hook Test (distale biceps) | PROVOCATION | Vol distale biceps-ruptuur | Sup + 90° flex; therapeut hookt vinger lat rand biceps tendon; intact = hookt achter, gescheurd = geen hook | Sens 100%, Spec 100% (kleine studies) | Verdenking distale biceps-ruptuur | 1 | 2002081 | 2 |
| 157 | Elbow Flex/Ext ROM | ROM | Globale | Stand of zit, gestand. landmarks (humerus lat, radius) | Norm 0–145°; verlies <30° vaak goed verdragen | Brede elleboog, post-fractuur, post-luxatie, contractuur | 1–5 | 20970844 | 2 |
| 158 | Pronation/Supination ROM | ROM | Onderarm rotatie | Elleboog 90° tegen romp; pen verticaal in vuist; meet rotatie | Norm 80–90° elk; <50° beperkend | Post-Colles, post-luxatie, distale RU, biceps | 1–5 | 20970844 | 3 |
| 159 | Pain-Free Grip Strength (PFG, Jamar 90° elbow) | STRENGTH | Symptom-limiet voor LE | Zit, elleboog 90°, dynamometer; squeeze tot pijn-onset (niet max); 3 trials gemiddeld | Ratio aangedaan/contralat <80% = afwijkend; serial monitoring sterkste outcome LE | Lat epicondylopathie (sterk), med epicondyl, UCL-RTS | 1–5 | 12890434, 20970844 | 1 |
| 160 | Maximum Grip Strength (Jamar, ASHT) | STRENGTH | Globale UE | Zit, schouder ADD-neutraal, elleboog 90°, onderarm en pols neutraal; Jamar pos II; 3 trials gemiddeld | Norm ♂ 30–34 j ~50 kg dom; ♀ ~32 kg; dom +10% normaal; LSI <85% afwijkend | Brede UE, ouderen, RA, post-fract, CTS-outcome | 1–5 | 3970660 | 1 |
| 161 | Wrist Extensor MVIC (HHD) | STRENGTH | LSI extensoren | Zit, elleboog 90° pron; HHD dorsaal metacarp; resist | LSI ≥90%; abs ~0,15 Nm/kg | Lat epicondyl, post-fract radius | 2–5 | 12890434 | 2 |
| 162 | Wrist Flexor MVIC (HHD) | STRENGTH | LSI flexoren | Idem, weerstand tegen pols-flex | LSI ≥90% | Med epicondyl, UCL | 2–5 | 12890434 | 2 |
| 163 | Elbow Flexion MVIC (HHD) | STRENGTH | Biceps/brachialis | Zit, elleboog 90° sup; HHD distaal volair onderarm | LSI ≥90% | Post-distale biceps repair, neuro | 2–5 | 11382250 | 3 |
| 164 | Elbow Extension MVIC (HHD) | STRENGTH | Triceps | Zit, elleboog 90°; HHD distaal dorsaal onderarm | LSI ≥90% | Post-tricepsletsel, post-fract olecranon | 2–5 | 11382250 | 3 |
| 165 | Pronation/Supination MVIC (HHD) | STRENGTH | Onderarm-rotatoren | Zit, elleboog 90° mid-positie; HHD lat/med | LSI ≥90% | UCL, biceps, distale RU, post-fract | 2–5 | 11382250 | 3 |

---

## REGIO 8 — POLS & HAND (25 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 166 | Wainner CTS-cluster | PROVOCATION | CTS-diagnose | 5 items: leeftijd >45, shaking verlicht sx, sensibiliteit ↓ mediaan (monofilament), wrist ratio index >0,67, Brigham sx-score | 4/5 LR+ 4,6; 5/5 LR+ 18,3 | CTS-screen | 1 | 15827908 | 1 |
| 167 | Phalen's Test | PROVOCATION | CTS-provocatie | Polsen 90° flex tegen elkaar, 60 s; pos = paresthesieën | Sens 68%, Spec 73% | CTS | 1 | 15827908 | 1 |
| 168 | Carpal Compression Test (Durkan) | PROVOCATION | CTS-provocatie | Therapeut duim druk op carpal tunnel, 30 s; pos = paresthesieën | Sens 64–83%, Spec 83% | CTS | 1 | 1796937, 16448563 | 1 |
| 169 | Tinel's at wrist (mediaan) | PROVOCATION | CTS-provocatie | Repetitief tikken mediaan-zenuw aan ingang carpaal tunnel | Sens 50%, Spec 77% | CTS | 1 | 16448563 | 2 |
| 170 | Finkelstein / Eichhoff Test | PROVOCATION | De Quervain | Eichhoff: duim in vuist, UD pols passief; pos = pijn radiale styloïd | Sens 81%, Spec unknown (operator) | De Quervain tendinopathie | 1 | 18455945 | 2 |
| 171 | Scaphoid Shift (Watson) | PROVOCATION | SL-ligamentaire integriteit | Pols UD naar RD; therapeut duim op tuberculum scaphoideum; pos = pijn + klik + reductie | Sens 69%, Spec 66% | Verdenking SL-instabiliteit | 1 | 3241033 | 2 |
| 172 | Ulnocarpal Stress Test | PROVOCATION | TFCC-pathologie | Pols UD, axiale druk + pron/sup; pos = pijn ulnocarpaal | Sens 100%, Spec 16% (rule-out) | TFCC-letsel, ulnocarpal impaction | 1 | 18455945 | 2 |
| 173 | Piano Key Sign (DRUJ) | PROVOCATION | DRUJ-instabiliteit | Zit met onderarm gepronated rusten; therapeut drukt distale ulna naar palmair en laat los | Pos = rebound naar dorsaal | DRUJ-instab, post-Colles | 1 | 18455945 | 3 |
| 174 | Wrist Flex/Ext, RD/UD ROM | ROM | Globale pols | Goniometer, gestand. landmarks | Norm Flex 75°, Ext 70°, RD 20°, UD 35° | Brede pols, post-fract, RA | 1–5 | 17286094 | 2 |
| 175 | Pronation/Supination ROM | ROM | Onderarm rotatie | Zie #158 | Norm 80–90° elk | Distale radius/ulna, DRUJ | 1–5 | 17286094 | 2 |
| 176 | Total Active Motion (TAM) per vinger | ROM | Composite vinger flex/ext | Som MCP + PIP + DIP flex minus ext-deficit | Norm 260°; <220° sig. beperkt | Vinger-fract, flex/ext pees, dupuytren, RA | 1–5 | 17286094 | 2 |
| 177 | Fingertip-to-DPC | ROM | Functionele vuist | Vinger naar DPC, meet cm | Norm 0 cm; >1 cm aandachtspunt | Post-flexor pees, RA, dupuytren | 1–5 | 17286094 | 3 |
| 178 | Thumb opposition (Kapandji 0–10) | ROM | Functionele oppositie | Duim naar laterale wijsvinger tot DPC-pinkbasis | 10 vol; <8 beperkt | Post-CMC arthrosis, post-fract duim, RA | 1–5 | 17286094 | 3 |
| 179 | Grip Strength (Jamar, ASHT-protocol) | STRENGTH | Globale UE | Zie #160 | Zie #160 | Brede UE | 1–5 | 3970660 | 1 |
| 180 | Tip Pinch (Pinch gauge) | STRENGTH | Distaal kracht | Pulp-to-pulp duim + wijsvinger | Norm ♂ ~7 kg, ♀ ~5 kg | RA, intrinsieke disfunctie, post-fract distale falanx | 2–5 | 6715829 | 2 |
| 181 | Key Pinch | STRENGTH | Functioneel keypinch | Duim pulp tegen lat mid-segment wijsvinger | Norm ♂ ~10 kg, ♀ ~7 kg | RA, ulnaris-letsel, CMC OA duim | 2–5 | 6715829 | 2 |
| 182 | Palmar (3-point) Pinch | STRENGTH | Tripod-grip | Duim pulp tegen pulp wijs + middelvinger | Norm ♂ ~9 kg, ♀ ~6 kg | Idem | 2–5 | 6715829 | 2 |
| 183 | Semmes-Weinstein Monofilaments | SENSIBILITY | Touch threshold | 5 monofilamenten (2,83 normaal; 6,65 geen perceptie); applicate loodrecht | 2,83 normaal; 3,22 verminderde licht-touch; 4,31 verminderde protective; 6,65 verlies | CTS, ulnaris, perif neuropathie, post-nerve-repair | 1–5 | 16448563 | 2 |
| 184 | Two-Point Discrimination (statisch) | SENSIBILITY | Innervatie-density | Disk-criminator op distale falanx, beide punten gelijktijdig zonder bleek; min onderscheidbare afstand | Norm <6 mm; 6–10 fair; >10 slecht | Post-nerve-repair, CTS, hand-functie | 2–5 | 16448563 | 2 |
| 185 | Moberg Pick-Up Test | SENSIBILITY | Tactile gnosis | 12 standaard objecten, beide handen, eyes open en closed; meet tijd | Asymp: eyes-closed ~25 s | Post-nerve-repair, CTS, perif neuropathie | 3–5 | 18455945 | 3 |
| 186 | Jebsen-Taylor Hand Function Test (7 subtests) | FUNCTIONAL | ADL-functie | Schrijven, kaarten, kleine objecten, simulated feeding, stacking, large light, large heavy | Norm leeftijd-/dom-afhankelijk; longitudinaal gebruik | Post-CVA, RA, post-fract, ouderen | 3–5 | 5788487 | 2 |
| 187 | 9-Hole Peg Test | FUNCTIONAL | Fijne motoriek | Standaard 9-hole pegboard; tijd beide handen | Norm ♂ ~16,9 s, ♀ ~17,9 s | MS, CVA, neurodegeneratief, post-hand-letsel | 3–5 | 17286094 | 2 |
| 188 | Box and Block Test | FUNCTIONAL | Manipulatie | 1 cm³ blokjes in 60 s tussen 2 boxen; tellen | Norm ♂ ~88, ♀ ~80 (gezond 30 j) | CVA, RA, post-fract | 3–5 | 17286094 | 2 |
| 189 | Purdue Pegboard | FUNCTIONAL | Bilateraal coördinatie + assembly | Aantal pegs in 30 s en assembly | Industrie/dexterity norm pop-specifiek | RA, post-CVA, ergo-screen | 3–5 | 17286094 | 3 |
| 190 | Functional Dexterity Test | FUNCTIONAL | 3-jaws chuck snelheid | 16 pegs roteren tussen 2 plekken op standard board | Leeftijd/dom-norm; sneller beter | RA, CTS post-op, kinderhand | 3–5 | 17286094 | 3 |

---

## REGIO 9 — THORACAAL & RIBBEN (19 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 191 | Thoracic Flexion (Mod. Schober gewijzigd) | ROM | T-flex | Stand; marker C7 + T12; vol flex; verschil | Increase ~3–4 cm; verlies bij hypomobiliteit | Spondylartropathie (AS), hypomobiel | 1–4 | 17596587 | 2 |
| 192 | Thoracic Extension (dubbel inclinometer) | ROM | T-ext | Dual inclinometer T1 + T12; max ext | Norm 25–30°; verlies geassocieerd met schouder-elevatie-beperking | RCRSP, post-mastectomie, kyfose ouderen | 1–5 | 17596587, 29360864 | 2 |
| 193 | Seated Thoracic Rotation (lumbar-locked) | ROM | T-rotatie isoleren | Zit, voeten vloer, knieën samen of op stoel; armen gekruist of stok schouders; max rot L/R; meet (inclinometer/overhead-camera) | Norm 40–60° per zijde; asymmetrie >10° relevant | Overhead-atleten, romprotatie-sport (golf/tennis), RCRSP, LBP | 1–5 | 29360864, 17596587 | 2 |
| 194 | Occiput-to-Wall Distance (Macrae) | ROM | Hyperkyfose / AS | Stand met hielen tegen muur; afstand occiput-muur | Norm 0 cm; >0 = hyperkyfose/AS | AS, hyperkyfose, ouderen | 1–5 | 5363241 | 2 |
| 195 | Wall Angel / Shoulder Flex against Wall | MOVEMENT_QUALITY | T-ext + GH-flex | Stand met hielen/bekken/romp/occiput tegen muur; armen overhead naar muur | Vol contact = goed; gap >5 cm aandachtspunt | RCRSP, kyfose, post-mastectomie | 2–5 | 29360864 | 3 |
| 196 | Roos Test / EAST | PROVOCATION | Neurogene TOS | Armen 90° abd, ER ("hands-up"); open/sluit handen 3 min | Pos = sx-reproductie (paresthesieën, vermoeidheid, drop); Sens hoog, Spec laag | Verdenking neurogene TOS | 1 | 5907559, 11707008 | 2 |
| 197 | Adson's Test | PROVOCATION | Vasculaire TOS | Zit, ER + ext schouder; inhale + draai hoofd naar geteste zijde; voel radialis-puls | Pos = puls-verm; veel false positives gezond | Verdenking arteriële TOS | 1 | 11707008 | 3 |
| 198 | Wright's Test (Hyperabduction) | PROVOCATION | Vasculair/neurogeen | Zit, armen hyperabd + ER; voel puls; pos = puls-verm of sx-reproductie | Veel false positives | TOS | 1 | 11707008 | 3 |
| 199 | Costoclavicular (Military Brace) Maneuver | PROVOCATION | Vasculair/neurogeen | Zit, schouders retract + depress; voel puls / let op sx | Pos = puls-verm of sx | TOS | 1 | 11707008 | 3 |
| 200 | Rib Spring Test | PROVOCATION | Rib mobiliteit | Prone; springen P-A op rib-hoek; kwalitatief restrictie of pijn | Klinisch; reliability matig, geen genormeerd cut-off | Costale dysfunctie, post-trauma | 1 | 16027027 | 4 |
| 201 | First Rib Mobility Test | PROVOCATION | Bovenste rib in cervico-thoracale junctie | Zit; palpatie + caudale druk op 1e rib | Klinisch | TOS, cervico-thoracale klacht | 1 | 11707008 | 4 |
| 202 | Chest Wall Palpation | PROVOCATION | Costochondritis / Tietze | Palpatie kostochondrale + chondrosternale junctie | Pijn-reproductie ondersteunt | Tietze, costochondritis | 1 | 24956982 | 3 |
| 203 | Crowing Rooster Maneuver | PROVOCATION | Costochondritis | Zit; max cerv. ext + retractie schouders; pos = pijn ant. thoracale wand | Pos ondersteunt costochondritis | Tietze, costochondritis | 1 | 24956982 | 3 |
| 204 | Rib Spring + Resisted Rotation (stress # screen) | PROVOCATION | Vermoede rib stress # | Spring op verdachte rib + lokale palpatie; resisted trunk rot reproduceert | Sens/Spec niet gevalideerd; imaging blijft referentie | Roeiers, werpers, golf, surf, MMA | 1 | 16920774, 9015595 | 4 |
| 205 | Maximum Inspiratory Pressure (MIP) | RESPIRATORY | Inspir. spierkracht | Mond-druk-meter; RV (na max uit); max in tegen gesloten mondstuk ~1,5 s; 3 trials beste binnen 5% verschil | Norm ♂ ~120 cmH₂O, ♀ ~85; <60% predict = zwakte | COPD, post-thoracale OP, neuromusculaire ziekte | 1–5 | 12186831 | 1 |
| 206 | Maximum Expiratory Pressure (MEP) | RESPIRATORY | Expir. spierkracht | Vanuit TLC, max uit tegen gesloten mondstuk | Norm ♂ ~165 cmH₂O, ♀ ~115 | Hoest-effectiviteit, COPD, post-OP | 1–5 | 12186831 | 1 |
| 207 | Chest Expansion (tape-circumferentie) | ROM | Costale ROM | Tape op xiphoïd of 4e ICR-niveau; verschil max insp - max exp | Norm >4 cm; AS / chr. thoracaal <2,5 cm | AS, post-thoracale OP, COPD | 1–5 | 5363241 | 2 |
| 208 | 6-Minute Walk Test (6MWT) | FUNCTIONAL | Functionele aerobe capaciteit | 30 m looppad, standaard instructie | Norm ♂ ~570 m, ♀ ~538 m; MCID 30–35 m (COPD) | COPD, post-cardiothoracaal, fibrose, hartfalen | 2–5 | 12091180 | 1 |
| 209 | Borg RPE / Modified Borg Dyspnea (in-test) | FUNCTIONAL | Subjective exertion tijdens load | 6–20 (klassiek) of 0–10 (modified) | Trend monitoring; doel-RPE per fase | Pulmonale + cardiale revalidatie | 1–5 | 7154893 | 1 |

---

## REGIO 10 — BEKKEN & SI-GEWRICHT (10 tests)

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 210 | Laslett SIJ Pain Provocation Cluster (5-test) | PROVOCATION | SIJ-pijn objectiveren | Cluster: Distraction + Compression + Thigh Thrust + Gaenslen + Sacral Thrust | 3+/5 positief na uitsluiten centralisatie: Sens 91%, Spec 78% | Verdenking SIJ-gerel. pijn | 1 | 16038856, 12775204 | 1 |
| 211 | Distraction Test | PROVOCATION | Anterior SIJ-lig rek | Supine; bilateraal P-A op SIAS; pos = pijn glut/SIJ | Onderdeel cluster | SIJ | 1 | 16038856 | 1 |
| 212 | Compression Test | PROVOCATION | SIJ posterior rek | Sidelying; P-A op bovenste crista iliaca; pos = pijn SIJ | Cluster | SIJ | 1 | 16038856 | 1 |
| 213 | Thigh Thrust (P4) | PROVOCATION | SIJ shear-stress | Supine, heup 90° flex; therapeut axiale druk femur naar tafel; pos = pijn SIJ posterior | Sterkste individuele test | SIJ, postpartum bekkenpijn | 1 | 16038856, 18259783 | 1 |
| 214 | Gaenslen's Test | PROVOCATION | Asymmetrische ext/flex | Supine aan rand; één been hyperext, ander max heupflex tegen borst; pos = pijn SIJ | Cluster | SIJ | 1 | 16038856 | 2 |
| 215 | Sacral Thrust | PROVOCATION | A-P op sacrum | Prone; A-P druk centraal sacrum; pos = pijn SIJ | Cluster | SIJ | 1 | 16038856 | 2 |
| 216 | Long Dorsal Sacroiliac Ligament Palpation | PROVOCATION | Posterior pelvic pain | Palpatie LDSL net caudaal SIPS | Pijn-reproductie ondersteunt PPP | Postpartum bekkenpijn, PPP | 1 | 18259783 | 3 |
| 217 | Symphysis Pubis Palpation | PROVOCATION | Pubic symphysis pijn | Direct palpatie symphysis pubis | Pijn-reproductie | Postpartum symphysiolysis, voetbal/lopers pubic stress | 1 | 18259783 | 3 |
| 218 | Modified Trendelenburg (1-been + pijn) | FUNCTIONAL | Pubic stress functionele provocatie | 1-been stance aangedaan, contralat 90° flex; pos = pijn symphysis pubis | Pos ondersteunt symphysis-pathologie | Pubic stress, symphysiolysis | 1 | 18259783 | 3 |
| 219 | Active Straight Leg Raise (ASLR, Mens) | FUNCTIONAL | Lumbopelvic load transfer | Supine, til been 5 cm op gestrekt; pat scoort heaviness 0–5; herhaal met SIJ-compressie | Score >0 positief; verbetering met compressie wijst op load-transfer dysfunctie | Postpartum bekken-instab, SIJ-pijn, lumbopelvic instab | 1–5 | 11413432, 11805667 | 2 |
| 220 | Stork / Gillet Test | PROVOCATION | SIJ-screen (lage reliability) | Stand; therapeut palpeert PSIS en S2; pat tilt 1 been 90° flex; observeer PSIS-beweging caudaal | ICC <0,5; klinisch waardevol als sx-provocatie, niet motion-detectie | SIJ-screen, klassiek osteopathisch | 1 | 16401431 | 4 |

---

## REGIO 11 — ROMP / CORE (geconsolideerd, 9 tests)

> Andere romp-tests staan al in regio 5 (McGill battery, Biering-Sørensen, Side-Bridge, Luomajoki) en regio 1 (Y-balance).

| # | Test | Construct | Doel | Uitvoering | Cut-off | Toepasbaar bij | Fase | PMID | LoE |
|---|---|---|---|---|---|---|---|---|---|
| 221 | Prone Front Plank Hold (max tijd) | ENDURANCE | Anti-ext endurance | Onderarm-steun, neutrale spinale lijn | Norm ~60–120 s asymp; geen sterke cut-off | Algemeen | 2–5 | 19026017 | 3 |
| 222 | Double Leg Lowering Test (DLL, BFU) | MOVEMENT_QUALITY | Anti-ext lumbopelvic | Supine, benen 90° heupflex gestrekt; BFU onder lumbar 40 mmHg; lower legs; meet hoek waar BFU >2 mmHg verandert | 0–30° laag, 30–45° goed, 45–60° gem, >60° excellent | Sport (gym/dans/ballet), LBP-screen | 2–5 | 11840107, 18296944 | 2 |
| 223 | Trunk Stability Push-Up (FMS-item) | MOVEMENT_QUALITY | Anti-ext upper body | FMS-instructie; vol ROM armen en romp synchroon | Score 0–3 FMS | Sport, preventie | 2–5 | 21522216, 21522210 | 3 |
| 224 | Rotary Stability (FMS-item) | MOVEMENT_QUALITY | Anti-rot multi-plane | Quadrupedaal arm-been-ext zonder rot | Score 0–3 | Sport, preventie | 2–5 | 21522216 | 3 |
| 225 | Med Ball Anti-Rotation Hold | STRENGTH | Anti-rot isometric | Hold met armen geëxtendeerd cross-body | Geen genormeerde cut-off; pop-specifiek | Throwing/striking sport | 4–5 | 19026017 | 4 |
| 226 | Transversus Abdominis Activation (BFU, prone 70 mmHg) | MOVEMENT_QUALITY | Selectieve TrA-activatie | Prone, BFU onder buik 70 mmHg; drawing-in; pressure-drop 4–10 mmHg zonder global muscle dominance | Klinisch; reliability matig | LBP, atletisch, postpartum | 2–4 | 11840107, 8961451 | 2 |
| 227 | Active Pelvic Tilt Control | MOVEMENT_QUALITY | Bewuste pelvic tilt | Stand, instructie ant/post tilt onafhankelijk van romp | Kwalitatief binair positief/negatief | LBP, postpartum | 2–4 | 17850669 | 3 |
| 228 | FMS (7-item composite) | MOVEMENT_QUALITY | Algemene movement screen | 7 items: deep squat, hurdle step, inline lunge, shoulder mobility, ASLR, trunk stability push-up, rotary stability; 0–3 per item, totaal 0–21 | ≤14 in sommige studies geassocieerd met ↑ risico; meta-analyses inconsistent | Algemene sport-screening | 1 | 21522216, 21522210, 28360142, 25709859 | 2 |
| 229 | Seated Medicine Ball Throw (overhead/rot/chest) | POWER | Core power | 3–5 kg ball, gestand. positie; 3 trials | LSI ≥90% rot; sport-norm | Throwing, striking, kayak, roeien | 4–5 | 19026017 | 3 |
| 230 | Backward Overhead Med Ball Throw | POWER | Posterior chain + core | 3–5 kg ball, gestand. | Sport-norm | Field/track sport, hammer/disc | 4–5 | 19026017 | 3 |

---

## TOTAAL

- **230 unieke tests** in 11 regio's
- Cross-regio bruikbare tests (1 entry in DB, meerdere `bodyRegion` tags): Single-leg heel-rise (#11), hop battery (#13–17), single-leg squat (#21), Y-balance LQ (#22), Upper Quarter YBT (#102), CKCUEST (#101), McGill battery (#118–120), ASLR (#219), 6MWT (#123, #208), Grip strength (#160, #179), HHD-MVIC patroon (alle gewrichten)
- Alle PMIDs zijn live-geverifieerd via PubMed MCP. Volledige consolidated reference list met APA 7-citaties + PMIDs staat in de oorspronkelijke sessie-transcriptie (zoek via `mcp__ccd_session_mgmt__search_session_transcripts` op "GECONSOLIDEERDE REFERENTIELIJST")
