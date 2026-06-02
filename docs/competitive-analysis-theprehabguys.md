# Functionele vergelijking — mbt-gym vs. The Prehab Guys (Prehab Pro)

> Opgesteld 2026-06-02. Bron: eigen codebase-inventarisatie + functionele
> verkenning van het Prehab Pro provider-platform (`pro.theprehabguys.com`)
> met een eigen account. **Alleen functionaliteit/flows bekeken — geen
> content, oefeningteksten, video's of data overgenomen.** Doel: kansen
> vinden om onze app te verbeteren, op onze eigen manier.

## TL;DR

- **Wij zijn sterker in klinische diepte en compliance.** ACWR, muscle-loading
  & recovery, tendinopathie-modus, wellness met Z-scores, de Clinical Insight
  Engine, rehab-protocol stoplicht-trackers, mobiliteits-assessments, cohort-
  analytics, GDPR/DPA/audit-logging (NEN 7513), research-anonimisering. Daar
  heeft Prehab Pro nauwelijks een equivalent van.
- **Zij zijn sterker in content-breedte en SaaS-productisatie.** Eén
  gecombineerde bibliotheek van **oefeningen + patiënt-educatie + tests**, een
  zeer grote professioneel gefilmde oefeningenbibliotheek (~3203), een strakke
  drag-&-drop Builder, en een uitgewerkt B2B2C-abonnementsmodel (seats,
  patiëntlimieten, overage-billing, premium consumenten-content + trials).
- **Grootste kans voor ons:** een **patiënt-educatie content-laag** die je
  náást oefeningen in een programma kunt zetten, en het **samenbrengen van
  oefeningen, tests en educatie in één bouw-flow**. Dat hebben wij als losse
  bouwstenen al (exercises, clinicalTests, assessments) maar nog niet verenigd.

---

## 1. Wat Prehab Pro doet (waargenomen)

### Navigatie / structuur
Add Patient · Patients · Builder · Shop · Request an Exercise · Team ·
Settings · Contact · Notifications · What's New · Light/Dark mode ·
account-type "Individual" (vs. team/clinic-seats).

### Builder (kern van het product)
- **Eén bibliotheek, drie content-types** via tabs:
  - **Move** — oefeningen (~3203, professioneel gefilmd, webp/gif previews)
  - **Teach** — patiënt-educatie (~411): uitleg-video's, conditie-info,
    routines ("6 Best Lower Back Exercises", "Fix Plantar Fasciitis", …)
  - **Measure** — klinische tests/assessments (~78): hop tests, endurance-
    tests, special tests (Phalen's, Finkelstein's, CKCUEST, T-test, …)
- Alle drie zijn **als blokken in hetzelfde programma** te slepen.
- Per kaart: favoriet (hartje) + quick-add (+).
- Zoeken, filteren, sorteren over de bibliotheek.
- **Bouw-modi:** Split / Day / Week → output "Program". Drag-&-drop.
- Rechterpaneel-tabs: **Build / Patients / Programs / Templates**.
- "Add exercises from a template" + Assign / New / Save / Save New.

### Patients
- Tabel: **Patient · Care Type · Provider · Programs · Last Active**.
- **Care Type "Managed"** (provider beheert) — suggereert ook andere types
  (self-managed/consumer).
- **Patiëntlimiet** in abonnement ("1/20 managed patients") met paginatie.

### Settings (provider) → "Managed Patient Settings"
- **30-dagen Prehab-trial aanbieden** — patiënten krijgen tijdelijk toegang
  tot premium Prehab consumenten-content. Toegewezen programma's vereisen
  geen membership.
- **Managed Patient Overages** — toestaan boven de 20-patiëntenlimiet (tegen
  meerkosten).

### Overige
- **Request an Exercise** — providers kunnen nieuwe oefeningen aanvragen voor
  de centrale bibliotheek (crowdsourced groei).
- **What's New** — in-app changelog.
- **Team** — multi-clinician seats (gated bij "Individual"-account).
- **Shop** — externe consumenten-/merchandise-winkel.

### Businessmodel (afgeleid)
**B2B2C**: provider-abonnement met seats + patiëntlimieten + overage-billing;
patiënten haken aan op de premium consumenten-content (Prehab-app) met trials.

---

## 2. Wat wij doen (uit de codebase)

Rollen: **ADMIN / THERAPIST / PATIENT / ATHLETE**, multi-tenant via `Practice`.

- **Oefeningenbibliotheek:** categorieën, body-regions, difficulty, movement-
  pattern, load-type, unilateraal, **muscle-loading 1–5/spier**, progressie-
  varianten (easier/harder), video (YouTube/Vimeo/Mux/Cloudflare), fuzzy
  search (pg_trgm), favorieten, collections, extra-params per oefening.
- **Programma-builder:** templates (praktijk-breed deelbaar), fixed én flexible
  scheduling, supersets, cardio-protocollen (walk-run/intervals/tempo/zone/…),
  tendinopathie-modus, 1RM-toggle, clone, assign/unassign.
- **Week-planner** (weekschema's, clone naar patiënt, activeren).
- **Sessie-logging:** patiënt zelf én therapeut live in de kliniek + async
  bewerken; cardio-logging; pijn per oefening (tijdens / 24u na / ochtendstijf-
  heid); 1RM + PR's; exertion (RPE).
- **Progressie/dashboards:** 1RM-trends, tendinopathie-trend, **ACWR**,
  **recovery** (muscle-load 7d), wellness-trend + Z-score, pijn-locatiekaart,
  adherence %, cohort-analytics, **PDF-export**.
- **Wellness & pijn:** dagelijkse 5-punts check, NRS-pijn, 24–48u follow-up.
- **Rehab-protocollen:** fase-gebaseerd, stoplicht-criteria (R/O/G), auto-fase
  o.b.v. OK/blessuredatum, patiënt read-only.
- **Klinische assessments:** Mobility Assessment (Ready State-archetypes) +
  losse **clinicalTests** (toewijzen, resultaten loggen), suggested
  mobilizations.
- **Clinical Insight Engine (CIE):** automatische signalen (compliance, pijn,
  ACWR, wellness) met urgentie + follow-up/dismiss/snooze.
- **Shop/commerce:** eigen storefront, **intake-vragenlijst** met diagnose-
  matched aanbevelingen, orders, facturen, therapeut-revenue-share.
- **Practice/team:** multi-tenant, praktijk-profiel/branding, eigenaarschap,
  cohort.
- **Governance:** GDPR (soft-delete + grace), DPA-versies, **audit-logging
  (NEN 7513/Wabvpz)**, research-anonimisering + consent-tiers, MFA + backup-
  codes, feature-flags per therapeut.
- **Release-notes** pagina (eigen changelog).

---

## 3. Naast elkaar

| Capability | Prehab Pro | mbt-gym | Notitie |
|---|---|---|---|
| Oefeningenbibliotheek (omvang/productie) | ✅ ~3203, pro gefilmd | ◐ kleiner | Hun grootste asset |
| Patiënt-educatie content ("Teach") | ✅ ~411, in programma | ❌ | **Duidelijke gap** |
| Tests/assessments ("Measure") | ✅ ~78, in programma | ✅ assessments + clinicalTests | Wij apart, niet verenigd in builder |
| Oefening + educatie + test in één programma | ✅ | ❌ | **Kerninzicht / kans** |
| Drag-&-drop builder, Split/Day/Week | ✅ | ◐ workout/cardio-wizards | UX vergelijken |
| Templates-bibliotheek | ✅ | ✅ | Parity |
| "Request an Exercise" (crowdsourced) | ✅ | ❌ | Lichtgewicht idee |
| Tendinopathie-modus | ❌ | ✅ | Wij voor |
| ACWR / muscle-load / recovery | ❌ | ✅ | Wij voor |
| Wellness + Z-score | ❌ | ✅ | Wij voor |
| Clinical Insight Engine | ❌ | ✅ | Wij voor |
| Rehab-protocol stoplicht-tracker | ❌ | ✅ | Wij voor |
| Cohort-analytics + PDF-rapport | ❌ | ✅ | Wij voor |
| GDPR/DPA/audit/research-anonimisering | ❌ (geen NL-focus) | ✅ | Wij ver voor (NL/EU) |
| Seats / patiëntlimiet / overage-billing | ✅ | ❌ | Monetisatie-keuze |
| B2B2C premium consumenten-content + trials | ✅ | ◐ eigen shop ipv content-abo | Ander model |
| In-app changelog ("What's New") | ✅ | ✅ release-notes | Parity |
| Light/Dark mode | ✅ | ? | Checken |
| Multi-clinician team / multi-tenant | ✅ seats | ✅ practice | Andere insteek |

Legenda: ✅ aanwezig · ◐ deels · ❌ afwezig

---

## 4. Kansen — op onze manier

**Hoge waarde**

1. **Patiënt-educatie content-laag ("Teach"-equivalent).** Een bibliotheek met
   korte uitleg-/conditie-content die je náást oefeningen in een programma of
   weekschema kunt zetten. Past op onze patiënt-engagement (wellness, pijn,
   rehab read-only). Op onze manier: kort, evidence-based, NL-talig, eventueel
   gekoppeld aan diagnoses/rehab-protocollen i.p.v. losse YouTube-episodes.
2. **Verenig oefeningen + tests + educatie in de builder.** We hébben de drie
   bouwstenen (`exercises`, `clinicalTests`/`assessments`, + nieuwe educatie).
   Eén bibliotheek met type-filter (Beweeg / Leer / Meet) en alle drie als
   sleepbaar blok in een programma/weekschema is een relatief kleine maar
   krachtige UX-sprong.

**Middel**

3. **Builder-UX:** drag-&-drop + expliciete Split/Day/Week-modi naast onze
   wizards; "bouw vanuit template" prominenter.
4. **"Oefening aanvragen"** — lichtgewicht kanaal voor therapeuten om nieuwe
   oefeningen/tests aan te vragen; voedt de bibliotheek-groei zonder scraping.

**Strategisch (productbeslissing, geen quick win)**

5. **Seat-/abonnementsmodel** met patiëntlimieten en overage — als jullie naar
   bredere SaaS-monetisatie willen. Onze multi-tenant `Practice` is de basis.
6. **Care-Type-onderscheid** (managed vs. self-managed patiënt) als jullie ook
   een consument-/zelfstandige variant willen bedienen.

**Bewust niet kopiëren:** hun content (oefeningteksten, video's, educatie) en
hun grote bibliotheek-omvang als zodanig — daar zit hun investering/IP. Onze
groei van de bibliotheek doen we via eigen content, licenties of open bronnen.

---

## 5. Dekking / beperkingen van deze analyse

- Builder, Patients, provider-Settings: goed bekeken.
- **Team** (multi-seat): gated voor "Individual"-account, niet kunnen inzien.
- **Shop**: externe consumentenwinkel, buiten scope gelaten.
- Oefening-/test-detailpagina's bewust níét uitgediept (om geen content over
  te nemen) — alleen de aanwezigheid en het bibliotheek-model is genoteerd.
