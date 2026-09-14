# Atletengroepen deel 2: groepsdashboard — bouwplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Op de groepspagina per atleet één rij met de status in één oogopslag: geblesseerd, fris, vorm, deze week, laatste en volgende training, notitie; wie aandacht vraagt bovenaan.

**Architecture:** Een pure beoordelingsmodule `src/lib/group-dashboard.ts` (geblesseerd, aandacht, volgorde, tellers) met tests; een procedure `athleteGroups.dashboard` die per lid bestaande bouwstenen aanroept (`painEntry`, `computeReadinessFor`, `computeLoadCurve`, sessie- en cardiologs, geplande items) en het oordeel eraan geeft; een component `GroupDashboard` op het tabblad Dashboard van `GroupDetail`.

**Tech Stack:** zie deel 1. Geen migratie: alles komt uit bestaande tabellen.

## Global Constraints

Zelfde als deel 1 (`docs/superpowers/plans/2026-09-14-atletengroepen.md`). Geen nieuwe opslag; de notitie per lid bestaat al (`athlete_group_members.note`).

---

### Task 1: Pure beoordeling (`group-dashboard.ts`)

**Files:** Create `src/lib/group-dashboard.ts`, Test `src/lib/__tests__/group-dashboard.test.ts`.

**Interfaces (produces):** `LidInvoer`, `LidRij`, `beoordeelLid(invoer, vandaag)`, `sorteerRijen(rijen)`, `tellers(rijen)`, `isDonderdagOfLater(dateKey)`, `PIJN_DREMPEL = 4`.

Regels: geblesseerd = pijnmelding ≥ 4 in de laatste 7 dagen óf blessurenotitie op het profiel; aandacht = geblesseerd, readiness RED, overreaching (alleen als de belastingscurve geijkt is) of 0 gedaan bij ≥ 2 gepland vanaf donderdag; volgorde = aandacht eerst, dan naam.

- [x] Tests geschreven en groen (7), implementatie gecommit samen met Task 2.

### Task 2: Procedure `athleteGroups.dashboard`

**Files:** Modify `src/server/routers/athleteGroups.ts`.

Per lid parallel: pijnmeldingen 7 dagen, aantal vitals 14 dagen (0 = geen wearable), sessies en cardiologs deze week (`completedAt` tussen maandag en volgende maandag), laatste sessie en laatste cardiolog, weekschema's vanaf deze maandag tot 4 weken vooruit (gepland deze week, eerstvolgende training). Readiness via `computeReadinessFor(prisma, id)` alleen als er vitals zijn; vorm via `computeLoadCurve(prisma, id, 28)` (`today.form`, `status`, weekbelasting = som van de laatste 7 punten, `calibration.status`). Resultaat `{ vandaag, rijen, tellers }`, rol minimaal VIEWER.

- [x] Gebouwd; type-check groen.

### Task 3: `GroupDashboard` op het tabblad

**Files:** Create `src/components/groups/GroupDashboard.tsx`, Modify `src/components/groups/GroupDetail.tsx`.

Tellers (aandacht, geblesseerd, geen wearable), schakelaar "Alleen wie aandacht vraagt", tabel met acht kolommen; naam opent de atleetpagina, laatste krachtsessie opent de sessie, notitie slaat op bij verlaten van het veld via `setMemberNote`. Rijen met aandacht licht oranje.

- [x] Gebouwd; lint en type-check groen; commit `feat(groepen): groepsdashboard`.

### Task 4: Controle en oplevering

- [ ] Klikronde met ingelogde coach (zodra Jurre inlogt): dashboard met de testatleet, filter, notitie.
- [ ] Deploy samen met deel 1 na akkoord.
