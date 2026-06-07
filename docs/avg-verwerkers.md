# AVG — Verwerkers / sub-processors (mbt-gym)

Overzicht van externe diensten die persoonsgegevens verwerken namens MBT, voor
het **verwerkingsregister (art. 30)** en de **verwerkersovereenkomsten (art. 28)**.
De app verwerkt **bijzondere persoonsgegevens (gezondheid, art. 9)**, dus met elke
verwerker die daar toegang toe heeft hoort een getekende DPA, en doorgifte buiten
de EER mag alleen met geldige waarborgen (SCC's / adequaatheidsbesluit).

> Verifieer alle hieronder genoemde voorwaarden (regio, retentie, DPA-versie)
> rechtstreeks bij de leverancier. Deze tabel is een werkdocument, geen juridisch
> advies.

## Samenvatting

| Verwerker | Wat verwerkt het | Gezondheidsdata? | Regio / doorgifte | DPA | Actie |
|---|---|---|---|---|---|
| **Supabase** | Database, auth, storage — álle app-data | **Ja (kern)** | AWS eu-west-2 (Londen, UK — adequaat) | DPA beschikbaar | DPA tekenen |
| **Vercel** | Hosting, serverless compute, CDN, logs | Ja (in transit + functie-uitvoering) | VS-bedrijf; EER/regio-opties | DPA beschikbaar | DPA tekenen + SCC's |
| **Resend** | Transactionele e-mail | Ja (voornaam + programma in mail) | VS | DPA beschikbaar | DPA tekenen + SCC's |
| **Anthropic** | AI-conceptteksten (rapporten + intake) | Pseudoniem (geen naam/DOB na H1) | VS | DPA + ZDR | DPA + zero-retention |
| **Mollie** | Betalingen (alleen shop) | Nee (naam/adres/betaling koper) | EU (Nederland) | DPA beschikbaar | DPA tekenen |

> **Sentry (niet in gebruik):** de codebase bevat een Sentry-integratie, maar die
> is **niet geconfigureerd** (geen `SENTRY_DSN` in de omgeving) en dus inactief —
> geen verwerker op dit moment. Zet je Sentry ooit aan, voeg het dan hier toe en
> sluit een DPA af (overweeg een EER-data-region).

---

## Supabase — database, authenticatie, storage
- **Verwerkt:** alle persoonsgegevens van de app — gebruikers, behandelrelaties,
  sessielogs, pijn-/wellness-data, assessments, testrapporten, etc. Dit is de
  centrale opslag van de art. 9-gegevens.
- **Regio/doorgifte:** project draait op `aws-1-eu-west-2` (Londen, VK). Het VK
  heeft een EU-adequaatheidsbesluit, dus opslag daar is toegestaan zonder
  aanvullende SCC's. (Wil je strikt binnen de EER blijven, overweeg een
  EU-regio.)
- **Beveiliging in onze app:** RLS op alle public-tabellen; service-role key
  alleen server-side; auth via Supabase (OTP + TOTP-MFA).
- **Actie:** Supabase-DPA afsluiten/archiveren; regio vastleggen in het register.

## Vercel — hosting & compute
- **Verwerkt:** alle inkomende requests (dus persoonsgegevens in transit),
  serverless functie-uitvoering, en platform-/functielogs.
- **Regio/doorgifte:** Vercel is een VS-bedrijf; biedt een DPA met SCC's en
  (afhankelijk van plan) keuze van executie-regio. Let op: standaard kunnen
  functielogs requestdata bevatten.
- **Actie:** Vercel-DPA afsluiten; SCC's archiveren; controleer dat er geen
  patiënt-PII in platformlogs terechtkomt (onze app logt bewust geen PII).

## Resend — transactionele e-mail
- **Verwerkt:** ontvanger-e-mailadres, **voornaam van de patiënt**, programmanaam,
  eventuele therapeut-instructies en invite-/toegangscodes (zie
  `src/app/api/email/send/route.ts` en `src/server/mail.ts`).
- **Regio/doorgifte:** VS-bedrijf; DPA met SCC's beschikbaar.
- **Actie:** Resend-DPA afsluiten + SCC's archiveren. Overweeg de hoeveelheid
  persoonsgegevens in mails minimaal te houden.

## Anthropic — AI-conceptteksten
- **Verwerkt:** blessure/doel, fase, testwaarden/scores (test- en
  hardloopanalyse) en categorische intake-keuzes. **Geen naam, geen geboortejaar**
  (geborgd in `src/lib/ai/anthropic.ts` — auditbevinding H1). Dit is pseudonieme
  gezondheidsdata.
- **Regio/doorgifte:** VS. Anthropic biedt een DPA (met SCC's) en Zero Data
  Retention voor in aanmerking komende klanten.
- **Actie:** DPA afsluiten; **zero-retention aanvragen**; doorgiftegrondslag
  (SCC's) archiveren. Elke aanroep wordt server-side gelogd als `DATA_EXPORTED`
  (`target: anthropic`, zonder PII in de metadata).

## Mollie — betalingen (alleen shop)
- **Verwerkt:** naam, e-mail, betaal- en (bij fysieke orders) adresgegevens van
  kopers in het consumenten-shop-gedeelte. **Geen** klinische patiëntdata.
- **Regio/doorgifte:** EU (Nederland) — geen derde-land-doorgifte.
- **Actie:** Mollie-DPA afsluiten/archiveren.

---

## Checklist
- [ ] DPA getekend + gearchiveerd: Supabase, Vercel, Resend, Anthropic, Mollie
- [ ] SCC's gearchiveerd voor de VS-verwerkers (Vercel, Resend, Anthropic)
- [ ] Anthropic: zero-retention-afspraak rond
- [ ] Alle bovenstaande opgenomen in het verwerkingsregister (art. 30)
- [ ] Privacyverklaring noemt de categorieën verwerkers (zie concepttekst hieronder)
- [ ] Datalokatie per dienst vastgelegd (regio's)

## Concept — regel verwerkingsregister (voorbeeld: Anthropic)

| Veld | Inhoud |
|---|---|
| Verwerker | Anthropic PBC (VS) |
| Doel | Concept-interpretatie/advies bij rapporten; programma-aanbeveling shop-intake |
| Categorieën gegevens | Pseudonieme gezondheidsgegevens (blessure/doel, testwaarden) — geen naam/geboortejaar/contact |
| Doorgifte | VS, op basis van SCC's (Anthropic DPA) |
| Bewaartermijn | Zero data retention (af te dwingen via ZDR) |
| Grondslag | Uitvoering behandelovereenkomst; concept altijd door behandelaar geredigeerd |

Maak een vergelijkbare regel voor Supabase, Vercel, Resend en Mollie.

## Concept — passage privacyverklaring

> **Externe diensten (verwerkers)**
> Voor het leveren van de app werken wij met zorgvuldig geselecteerde
> dienstverleners die in onze opdracht gegevens verwerken: voor hosting en opslag
> (Supabase, Vercel), voor e-mail (Resend), voor AI-ondersteunde concepten bij
> rapporten (Anthropic) en voor betalingen in onze shop (Mollie). Met elk van hen
> hebben wij een verwerkersovereenkomst. Voor de AI-concepten sturen wij
> uitsluitend meetgegevens en de blessure-/doelomschrijving mee, **niet je naam of
> geboortejaar**, en de behandelaar controleert elk concept.

(Publiceer de zinnen over specifieke afspraken pas als de betreffende DPA's rond zijn.)

## Verantwoording in code
- Geen naam/identifier naar Anthropic: `src/lib/ai/anthropic.ts`.
- Geen PII in audit-logs: `src/server/audit.ts`.
- Service-role key alleen server-side; RLS op alle public-tabellen.
