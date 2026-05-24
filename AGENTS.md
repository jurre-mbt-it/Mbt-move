<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Multi-tenant scope: wat *wel* en *niet* praktijk-gescheiden is

De app is multi-tenant via `User.practiceId`. De volgende objecten zijn
**gedeeld binnen een `Practice`** — niet per therapeut afgeschermd. Dit is
opzettelijk; documenteer hier áls je het wijzigt:

- **Exercises** — een oefening die therapeut A in praktijk X aanmaakt is
  zichtbaar voor alle collega's in dezelfde praktijk (via `exercises.list`
  filter). Geen ownership-check op `creatorId` voor reads.
- **Programs (templates)** — `isTemplate: true` programma's zijn
  praktijk-breed zichtbaar; assigned programma's zitten alleen bij de
  patiënt + treating-therapeuten.
- **Week-schedules** — owner is creator, maar collega-therapeuten in
  dezelfde praktijk kunnen ze lezen.

Wat *wél* per-therapeut/per-patient is afgeschermd:

- **Patiënt-data** (sessions, wellness, pain entries, assessments,
  rehab-trackers) — alleen behandelend therapeut + admin via
  `PatientTherapist`-relatie.
- **Insights / signalen** — gekoppeld aan patient × treating-therapist.
- **Audit-logs** — alleen admin.

Soft-delete (`User.deletedAt`) wordt automatisch afgedwongen op reads via
een Prisma client-extension in [`src/lib/prisma.ts`](src/lib/prisma.ts).
Escape-hatch: `where: { deletedAt: undefined }` (geen filter) of
`{ deletedAt: { not: null } }` (admin/cron flows).

DPA-acceptance is verplicht voor PATIENT/ATHLETE vóór ze patient-data
endpoints raken, server-side afgedwongen in
[`src/lib/auth/require-role.ts`](src/lib/auth/require-role.ts).
