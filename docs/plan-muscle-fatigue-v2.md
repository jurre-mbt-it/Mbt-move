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
and a clean data seam for the new human-body heatmap (Jurre builds the SVG).

**Non-goals (do NOT touch):**
- The whole-body TSB / load-curve / sRPE system (`training-load.ts`,
  `load-curve.ts`). It is healthy and shipped. Muscle fatigue is a separate
  layer; do not merge them.
- ACWR. Leave it as the silent trend number it already is.
- iOS. Follow-up plan, section 8.

---

## 1. The model

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

  `τ_base` by muscle group (hours):

  | tier | τ_base | muscles |
  |------|--------|---------|
  | large | 40 | Quadriceps, Hamstrings, Glutes, Borst, Bovenrug, Lats, Onderrug |
  | medium | 28 | Calves, Core, Schouders anterieur, Schouders lateraal, Schouders posterieur, Biceps, Triceps, Hip flexors, Adductoren, Abductoren |
  | small | 20 | Onderarmen, Rotatorcuff, Diepe halsflexoren, Tibialis anterior, Intrinsieke voetspieren |

  Any muscle not listed → default 28 (medium). Define this as an explicit
  `Record<MuscleGroup, number>` so all 22 are covered; assert coverage in a test.

### 1.3 damageFactor (the science piece), derived from Exercise metadata

Pure function of fields **already on `Exercise`**: `movementPattern`,
`loadType`, `category`, plus the log's `repUnit`. No DB column, no migration.
Mirrors how `src/lib/strain-estimation.ts` already reads these enums.

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

- **profileWeight** — muscle → weight (involvement-equivalent units). Define
  as `Partial<Record<MuscleGroup, number>>` per activity; muscles absent = 0.

  | activity | profile (muscle: weight) |
  |----------|--------------------------|
  | RUNNING | Quadriceps 2, Hamstrings 2, Calves 2.5, Glutes 1.5, Core 1, Tibialis anterior 1 |
  | WALKING | Quadriceps 1, Calves 1, Glutes 1, Hamstrings 0.5 |
  | CYCLING | Quadriceps 2.5, Glutes 1.5, Calves 1, Hamstrings 1 |
  | WATTBIKE | Quadriceps 2.5, Glutes 1.5, Calves 1, Hamstrings 1 |
  | ASSAULT_BIKE | Quadriceps 2, Glutes 1.5, Calves 1, Hamstrings 1, Lats 0.5, Schouders anterieur 0.5 |
  | CROSSTRAINER | Quadriceps 2, Glutes 1.5, Hamstrings 1, Calves 1 |
  | ROWING | Quadriceps 2, Glutes 1.5, Hamstrings 1, Bovenrug 1.5, Lats 1, Core 1 |
  | SKIERG | Lats 1.5, Triceps 1, Core 1.5, Bovenrug 1 |
  | STAIRCLIMBER | Quadriceps 2, Glutes 2, Calves 1.5, Hamstrings 1 |
  | SWIMMING | Lats 1.5, Schouders posterieur 1, Bovenrug 1, Core 1 |
  | OTHER | Quadriceps 1, Core 0.5 |

  τ for cardio doses: use `τ_base(muscle) × (0.8 + 0.2 × cardioDamageFactor)`,
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
6. **Hard 60-min run, rpe 7.** Calves: profile 2.5, durationFactor 2.0,
   intensity 0.73, cardioDamage 1.30. dose = 2.5×2.0×0.73×1.30 = 4.75.
   Quadriceps: 2×2.0×0.73×1.30 = 3.80. Δt=2h.
   Calves τ=28×(0.8+0.2×1.3)=29.7 → L≈4.44 → **75% (recovering).**
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
Put every constant table from section 1 here as named `const` objects.
Add a `MUSCLE_TAU_BASE: Record<MuscleGroup, number>` covering all 22 groups
from `MUSCLE_GROUPS` in `src/lib/exercise-constants.ts`.

Keep `getMuscleFatigueColor(percent)` + `getMuscleFatigueLabel(percent)` here
too, but see section 6 on colours (orange house style, NOT the old lime).

**Create `src/lib/__tests__/muscle-fatigue.test.ts`** — encode the six worked
examples from 1.6 as assertions, plus:
- a test asserting every muscle in `MUSCLE_GROUPS` has a `τ_base` entry.
- a test that MOBILITY / involvement-0 muscles produce no state.
- a monotonicity test: same stimulus, larger Δt → higher recoveryPercent.

**Test runner:** the repo has **no test runner configured** (no vitest/jest in
package.json). Add vitest as a devDependency and a `"test": "vitest run"`
script. Config: `vitest.config.ts` with `environment: 'node'` (pure functions,
no DOM). Keep it minimal — this is the first test in the repo, do not drag in a
big setup. If adding a runner is considered scope-creep at execution time,
fall back to a `src/lib/muscle-fatigue.selfcheck.ts` script run via
`npx tsx` that throws on mismatch, and note it — but vitest is preferred.

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

### Phase 2 — the body heatmap (data wired, SVG seam for Jurre)

**Create `src/components/recovery/MuscleHeatmap.tsx`** — a client component
that calls `trpc.patient.muscleFatigue.useQuery()` and renders per-muscle
state. Build it so the **visual body SVG is a clearly-marked seam** Jurre fills
in:
- Export a typed prop contract: `MuscleHeatmapBody({ states, onMuscleHover })`
  where `states: Record<MuscleGroup, MuscleFatigueState>`.
- Provide a temporary fallback list/grid rendering (muscle name + coloured
  chip + percent) so the feature is testable before the SVG exists.
- Leave a `// TODO(jurre): human-body SVG goes here, consume `states` + colour
  helper` marker and a short prop-shape comment so the handoff is unambiguous.

Mount it on the **patient dashboard** (`src/app/(patient)/patient/dashboard/`)
and the **athlete dashboard** (`src/app/(athlete)/athlete/dashboard/`). Place
it where the old readiness tile would have gone; match the surrounding
dark-ui/card styling. Follow the "This is NOT the Next.js you know" note in
AGENTS.md — read the relevant guide in `node_modules/next/dist/docs/` before
writing route/server-component code.

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
     `src/components/recovery/BodyFigure.tsx` (Jurre's new heatmap replaces
     these; confirm with Jurre first if unsure — BodyFigure may be a useful
     starting point for the new SVG, in which case keep it and refactor).
   - remove `patient.getRecoverySessions` and its `.invalidate()` call sites
     (5 of them: patient/athlete session pages, cardio pages). Replace the
     invalidations with `patient.muscleFatigue.invalidate()` so logging a
     session or a cardio session refreshes the heatmap.

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
              MuscleHeatmap.tsx ──► [Jurre's human-body SVG]
program builder ─► strengthMuscleDose() (same fn) ─► balance + weekly sets
```

---

## 4. Verification checklist (run before calling it done)

- [ ] `npx tsc --noEmit` clean after every phase.
- [ ] `npm run lint` passes.
- [ ] `npm test` (vitest) green — all six calibration examples within ±3pp,
      plus coverage/monotonicity/mobility tests.
- [ ] Manual: log a heavy leg strength session → dashboard heatmap shows quads
      fatigued (red/orange). Wait/adjust `completedAt` in a seed to +48h →
      recovering.
- [ ] Manual: log a 60-min RUNNING cardio session → calves/quads move toward
      recovering. Log a 30-min easy CYCLING → legs stay near-fresh. This is the
      core acceptance for Jurre's cardio request.
- [ ] Grep confirms the v1 orphan is fully removed, no dangling imports.
- [ ] `npm run check:mirror` still passes (we touched nothing mirrored, but the
      cardio constants live near mirrored files — confirm no drift).

---

## 5. House rules to honour (from AGENTS.md + memory)

- **No DB migration** in this plan. If you find yourself writing SQL, stop and
  re-read 1.3/1.4 — everything derives from existing columns. (If a genuine
  need for a cached `damageFactor` column appears, that is a separate RLS-gated
  migration per the "RLS on every new public table" rule — but it is NOT needed
  here.)
- **Colours: orange house style, not lime.** The old `recovery-estimation.ts`
  used lime `#BEF264` etc. House accent is orange `#e87a55` (see
  `docs/tone-of-voice.md` and memory). For a fatigue scale, propose:
  recovered = calm teal/green, recovering = gold/amber, fatigued = orange→red
  (`#e87a55` → `#F87171`). Final palette is Jurre's call on the heatmap; expose
  the helper but let the SVG own the exact ramp.
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
// recoveryPercent → colour (orange house family; Jurre may override on SVG)
getMuscleFatigueColor(p):
  p ≥ 80 → '#0D9488'  // teal, recovered
  p ≥ 60 → '#5EEAD4'  // light teal
  p ≥ 45 → '#F4C261'  // gold, recovering
  p ≥ 25 → '#E87A55'  // house orange, loaded
  else   → '#F87171'  // red, heavily loaded

getMuscleFatigueLabel(p):  // keep existing Dutch wording
  ≥80 'Hersteld' · ≥60 'Bijna hersteld' · ≥45 'Herstellende' · ≥25 'Vermoeid' · else 'Zwaar belast'
```

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
- add the body heatmap to the mobile dashboard.

Do this only after web is shipped and the constants have been validated on real
logged data.

---

## 9. Order of operations for Opus (tl;dr)

1. Phase 0: `muscle-fatigue.ts` + vitest tests. Get all six calibration
   examples green. **Do not proceed until green.**
2. Phase 1: `patient.muscleFatigue` endpoint pulling strength + cardio.
3. Phase 2: `MuscleHeatmap.tsx` with fallback rendering + SVG seam, mounted on
   both dashboards.
4. Phase 3: share `strengthMuscleDose` into the program builder, add weekly-sets
   guardrail, delete the v1 orphan, re-point invalidations.
5. Run the full verification checklist. Report the calibration test output.
