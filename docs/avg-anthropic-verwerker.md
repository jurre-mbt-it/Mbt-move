# AVG — Anthropic als verwerker (AI-conceptteksten)

Status: **proces-deel van auditbevinding H1.** Het code-deel is gedaan (geen
naam/geboortejaar meer naar de API, zie `src/lib/ai/anthropic.ts`). Dit document
dekt de juridische/organisatorische kant die nog geregeld moet worden.

## Wat gaat er naar Anthropic?

De app roept de Anthropic API aan op drie plekken:

1. **Testrapport-concept** (`testReports.aiDraft`) — blessure/doel, fase,
   meetnummer en testwaarden (L/R, zones). **Geen naam, geen geboortejaar.**
2. **Hardloopanalyse-concept** (`runningAnalysis.aiDraft`) — doel + scores/hoeken
   + loopmetrics. **Geen naam, geen geboortejaar.**
3. **Shop-intake** (`shop.intakeRecommend`) — categorische keuzes (doel, regio,
   niveau…). Geen directe identificatoren.

Na de H1-fix is dit **pseudonieme** gezondheidsdata (bijzondere persoonsgegevens,
art. 9), niet direct herleidbaar. Dat verlaagt het risico sterk, maar Anthropic
blijft een **verwerker** (art. 28) en de data gaat naar de **VS** (art. 44-46).

## Wat moet er geregeld worden (checklist)

- [ ] **Verwerkersovereenkomst (DPA) met Anthropic afsluiten.**
      Anthropic biedt een Data Processing Addendum aan. Te regelen via je
      Anthropic-account (Console → org-instellingen / Legal) of via de commerciële
      overeenkomst. Bewaar een getekend exemplaar.
- [ ] **Zero Data Retention (ZDR) aanvragen.** Standaard kan Anthropic API-inputs/
      outputs een beperkte periode bewaren (trust & safety). Vraag een
      zero-retention-afspraak aan zodat er niets wordt bewaard. Verifieer de
      actuele voorwaarden en retentietermijn rechtstreeks bij Anthropic — neem het
      niet over uit deze tekst.
- [ ] **Doorgiftegrondslag VS vastleggen.** Anthropic's DPA bevat doorgaans
      Standard Contractual Clauses (SCC's). Controleer dat die van toepassing zijn
      en archiveer ze.
- [ ] **Opnemen in het verwerkingsregister** (art. 30) — zie conceptregel hieronder.
- [ ] **Privacyverklaring bijwerken** — zie concepttekst hieronder.
- [ ] **`ANTHROPIC_API_KEY`** hoort bij een account waarvoor bovenstaande geldt
      (niet een persoonlijk/los key).

## Concept — regel voor het verwerkingsregister

| Veld | Inhoud |
|---|---|
| Verwerker | Anthropic PBC (VS) |
| Doel | Genereren van concept-interpretatie/advies bij test- en hardloopanalyse-rapporten; programma-aanbeveling bij shop-intake |
| Categorieën betrokkenen | Patiënten/sporters; shop-bezoekers |
| Categorieën gegevens | Pseudonieme gezondheidsgegevens (blessure/doel, testwaarden, scores) — geen naam, geboortejaar of contactgegevens |
| Doorgifte | VS, op basis van SCC's (Anthropic DPA) |
| Bewaartermijn bij verwerker | Zero data retention (af te dwingen via ZDR-afspraak) |
| Grondslag | Uitvoering behandelovereenkomst + gerechtvaardigd belang; concept wordt altijd door de behandelaar geredigeerd |

## Concept — passage voor de privacyverklaring

> **AI-ondersteuning bij rapporten**
> Voor het opstellen van een eerste concepttekst bij test- en
> hardloopanalyse-rapporten gebruiken wij een AI-dienst (Anthropic). Wij sturen
> daarbij uitsluitend de meetgegevens en de blessure-/doelomschrijving mee, **niet
> je naam of geboortejaar**. De behandelaar controleert en bewerkt elk concept
> voordat je het ziet. Met Anthropic hebben wij een verwerkersovereenkomst en de
> afspraak dat deze gegevens niet worden bewaard.

(Pas de laatste zin pas aan/publiceer pas als de DPA + ZDR daadwerkelijk rond zijn.)

## Verantwoording

- Code-borging dat er geen naam/identifier meegaat: `src/lib/ai/anthropic.ts`
  (prompt-builders zonder `patientName`). Zie ook geheugen-principe
  "LLM de-identificatie".
- Elke AI-aanroep wordt server-side gelogd in `audit_logs` als `DATA_EXPORTED`
  met `target: anthropic` (zonder PII in de metadata).
