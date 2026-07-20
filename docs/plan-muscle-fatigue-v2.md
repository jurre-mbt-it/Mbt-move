# Plan — Muscle Fatigue Engine v2 (science-backed, cardio-aware)

**Status:** approved direction, ready for execution by Opus 4.8
**Author of plan:** analysis session 2026-07-20
**Repo:** `/Users/eva/mbt-gym` (web). iOS is an explicit follow-up, NOT in this plan.
**DB migrations required:** NONE. Read section 1.4 before doubting this.

---

## 0. Why we are doing this

The current per-muscle system has three problems:

1. **It is orphaned.** The `RecoveryPanel` + `BodyFigure` heatmap and the
   `patient.getRecoverySessions` endpoint that feeds them are not rendered on
   any page. `getRecoverySessions` is only ever `.invalidate()`-d, never
   `.useQuery()`-d. Patients currently see no per-muscle fatigue at all.
   (Superseded by `WeeklyTrendChart` during the load-curve rework.)

2. **The model is physiologically weak.** `src/lib/recovery-estimation.ts`:
   - keeps only the **most recent** stimulus per muscle → two hard quad
     sessions in three days do not stack.
   - decays recovery **linearly** to a deadline → real recovery is
     front-loaded (roughly exponential).
   - has no concept of **eccentric / lengthened-position muscle damage**,
     which is the dominant driver of how long a muscle stays sore.

3. **Cardio contributes zero muscle load.** `getRecoverySessions` queries
   `sessionLog` only. `CardioLog` has no path into muscle fatigue. A long run
   should load the legs; today it does not.

**Goal:** one shared per-muscle *dose* function, an accumulating
exponential-decay fatigue model, cardio feeding the legs modality-weighted,
surfaced as a per-muscle-group **status list** (no anatomy figure — see
Phase 2 for that decision).

**Non-goals (do NOT touch):**
- The whole-body TSB / load-curve / sRPE system (`training-load.ts`,
  `load-curve.ts`). It is healthy and shipped. Muscle fatigue is a separate
  layer; do not merge them.
- ACWR. Leave it as the silent trend number it already is.
- iOS. Follow-up plan, section 8.

---

## 1. The model

### 1.0 Muscle regions — the authoritative vocabulary (NEW, supersedes the 22 groups)

**Decision (2026-07-20, Jurre):** exercises are tagged against a fixed set of
**muscle regions**, not the old 22 granular groups. These regions are the
`muscleLoads` keys, the exercise-form options, the engine's per-region τ, and
the status-list rows — one vocabulary end to end. This replaces both
`MUSCLE_GROUPS` (the 22-group list in `exercise-constants.ts`) and the
`DISPLAY_GROUPS` idea from earlier drafts.

**The 12 regions** (`MUSCLE_REGIONS`, top-to-bottom order for the UI):

```
Nek · Schouders · Borst · Armen · Bovenrug · Core · Onderrug ·
Glutes · Quadriceps · Hamstrings · Onderbeen · Voeten
```

Jurre gave 11 (Nek, Schouders, Armen, Bovenrug, Onderrug, Glutes, Core,
Quadriceps, Hamstrings, Onderbeen, Voeten). **`Borst` was added** so chest
exercises (bench, push-up, dip, chest press) have a home — without it they
would be untaggable. If Jurre wants Borst merged elsewhere, it is a one-line
change; until told otherwise, ship 12.

`Armen` intentionally merges biceps + triceps + forearms (Jurre's
simplification — arm detail is not clinically tracked here). `Nek` and `Voeten`
are new, useful for neck/foot rehab.

**Migration map — old 22 group → new region** (drives the data backfill in
Phase 0.5). Where two old muscles collapse into one region, the region's load =
**max** of the members:

| old group | → region |
|-----------|----------|
| Quadriceps | Quadriceps |
| Adductoren | Quadriceps |
| Hamstrings | Hamstrings |
| Glutes | Glutes |
| Abductoren | Glutes |
| Calves | Onderbeen |
| Tibialis anterior | Onderbeen |
| Intrinsieke voetspieren | Voeten |
| Core | Core |
| Hip flexors | Core |
| Onderrug | Onderrug |
| Bovenrug | Bovenrug |
| Lats | Bovenrug |
| Borst | Borst |
| Schouders anterieur / lateraal / posterieur | Schouders |
| Rotatorcuff | Schouders |
| Biceps / Triceps / Onderarmen | Armen |
| Diepe halsflexoren | Nek |

Everywhere below that says "muscle" / `MuscleGroup` now means "region" /
`MuscleRegion`. The τ table (1.2) and cardio profiles (1.4) are already written
in region terms.

### 1.1 Per-muscle dose (strength)

For each logged strength exercise-instance (one `exerciseLog` row):

```
muscleDose(muscle) = involvement × sets × intensityFactor × damageFactor × painFactor
```

- **involvement** = `muscleLoads[muscle]` (1–5), the therapist/auto value.
  Skip muscles with involvement ≤ 0. Mobility exercises already resolve to
  `{}` via `muscleLoadsRecord()` → contribute nothing. Keep that.
- **sets** = `exerciseLog.sets` (fallback 3 if null).
- **intensityFactor** — proximity to failure is the main fatigue driver
  (Zourdos RIR scale; Refalo 2023 proximity-to-failure meta). Prefer RPE;
  fall back to rep zone.

  ```
  if rpe present:  intensityFactor = clamp(0.55 + 0.09 × (rpe − 5), 0.4, 1.3)
                   // rpe5→0.55, rpe7→0.73, rpe10→1.0(→ actually 0.55+0.45=1.0)… see table
  else (rep zone from reps + repUnit, reuse classifyTrainingZone logic):
                   strength→0.95, hypertrophy→0.85, strength_endurance→0.7, endurance→0.55
  ```
  Exact RPE table (use this, do not re-derive):
  | rpe | 5 | 6 | 7 | 8 | 9 | 10 |
  |-----|---|---|---|---|---|----|
  | factor | 0.55 | 0.64 | 0.73 | 0.82 | 0.91 | 1.00 |
  Below rpe 5 clamp to 0.4 floor via `0.55 + 0.09×(rpe−5)`.

- **damageFactor** — eccentric / long-muscle-length damage drives the slowest
  recovery and most DOMS (Nosaka; Proske & Morgan 2001). Derived, not stored.
  See 1.3.
- **painFactor** — rehab guardrail. `painLevel > 5 ? 1 + (painLevel − 5) × 0.08 : 1`
  (pain 10 → ×1.4). Keeps the intent of the old `painAddHours`.

### 1.2 Accumulation with exponential decay

Each dose is a fatigue impulse. Current fatigue for a muscle:

```
L(muscle) = Σ_i  muscleDose_i × exp( −Δt_i / τ_i )
```

- `Δt_i` = hours since that session completed.
- `τ_i` = recovery time constant (hours), muscle-size based, stretched by
  damage:

  ```
  τ_i = τ_base(muscle) × (0.8 + 0.2 × damageFactor_i)
  ```

  `τ_base` by **region** (hours):

  | region | τ_base | tier |
  |--------|--------|------|
  | Quadriceps | 40 | large |
  | Hamstrings | 40 | large |
  | Glutes | 40 | large |
  | Borst | 40 | large |
  | Bovenrug | 40 | large |
  | Onderrug | 36 | large-ish |
  | Onderbeen | 28 | medium |
  | Core | 28 | medium |
  | Schouders | 28 | medium |
  | Armen | 24 | medium-small |
  | Nek | 24 | medium-small |
  | Voeten | 18 | small |

  Define as an explicit `Record<MuscleRegion, number>` covering all 12 regions;
  a unit test asserts every `MUSCLE_REGIONS` entry has a τ_base (no default
  fallback needed — the set is closed).

### 1.3 damageFactor (the science piece), derived from Exercise metadata

Pure function of fields **already on `Exercise`**: `movementPattern`,
`loadType`, `category`, plus the log's `repUnit`. No DB column, no schema
migration. Mirrors how `src/lib/strain-estimation.ts` already reads these enums.

```
base by movementPattern:
  HINGE            1.30   // RDL, Nordic — long length + eccentric
  LUNGE            1.25
  SQUAT            1.15
  ISOLATION_LOWER  1.10   // leg curl / leg extension
  HIP_THRUST       1.00
  PUSH_HORIZONTAL  1.00
  PUSH_VERTICAL    1.00
  PULL_HORIZONTAL  1.00
  PULL_VERTICAL    1.00
  CALF_RAISE       1.05
  ROTATION         0.95
  ISOLATION_UPPER  1.00
  CARRY            0.90
  CORE             0.90
  FULL_BODY        1.05
  (null pattern)   1.00

modifiers (multiplicative):
  repUnit === 'sec'  (isometric hold)     × 0.55   // ISO ≈ minimal damage; supports tendinopathy ISO flow
  category === 'PLYOMETRICS'              × 1.20   // high eccentric + impact
  loadType === 'BODYWEIGHT'               × 0.90
  category === 'MOBILITY'                 → dose already 0 upstream (no-op here)

clamp final damageFactor to [0.5, 1.6]
```

**Rationale to keep in the code comment (short, per tone-of-voice: no fluff):**
eccentric contractions at long muscle length cause the most damage and slowest
recovery; isometrics cause the least. This is why an RDL costs more recovery
per set than a leg press, and why the daily tendinopathy ISO's should barely
register.

### 1.4 Cardio → muscle (modality-weighted)

Each `CardioLog` produces leg-dominant (or modality-appropriate) doses using
the SAME `L`/`τ` accumulator, so it naturally reads as "a little" for an easy
ride and "meaningful" for a long run.

```
cardioMuscleDose(muscle) = profileWeight(activity, muscle)
                         × durationFactor × intensityFactor × cardioDamageFactor(activity)
```

- **durationFactor** = `clamp(durationMin / 30, 0.3, 3)` (30 min = 1.0).
  Duration source: `CardioLog.durationSec` (confirm exact field name when
  implementing; use the logged duration, fall back to plannedDurationSec).
- **intensityFactor** — reuse RPE table from 1.1 if `CardioLog.rpe` present;
  else derive from HR zone if available; else default 0.6 (easy-moderate).
- **cardioDamageFactor** by activity:
  | activity | factor | note |
  |----------|--------|------|
  | RUNNING | 1.30 | impact + eccentric |
  | STAIRCLIMBER | 1.00 | |
  | ROWING | 0.90 | legs + back |
  | WALKING | 0.80 | |
  | CROSSTRAINER | 0.70 | low impact |
  | SKIERG | 0.70 | upper-dominant |
  | CYCLING | 0.60 | concentric |
  | WATTBIKE | 0.60 | |
  | ASSAULT_BIKE | 0.60 | |
  | SWIMMING | 0.60 | |
  | OTHER | 0.70 | generic |

- **profileWeight** — region → weight (involvement-equivalent units). Define
  as `Partial<Record<MuscleRegion, number>>` per activity; regions absent = 0.

  | activity | profile (region: weight) |
  |----------|--------------------------|
  | RUNNING | Quadriceps 2, Hamstrings 2, Onderbeen 2.5, Glutes 1.5, Core 1 |
  | WALKING | Quadriceps 1, Onderbeen 1, Glutes 1, Hamstrings 0.5 |
  | CYCLING | Quadriceps 2.5, Glutes 1.5, Onderbeen 1, Hamstrings 1 |
  | WATTBIKE | Quadriceps 2.5, Glutes 1.5, Onderbeen 1, Hamstrings 1 |
  | ASSAULT_BIKE | Quadriceps 2, Glutes 1.5, Onderbeen 1, Hamstrings 1, Armen 0.5, Schouders 0.5 |
  | CROSSTRAINER | Quadriceps 2, Glutes 1.5, Hamstrings 1, Onderbeen 1 |
  | ROWING | Quadriceps 2, Glutes 1.5, Hamstrings 1, Bovenrug 1.5, Core 1, Armen 0.5 |
  | SKIERG | Bovenrug 1.5, Armen 1, Core 1.5 |
  | STAIRCLIMBER | Quadriceps 2, Glutes 2, Onderbeen 1.5, Hamstrings 1 |
  | SWIMMING | Bovenrug 1.5, Schouders 1, Core 1 |
  | OTHER | Quadriceps 1, Core 0.5 |

  τ for cardio doses: use `τ_base(region) × (0.8 + 0.2 × cardioDamageFactor)`,
  same formula as strength.

### 1.5 Fatigue → recovery percent (UI value)

```
recoveryPercent(muscle) = clamp( 100 × (1 − L(muscle) / L_FULL), 0, 100 )
L_FULL = 18   // one very hard primary-muscle session pins near 0; tune via 1.6
```

Status thresholds (keep continuity with current UI semantics):
```
recoveryPercent ≥ 80  → 'recovered'
recoveryPercent ≥ 45  → 'recovering'
else                  → 'fatigued'
```

Only surface muscles with any stimulus in the **last 7 days** (query window),
same as today.

### 1.6 Calibration — worked examples Opus MUST verify against

Implement, then confirm the engine produces these (±3 percentage points).
These are the acceptance tests. `now` = session completedAt + Δt.

Assume τ as tabled, L_FULL = 18.

1. **Heavy squat day, just finished.** Quadriceps involvement 4, 4 sets,
   rpe 8 (0.82), SQUAT damage 1.15, no pain. Δt = 2h.
   dose = 4×4×0.82×1.15 = 15.09. τ = 40×(0.8+0.2×1.15)=41.2.
   L = 15.09 × exp(−2/41.2) = 14.38 → recoveryPercent = 100×(1−14.38/18) = **20% (fatigued).** ✓
2. **Same squat, 48h later.** L = 15.09 × exp(−48/41.2) = 15.09×0.312 = 4.71
   → **74% (recovering).** ✓ (linear model would already call this recovered)
3. **Two hard hamstring sessions 3 days apart** (RDL, HINGE damage 1.30,
   involvement 4, 3 sets, rpe 8=0.82). Each dose = 4×3×0.82×1.30 = 12.79.
   τ = 40×(0.8+0.2×1.3)=42.4. Session A 72h ago, session B 0h ago.
   L = 12.79×exp(−72/42.4) + 12.79 = 12.79×0.183 + 12.79 = 2.34+12.79 = 15.13
   → **16% (fatigued).** ✓ Stacking works (old model would show only B).
4. **Isometric wall-sit (tendinopathy ISO).** Quadriceps involvement 3,
   3 sets, repUnit 'sec', 45s hold, rpe 6 (0.64). damage: SQUAT 1.15 × 0.55 (ISO)
   = 0.63. dose = 3×3×0.64×0.63 = 3.63. Δt=2h, τ=40×(0.8+0.2×0.63)=37.0.
   L = 3.63×exp(−2/37)=3.44 → **81% (recovered).** ✓ ISO barely registers.
5. **Easy 30-min cycle, rpe 3.** Quadriceps: profile 2.5, durationFactor 1.0,
   intensity: rpe3 → 0.55+0.09×(3−5)=0.37→clamp 0.4, cardioDamage 0.60.
   dose = 2.5×1.0×0.4×0.6 = 0.60. Δt=2h → L≈0.57 → **97% (recovered).** ✓
   Negligible, as intended.
6. **Hard 60-min run, rpe 7.** Onderbeen: profile 2.5, durationFactor 2.0,
   intensity 0.73, cardioDamage 1.30. dose = 2.5×2.0×0.73×1.30 = 4.75.
   Quadriceps: 2×2.0×0.73×1.30 = 3.80. Δt=2h.
   Onderbeen τ=28×(0.8+0.2×1.3)=29.7 → L≈4.44 → **75% (recovering).**
   Quads τ=41.2 → L≈3.62 → **80% (recovered/border).** ✓ Running loads the
   legs meaningfully; more than cycling. Exactly the requested behaviour.

If any example is off by >3pp, the constants or formula wiring is wrong — fix
before proceeding. Encode all six as unit tests (section 4, Phase 0).

---

## 2. Files — what to create and change

Phased so each phase compiles and is independently verifiable. Do phases in
order. After each phase: `npx tsc --noEmit` must be clean and `npm run lint`
must pass.

### Phase 0 — the engine + tests (pure, no UI, no DB)

**Create `src/lib/muscle-fatigue.ts`** — the whole model. Exports:
```ts
export type MuscleFatigueStatus = 'recovered' | 'recovering' | 'fatigued'

export interface StrengthStimulus {
  muscleLoads: Record<string, number>
  sets: number
  reps: number
  repUnit: string
  completedAt: Date
  rpe?: number
  painLevel?: number
  // exercise metadata for damageFactor:
  movementPattern?: string | null
  loadType?: string | null
  category?: string | null
}

export interface CardioStimulus {
  activity: string          // CardioActivity
  durationMin: number
  completedAt: Date
  rpe?: number
  hrZone?: number | null    // optional, if present prefer over default
}

export interface MuscleFatigueState {
  muscle: MuscleGroup
  recoveryPercent: number   // 0-100
  fatigueLoad: number       // raw L, for debugging/tooltips
  status: MuscleFatigueStatus
}

export function computeMuscleFatigue(
  strength: StrengthStimulus[],
  cardio: CardioStimulus[],
  now?: Date,
): MuscleFatigueState[]

// exported helpers (also used by program builder + tests):
export function strengthMuscleDose(s: StrengthStimulus, muscle: string): number
export function cardioMuscleDoses(c: CardioStimulus): Record<string, number>
export function damageFactor(input): number
export function tauFor(muscle: string, damage: number): number
```
Put every constant table from section 1 here as named `const` objects. Define
`MUSCLE_REGIONS` (the 12 regions, section 1.0) and
`MUSCLE_TAU_BASE: Record<MuscleRegion, number>` covering all 12. `MuscleRegion`
is the union type; it lives in (or is re-exported from)
`src/lib/exercise-constants.ts` since the exercise form and seed data use it too
(see Phase 0.5).

Keep `getMuscleFatigueColor(percent)` + `getMuscleFatigueLabel(percent)` here
too — colours per section 6 (iOS brand tokens).

**Create `src/lib/__tests__/muscle-fatigue.test.ts`** — encode the six worked
examples from 1.6 as assertions, plus:
- a test asserting every region in `MUSCLE_REGIONS` has a `τ_base` entry (12/12).
- a test that MOBILITY / involvement-0 regions produce no state.
- a monotonicity test: same stimulus, larger Δt → higher recoveryPercent.

**Test runner:** the repo has **no test runner configured** (no vitest/jest in
package.json). Add vitest as a devDependency and a `"test": "vitest run"`
script. Config: `vitest.config.ts` with `environment: 'node'` (pure functions,
no DOM). Keep it minimal — this is the first test in the repo, do not drag in a
big setup. If adding a runner is considered scope-creep at execution time,
fall back to a `src/lib/muscle-fatigue.selfcheck.ts` script run via
`npx tsx` that throws on mismatch, and note it — but vitest is preferred.

### Phase 0.5 — Muscle-region tagging vocabulary + existing-exercise audit

This moves exercise tagging from the 22 granular groups to the 12 regions
(section 1.0). It must land **before Phase 1** so the endpoint reads
region-keyed `muscleLoads`. No Prisma **schema** migration (the
`muscle_loads.muscle` column stays `String`); there is one **data backfill** of
existing rows.

1. **Vocabulary.** In `src/lib/exercise-constants.ts` replace `MUSCLE_GROUPS`
   (22) with `MUSCLE_REGIONS` (the 12, section 1.0 order) and the
   `MuscleRegion` type. Grep every consumer of `MUSCLE_GROUPS` / `MuscleGroup`
   and update: `MuscleLoadSliders.tsx`, `ExerciseForm.tsx`, `MuscleBalancePanel`
   `MUSCLE_PAIRS`, `programs/types.ts`, `exercises.ts`, seed files, and the
   mobile read-only display later (section 8). List found here:
   `grep -rn "MUSCLE_GROUPS\|MuscleGroup" src prisma`.

2. **Exercise form UI.** `MuscleLoadSliders.tsx` now renders 12 region sliders
   (1–5). Keep the "primary/secondary" auto-estimate. Order them per
   `MUSCLE_REGIONS`.

3. **Auto-estimator.** `src/lib/strain-estimation.ts` maps `movementPattern` →
   muscles via `MOVEMENT_MUSCLES` (22) and `BODY_REGION_MUSCLES`. Rewrite both
   to output **regions**. This is mechanical: apply the section-1.0 migration
   map to the existing targets (e.g. a SQUAT that hit Quadriceps/Glutes/Core
   still hits those regions; a PULL that hit Lats now hits Bovenrug). Keep the
   primary=3/secondary=2 + modifier logic.

4. **Data backfill (existing exercises).** Write
   `scripts/migrate-muscle-loads-to-regions.ts` (Prisma, one-off, follows the
   pattern of other `scripts/*.ts`; DB access per the repo's DIRECT_URL setup).
   For each `Exercise`: read its `muscle_loads` rows, map each `muscle` through
   the section-1.0 table to a region, collapse to region → **max** member load,
   then replace the rows (respect `@@unique([exerciseId, muscle])`). Idempotent:
   running twice yields the same 12-region rows. Log a summary
   (exercises touched, rows before/after).

5. **Audit "adjust if needed".** After the backfill, cross-check each exercise:
   recompute the region estimate from `strain-estimation` (step 3) and compare
   to the collapsed values; **log** exercises where they diverge by ≥2 on any
   region or where the backfill produced an empty map, into a
   `muscle-loads-audit.json` for Jurre/therapist review. Do NOT silently
   overwrite therapist-set loads — the audit is a review list, not an
   auto-fix. (This is the "geevalueerd en aangepast indien nodig" step: the
   script surfaces the candidates; a human confirms.)

6. **Seed data.** Update `prisma/seed-exercises.ts` (and any other seed with
   `muscleLoads`) to region keys so fresh DBs start correct.

Verify: `npx tsc --noEmit` clean, exercise create/edit shows 12 region sliders,
backfill script runs idempotently on a copy, audit file generated.

### Phase 1 — server endpoint

**Edit `src/server/routers/patient.ts`.** Add a new query
`patient.muscleFatigue` (and the therapist-facing `patients.muscleFatigue`
mirror if the treatment page needs it — check how `getRecoverySessions` was
exposed and match the auth pattern via `hasPatientAccess()`).

It must pull **both** sources over the last 7 days:
- `sessionLog` with `exerciseLogs` → join `Exercise` for
  `muscleLoads` (via `muscleLoadsRecord()` in `src/server/lib/muscle-loads.ts`)
  **and** `movementPattern`, `loadType`, `category`. Map each exerciseLog to a
  `StrengthStimulus`. Reuse the existing `getRecoverySessions` query shape in
  `patient.ts` (~line 2296) as the starting point — it already joins most of
  this; add the three metadata fields and `repUnit`.
- `cardioLog` over the same window → map to `CardioStimulus` (activity =
  `CardioLog.activity`, durationMin from `durationSec/60`, rpe, completedAt =
  the row's completion timestamp).

Return `computeMuscleFatigue(strength, cardio)`. Do the compute server-side so
the client just renders.

Do NOT delete `getRecoverySessions` yet — Phase 3 removes it once nothing
references it.

### Phase 2 — the "status per muscle group" list (NO anatomy figure)

**Decision (final, 2026-07-20):** the anatomy body figure is dropped. We tried
a raster heatmap and a vector-contour heatmap over AI-generated body renders;
both were rejected as not good enough / not worth the fragility. The feature is
a **plain per-muscle-group status list** — the panel already shown in the demo.
Do NOT build a body figure, SVG map, or masks. There are no body assets in the
repo (any `public/body/*` or `scripts/body-masks/*` were removed).

**What to build.** A single component that lists each fatigued **region** as a
row: a coloured status dot, the region name, the recovery percentage, and a
thin progress bar underneath tinted the same colour. Reference layout is in the
demo panel (and the screenshot Jurre approved): rows sorted **worst first**
(lowest recoveryPercent at top), heading "STATUS PER SPIERGROEP".

Rows to show:
- Only regions with a stimulus in the last 7 days (i.e. those
  `computeMuscleFatigue` returns) AND `recoveryPercent < 95` — a region that is
  essentially recovered drops off the list rather than cluttering it.
- If none qualify, show an empty state: "Alles hersteld — klaar om te trainen."
  (tone-of-voice compliant, keep it plain).

**No display-grouping layer needed.** Because tagging is already in the 12
regions (Phase 0.5), the engine returns region-keyed states and the list shows
them 1:1. There is no 22→N collapse, no `DISPLAY_GROUPS`, no figure/region map —
that complexity is gone. Just sort `computeMuscleFatigue`'s output and render.

**Create `src/components/recovery/MuscleStatusList.tsx`** implementing the
above, fed by `trpc.patient.muscleFatigue.useQuery()`. Style with the app's
dark-ui card conventions and the orange house palette (section 6 colours).
Keep it self-contained and reusable — it will also be embedded elsewhere later.
Interaction is minimal: no hover, no tooltip, no SVG. Optionally show the
recovery ETA text (e.g. "~1d 4u") from `hoursRemaining` per row if it reads
well, but the % + bar is the core.

Mount it on the **patient dashboard** (`src/app/(patient)/patient/dashboard/`)
and the **athlete dashboard** (`src/app/(athlete)/athlete/dashboard/`). Place
it where the old readiness tile would have gone; match the surrounding
dark-ui/card styling. Follow the "This is NOT the Next.js you know" note in
AGENTS.md — read the relevant guide in `node_modules/next/dist/docs/` before
writing route/server-component code.

Visual reference: `docs/muscle-status-list-demo.html` — the approved list
layout (heading, rows, dot + name + % + bar, worst-first, recovered rows
dropped). It is a layout reference only; the exact styling must match the iOS
app brand per the spec below.

#### Design spec — match the iOS app brand (final)

The list must look like it belongs in the **iOS app** (`mbt-gym-mobile`). The
per-muscle status **colours may differ** from the app's semantic colours —
that colour coding is a functional distinction and Jurre approved it — but
every other design choice (surface, typography, spacing, heading, bar) must
follow the iOS design system. Both the web component (built now) and the iOS
component (iOS follow-up, section 8) use the same brand so they read as one product.

**Brand tokens** — source of truth is `mbt-gym-mobile/constants/theme.ts`
(object `P`). The iOS app is force-dark, petrol-green with orange accent. Use
these exact values (web: as CSS/theme constants; iOS: import `P` directly):

| role | token | hex |
|------|-------|-----|
| app background | `P.bg` | `#0E2729` |
| card surface | `P.surface` | `#15363A` |
| bar track / elevated | `P.surfaceHi` | `#1C4448` |
| hairline border | `P.line` | `rgba(212,232,230,0.08)` |
| primary text (crème) | `P.ink` | `#F5F2ED` |
| muted text | `P.inkMuted` | `#9EB5B3` |
| **brand accent (orange)** | `P.lime` *(legacy key, value is orange)* | `#E87A55` |

Spacing scale (`Spacing`): xs4 sm8 md12 lg16 xl24. Radius (`Radius`): md10 lg14.

**Typography** (fonts already loaded in the iOS app; the web app must use the
same families — confirm they are available in `mbt-gym`, otherwise ship the
`assets/fonts` and register them):
- Section heading ("kicker"): `fontFamily: JetBrainsMonoMedium, fontSize: 10,
  fontWeight: 700, letterSpacing: 2, textTransform: uppercase, color:
  P.inkMuted`. On iOS this is the existing `<Kicker>` from
  `@/components/dark-ui` — reuse it, do not restyle.
- Row muscle name (body): `fontFamily: InterTight, fontSize: 13, lineHeight:
  18, color: P.ink`.
- Percentage value: `fontFamily: JetBrainsMonoMedium, fontSize: 13,
  fontWeight: 900, letterSpacing: 0.5`, colour = the row's status colour,
  right-aligned.

**Card**: `backgroundColor: P.surface, borderRadius: Radius.md (10), padding:
Spacing.md (12)`. No shadow (the app uses tint + hairline, never elevation).
Heading is a `<Kicker>STATUS PER SPIERGROEP</Kicker>` at the top.

**Row** — follow the existing `critRow` pattern
(`mbt-gym-mobile/components/rehab-section.tsx:354-357`): `flexDirection: row,
alignItems: center, gap: 10, paddingVertical: 8`, rows separated by a top
`hairline` border in `P.line`. Layout: 10px status dot (`borderRadius: 5`,
colour = status) · muscle name (`flex: 1`) · percentage (mono, right). A thin
bar sits beneath each row.

**Bar** — reuse the `MiniBar` pattern
(`mbt-gym-mobile/components/health-ui.tsx:184-190`): track `height: 5,
borderRadius: 3, backgroundColor: P.surfaceHi, overflow: hidden`; fill `width:
${pct}%, height: 100%, borderRadius: 3, backgroundColor: <status colour>`.

**Closest existing analog to copy from:** `mbt-gym-mobile/components/
load-split.tsx` (`ModalityLoadCard`) — already renders coloured-dot + mono
label + coloured value + thin fill bar on a `P.surface` card. Match its rhythm.

**iOS primitives to reuse (Phase 8, don't rebuild):** `Kicker`, `Tile` from
`@/components/dark-ui`; `MiniBar` from `@/components/health-ui`; `ThemedText`
from `@/components/themed-text`; tokens `P, Font, Spacing, Radius` from
`@/constants/theme`.

**Status colour ramp** — see section 6; it is aligned to the iOS palette tokens
so it feels native while staying a distinct functional scale.

### Phase 3 — retire the orphan + share the dose in the program builder

1. **Program builder balance panel** —
   `src/components/programs/MuscleBalancePanel.tsx` has its own ad-hoc formula
   (`muscleLoad × sets × repFactor × weightFactor`). Replace its inline maths
   with `strengthMuscleDose(...)` from the engine so planned load and logged
   fatigue speak the same language. The panel input is `BuilderExercise` — map
   its fields (sets, reps, muscleLoads, and pattern/loadType/category if
   available on `BuilderExercise`; if not, pass what exists and let
   `damageFactor` default to 1.0). Keep the imbalance-pair UI as-is.

2. **Weekly sets-per-muscle guardrail (new, small).** In the same panel (or a
   sibling), add a weekly "hard sets per muscle" count: for the current week,
   sum `sets` of exercises where `involvement ≥ 3` per muscle, and flag against
   the evidence range **10–20 hard sets/week** (Schoenfeld 2017 dose-response).
   Simple colour: under 10 = under-dosed, 10–20 = on target, >20 = high. This
   is the metric therapists actually reason in.

3. **Remove the dead v1 system** once Phase 2 renders and nothing imports it:
   - delete `src/lib/recovery-estimation.ts`
   - delete `src/components/recovery/RecoveryPanel.tsx` and
     `src/components/recovery/BodyFigure.tsx` (both orphaned already; the new
     status list replaces them — no body figure is being kept).
   - remove `patient.getRecoverySessions` and its `.invalidate()` call sites
     (5 of them: patient/athlete session pages, cardio pages). Replace the
     invalidations with `patient.muscleFatigue.invalidate()` so logging a
     session or a cardio session refreshes the status list.

   Grep to confirm zero references before deleting:
   `grep -rn "getRecoverySessions\|recovery-estimation\|RecoveryPanel\|BodyFigure" src`.

---

## 3. Data flow summary

```
log strength session ─┐
                      ├─► patient.muscleFatigue (server, last 7d)
log cardio session  ──┘        │  pulls sessionLog+exerciseLogs+Exercise meta
                               │  pulls cardioLog
                               ▼
                    computeMuscleFatigue()  (src/lib/muscle-fatigue.ts)
                               │  per-muscle L = Σ dose·exp(−Δt/τ)
                               ▼
        MuscleStatusList.tsx ──► rows per display group (worst-first)
program builder ─► strengthMuscleDose() (same fn) ─► balance + weekly sets
```

---

## 4. Verification checklist (run before calling it done)

- [ ] `npx tsc --noEmit` clean after every phase.
- [ ] `npm run lint` passes.
- [ ] `npm test` (vitest) green — all six calibration examples within ±3pp,
      plus coverage/monotonicity/mobility tests.
- [ ] Manual: log a heavy leg strength session → dashboard status list shows
      Quadriceps at the top, fatigued (red/orange). Wait/adjust `completedAt` in
      a seed to +48h → recovering.
- [ ] Manual: log a 60-min RUNNING cardio session → Onderbeen/Quadriceps move
      toward recovering. Log a 30-min easy CYCLING → legs stay near-fresh. This
      is the core acceptance for Jurre's cardio request.
- [ ] Phase 0.5: exercise create/edit shows exactly the 12 region sliders; the
      `muscle_loads` backfill ran idempotently on a copy (rerun = no change);
      `muscle-loads-audit.json` generated for Jurre to review.
- [ ] Grep confirms no lingering `MUSCLE_GROUPS`/`MuscleGroup` references and the
      v1 orphan is fully removed, no dangling imports.
- [ ] `npm run check:mirror` still passes (we touched nothing mirrored, but the
      cardio constants live near mirrored files — confirm no drift).

---

## 5. House rules to honour (from AGENTS.md + memory)

- **No Prisma *schema* migration** in this plan. The engine (damageFactor, τ,
  cardio) derives from existing columns; `muscle_loads.muscle` stays a
  `String`. There IS one **data backfill** (Phase 0.5) that rewrites existing
  `muscle_loads` rows from the 22 groups to the 12 regions — a one-off
  `scripts/*.ts`, not a schema change. Run it against a copy first. Do not add
  new tables/columns (if you ever think you need one, you don't — re-read 1.0
  and 0.5).
- **Colours: use the iOS brand tokens.** Not lime (the old
  `recovery-estimation.ts` lime `#BEF264` is dead). The status ramp is aligned
  to `mbt-gym-mobile/constants/theme.ts` so it feels native: recovered =
  `P.green #5FD08A`, recovering = `P.gold #F5B942`, loaded = accent orange
  `#E87A55`, heavily loaded = `P.danger #F87171`. See section 6 for the exact
  helper. (Jurre approved that the per-muscle colours are their own distinct
  functional scale, separate from other semantic colours.)
- **Tone of voice.** Any UI copy/labels: read `docs/tone-of-voice.md`, match
  register, honour the AI-language blacklist (no em-dashes, no hollow marketing
  words). Muscle-state labels stay short and clinical
  (`Hersteld` / `Herstellende` / `Zwaar belast` style, already in the codebase).
- **NL week-time** rules only matter if you touch week aggregation for the
  weekly-sets guardrail — use `src/lib/week-dates.ts`, never `getUTCDay()`.
- **Multi-tenant auth:** the therapist-facing endpoint must use
  `hasPatientAccess()` / the practice-scoped OR pattern, same as
  `getRecoverySessions` did.

---

## 6. Colour + label helpers (spec)

```ts
// recoveryPercent → colour. Aligned to iOS brand tokens (mbt-gym-mobile
// constants/theme.ts) so web and iOS read identically.
getMuscleFatigueColor(p):
  p ≥ 80 → '#5FD08A'  // P.green — recovered
  p ≥ 55 → '#F5B942'  // P.gold — recovering
  p ≥ 30 → '#E87A55'  // accent orange (P.lime) — loaded
  else   → '#F87171'  // P.danger — heavily loaded

getMuscleFatigueLabel(p):  // keep existing Dutch wording
  ≥80 'Hersteld' · ≥55 'Herstellende' · ≥30 'Vermoeid' · else 'Zwaar belast'
```
Status enum (`MuscleFatigueStatus`) stays 3-way — recovered ≥80, recovering
≥45, else fatigued (section 1.5); the colour helper just has finer bands.

---

## 7. Scientific basis (put a trimmed version as a header comment in muscle-fatigue.ts)

- **Proximity to failure / RIR drives fatigue** — Zourdos et al. 2016 (RIR-based
  RPE); Refalo et al. 2023 (proximity-to-failure meta-analysis).
- **Eccentric & long-muscle-length damage → slowest recovery, most DOMS** —
  Proske & Morgan 2001; Nosaka & Newton 2002; Nosaka lengthened-position work.
- **Isometrics cause minimal muscle damage** — supports near-zero ISO
  contribution and the tendinopathy daily-ISO flow.
- **Recovery is exponential/front-loaded, muscle-size dependent** — McLester
  et al. 2003 (recovery time by muscle mass); supercompensation theory.
- **Weekly hard-set dose-response ~10–20 sets/muscle** — Schoenfeld et al. 2017
  (volume dose-response meta); Schoenfeld frequency meta-analyses.
- **Whole-body sRPE / monotony / strain** (already shipped, unchanged) —
  Foster 2001; Banister fitness-fatigue.

---

## 8. iOS follow-up (NOT this plan — scope note for the next round)

Mobile (`/Users/eva/mbt-gym-mobile`) has no fatigue engine, only read-only
muscle-map display. Follow-up will:
- port `muscle-fatigue.ts` (pure, portable) into the mobile repo, OR expose the
  computed states through an existing tRPC/data endpoint the app already reads.
- decide whether the muscle-fatigue engine becomes a **mirrored** module
  (add it to `npm run check:mirror`) or is served from the API to avoid drift.
  Recommendation: serve computed states from the API (single source), do not
  duplicate the maths.
- add the muscle-status list to the mobile dashboard, built natively from the
  primitives named in the Phase 2 design spec (`Kicker`, `Tile`, `MiniBar`,
  `ThemedText`, tokens `P/Font/Spacing/Radius`) and the `critRow` row pattern.
  Because the web component was already built to the iOS brand tokens, this is
  a near-1:1 visual port — the web version is the reference.

Do this only after web is shipped and the constants have been validated on real
logged data.

---

## 9. Order of operations for Opus (tl;dr)

1. Phase 0: `muscle-fatigue.ts` (with `MUSCLE_REGIONS` + region τ) + vitest
   tests. Get all six calibration examples green. **Do not proceed until green.**
2. Phase 0.5: switch exercise tagging to the 12 regions — constants, form
   sliders, auto-estimator, seed data, and the `muscle_loads` data backfill +
   audit file. tsc clean, backfill idempotent on a copy.
3. Phase 1: `patient.muscleFatigue` endpoint pulling strength + cardio,
   returning region-keyed states.
4. Phase 2: `MuscleStatusList.tsx` (region rows, worst-first, no figure, iOS
   brand styling per the Phase 2 design spec), mounted on both dashboards.
5. Phase 3: share `strengthMuscleDose` into the program builder, add weekly-sets
   guardrail, delete the v1 orphan, re-point invalidations.
6. Run the full verification checklist. Report the calibration test output and
   the exercise-audit summary.
