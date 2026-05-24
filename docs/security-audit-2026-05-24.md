# Security Audit — 2026-05-24

**Scope:** brede sweep van authorisatie, object-access (IDOR), API-routes, en
auth-flows. Aanleiding: een ATHLETE (Jamie Rijff) belandde in de
therapeut-shell na invite-redeem (rol-segment layouts hadden geen server-side
guard). Die specifieke bug is op 2026-05-24 gefixt in commit `d8e9c9b`.

**Methode:** vier parallelle scan-passes (tRPC-procedures, route-handlers +
page-guards, IDOR/object-access, auth-flows). Findings handmatig
gecross-checkt op file/line voordat ze hier landden. Wat agents oorspronkelijk
HIGH noemden is in een paar gevallen teruggebracht naar MEDIUM/LOW na review.

**Eindscore:**

| Severity | Aantal |
|---|---|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 3 |
| LOW / INFO | 5+ |

Geen kritieke lekken in de production-code. Wel twee AVG-relevante gaps die
prioriteit verdienen.

---

## HIGH

### H1 — Soft-delete (`deletedAt`) wordt niet afgedwongen in patient-reads

**Locatie:** [src/server/routers/patients.ts:74](src/server/routers/patients.ts#L74) (`patients.list`) — en alle andere `findMany`/`findFirst`/`findUnique` calls op `User` waar `deletedAt` niet als filter aanwezig is.

**Wat het is:** Het `User`-model heeft een `deletedAt`-kolom + `deletionRequestedAt` voor AVG art. 17 (right-to-be-forgotten). De [GDPR-cron-cleanup](src/app/api/cron/gdpr-cleanup/route.ts) verwijdert na een 30-dagen grace-period definitief, maar in die window zijn de rows nog aanwezig en worden ze in lijsten getoond.

**Concreet:**
```ts
// patients.ts:74 — deletedAt staat NIET in de WHERE-clausule
const patients = await ctx.prisma.user.findMany({
  where: {
    role: { in: ['PATIENT', 'ATHLETE'] },
    OR: [ { patientTherapists: { some: { ... } } }, ... ],
    // ⚠ Mist: deletedAt: null
  },
  ...
})
```

**Risico:** Patiënt die "vergeet-mij" heeft aangevraagd, blijft 30 dagen zichtbaar in de patient-lijst van de behandelende therapeut. Voor sessionLogs en programs (die soft-delete via cascade krijgen na 30 dagen) geldt hetzelfde tijdens de grace-period.

**Aanbeveling:** Twee opties:
- **Per-query**: voeg `deletedAt: null` toe aan elke `findMany/findFirst/findUnique` op `User` (en `Program`, `SessionLog`) die niet expliciet ook deleted rows wil. Eenvoudig maar foutgevoelig (vergeet-bug).
- **Prisma-client-extension** (aanbevolen): wrap de client in een extension die `deletedAt: null` als default toevoegt aan reads op modellen met soft-delete. Patroon: zie Prisma `$extends({ query: { ... } })`. Daarmee is het centraal afgedwongen en kun je opt-out met een expliciete `includeDeleted: true`.

Gerelateerd om in dezelfde sweep mee te nemen: [audit.ts](src/server/routers/admin.ts) waar admin lists alle users laat zien — die mag wel `deletedAt` includen (admin-context).

---

### H2 — DPA-acceptance wordt client-side gehandhaafd, niet server-side

**Locatie:** [src/lib/auth/post-login-redirect.ts:76-78](src/lib/auth/post-login-redirect.ts#L76)

**Wat het is:** Patiënten en atleten moeten een Verwerkings­overeenkomst (DPA) accepteren vóór ze patient-data zien. De huidige check zit in de **client-side** post-login redirect:

```ts
if (!isStaff && !info.dpaAccepted) {
  return '/onboarding/dpa'
}
```

Een gebruiker die deze redirect omzeilt (direct `/patient/dashboard` typen of een bookmark openen) komt in de app zonder DPA-acceptance. De server controleert het verder nergens.

**Risico:** AVG-conformiteit. DPA is volgens jullie pilot-compliance ([project_pilot_compliance](memory)) een vastgesteld document; verwerking zonder geaccepteerde DPA is een art. 26 / art. 28 issue.

**Aanbeveling:**
- Server-side: in [`require-role.ts`](src/lib/auth/require-role.ts) een vlag toevoegen die `dpaAcceptedVersion` checkt voor PATIENT/ATHLETE en bij missend acceptance `redirect('/onboarding/dpa')`.
- tRPC: een `dpaRequiredProcedure` toevoegen voor patient-data-write/read-procedures op patient-rol, idem voor therapist-rol die patient-data schrijft.
- Of: een lichte middleware-extension die op elke protected-procedure de DPA-status checkt en bij `null` een 412-precondition-failed teruggeeft.

---

## MEDIUM

### M1 — `weekSchedules.save`: ownership-check vertrouwt op de input bij re-assignment

**Locatie:** [src/server/routers/weekSchedules.ts:151-176](src/server/routers/weekSchedules.ts#L151)

**Wat het is:** Bij update wordt `findFirst({ where: { id, creatorId: ctx.user.id } })` gedaan — goed. Maar de input mag een `patientId` bevatten; die wordt later los gevalideerd via `assertPatientLink`. Volgorde-fragiliteit: als die helper ooit per ongeluk wordt verwijderd of skipt, kan een week-schedule worden hertoegewezen aan een patiënt waarvoor de therapeut géén relatie heeft.

**Aanbeveling:** Laad het bestaande record op, vergelijk met de ingestuurde wijzigingen, en check zowel `creatorId` als de **nieuwe** `patientId` in één assertion. Maakt de invariant lokaal in plaats van verspreid.

---

### M2 — Open-redirect regex toelaatbaar maar niet streng

**Locatie:** [src/lib/auth/post-login-redirect.ts:24-27](src/lib/auth/post-login-redirect.ts#L24)

**Wat het is:** `isSafeNext()` test `/^\/[^/\\]/` — blokkeert protocol-relative URLs (`//evil.tld`) en backslash-schema's. Edge cases als `/ space-prefixed-path` slipen er nog doorheen, maar Next.js zelf is daar restrictief in.

**Aanbeveling:** Defense-in-depth: strenger maken naar bv. `/^\/[a-zA-Z0-9_\-./?&=#]+$/` (alphanum + URL-safe chars) of whitelist bekende paden. Niet acuut, wel netter.

---

### M3 — Invite-race: twee concurrent `request`-calls op zelfde invite

**Locatie:** [src/server/routers/invite.ts:432-447](src/server/routers/invite.ts#L432)

**Wat het is:** `invite.request` zoekt op `usedAt: null`, increment attempts en triggert Supabase OTP-send. Twee browsers kunnen tegelijk verzoeken doen — beide sturen een OTP-email.

**Risico:** Geen security-impact (attacker zou email-access nodig hebben om OTP te kapen), wel **UX-irritatie** + risico op verwarrende dubbele codes. Reguliere rate-limit dekt het wel op grotere schaal.

**Aanbeveling:** Optimistic lock met `prisma.inviteCode.updateMany` waarbij `where: { id, usedAt: null }` en de update increment de attempt. Atomair. Tweede call vindt 0 rows en abort.

---

## LOW / INFO

- **I1** — Oefeningen worden gedeeld binnen `practiceId`-scope. Therapeut A ziet oefeningen die collega B aanmaakte voor diens patiënt C. Waarschijnlijk intentioneel (jullie hele tenant-model is per practice), maar documenteer dit expliciet — anders is het een onverwacht "leak" voor outsiders.
- **I2** — **83 tRPC-procedures** doorgenomen op procedure-gating (`protectedProcedure` vs `therapistProcedure` vs `mfaTherapistProcedure` etc.) — **geen mismatches**. Patroon is consistent toegepast.
- **I3** — **8 route-handlers** onder `src/app/api/*` en `src/app/print/*` doorgenomen — alle hebben correcte auth + role-check + (waar van toepassing) ownership-check via `actorCanSeePatient` / `actorIsTreating`.
- **I4** — Auth-flow audit:
  - ✓ Invite-tokens single-use, 24h TTL, max 5 pogingen, rate-limited per email + per therapeut
  - ✓ MFA-backup codes opgeslagen als hash, single-use afgedwongen via `usedAt`
  - ✓ Account-takeover via email-change mitigatie in [`src/server/trpc.ts:37-75`](src/server/trpc.ts#L37) `resolveUser` — high-value-rollen (THERAPIST/ADMIN) weigeren email-fallback backfill
  - ✓ Soft-delete cron heeft 30-dagen grace, audit-logt elke definitieve verwijdering, faalt veilig bij Supabase-uitval
- **I5** — Prisma bypasst Postgres RLS — bekend, gedocumenteerd in memory `project_rls_prisma_role`. Geen actie hier, follow-up tracked.

---

## Aanbevolen volgorde

1. **H1** + **H2** als hoogste prioriteit (AVG-relevant, en H1 is een echte data-zichtbaarheids-gap).
2. **M1** in dezelfde sessie als refactor van weekSchedules.
3. **M2** + **M3** in onderhouds-PR — kleine, geïsoleerde fixes.
4. **I1** documenteren in CLAUDE.md / AGENTS.md zodat het niet later als bug wordt aangedragen.

Wanneer H1/H2 gefixt zijn raad ik aan deze audit te herhalen — vooral op nieuwe routers/api-routes die sindsdien zijn toegevoegd.
