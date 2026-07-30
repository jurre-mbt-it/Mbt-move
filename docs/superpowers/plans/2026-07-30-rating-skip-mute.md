# Beoordeel-popup: skip onthouden + per type dempen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overgeslagen beoordeel-popups server-side onthouden en per activiteitstype omkeerbaar kunnen dempen, zodat frequente syncers niet bij elke app-start dezelfde popups krijgen.

**Architecture:** Twee additieve kolommen (`CardioLog.skippedAt`, `User.ratingMutedActivities`), drie nieuwe tRPC-endpoints in de wearables-router plus een filter-uitbreiding op `unratedActivities`. De iOS-app splitst "Overslaan" (persistent) van "sluiten" (ronde parkeren), toont bij elke derde skip van een type een demp-aanbod, en krijgt een instellingen-sectie om dempen terug te draaien. De demp-aanbod-regel wordt server-side berekend (pure functie, getest) zodat de client alleen `offerMute` hoeft te lezen.

**Tech Stack:** Next.js + tRPC + Prisma (web, `/Users/eva/mbt-gym`), Expo/React Native (app, `/Users/eva/mbt-gym-mobile`), vitest (alleen web).

**Spec:** `docs/plan-rating-skip-mute-20260730.md`

## Global Constraints

- Repo-regel: invoervelden nooit corrigeren tijdens typen (hier niet van toepassing, geen vrije invoer).
- Tone of voice (`docs/tone-of-voice.md`): geen em-dashes, geen holle marketingtaal in UI-copy.
- Geen nieuwe tabellen → geen RLS-werk. Wel: `npm run db:push` draait tegen de ENIGE (hosted) database; alleen additieve wijzigingen zijn toegestaan.
- Mobile-repo: GEEN nieuwe EAS-build (expliciete gebruikersinstructie 30 jul); committen mag, de commit sluit aan in de build-wachtrij.
- Commit-stijl web: `feat(...): ...` Nederlands, afsluiten met `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Mobile heeft geen testrunner; de check daar is `npx tsc --noEmit`.

---

### Task 1: Schema — twee additieve kolommen (web)

**Files:**
- Modify: `prisma/schema.prisma` (CardioLog ~regel 800, User ~regel 392)

**Interfaces:**
- Produces: `CardioLog.skippedAt: DateTime?`, `User.ratingMutedActivities: CardioActivity[]` (Prisma-client types voor Task 3)

- [ ] **Step 1: CardioLog.skippedAt toevoegen**

In `prisma/schema.prisma`, direct onder het `ratedAt`-veld van `model CardioLog` (na de comment-regels die eindigen op "…triggeren de popup."):

```prisma
  // Gezet als de gebruiker de beoordeel-popup voor deze rit bewust oversloeg
  // ("Overslaan"). De rit komt dan niet meer in de popup-wachtrij; beoordelen
  // via het detailscherm kan nog steeds en wint (ratedAt).
  skippedAt             DateTime?
```

- [ ] **Step 2: User.ratingMutedActivities toevoegen**

In `model User`, in het blok `// Push-notificaties (mobiele app)` direct onder `dailyGoal              DailyGoal?`:

```prisma
  /// Activiteitstypes waarvoor de beoordeel-popup stil is (omkeerbaar via
  /// instellingen in de app). Leeg = overal vragen.
  ratingMutedActivities CardioActivity[] @default([])
```

- [ ] **Step 3: Valideren en pushen**

Run: `cd /Users/eva/mbt-gym && npx prisma validate && npm run db:push`
Expected: "The database is now in sync with your Prisma schema" — additieve kolommen, geen data-loss-prompt. Krijg je WEL een data-loss-prompt: STOP, niet accepteren, terug naar de schema-edit.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(wearables): kolommen voor overgeslagen beoordelingen en gedempte popup-types

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Demp-aanbod-regel als pure functie, met test (web, TDD)

**Files:**
- Create: `src/server/wearables/rating.ts`
- Test: `src/server/wearables/__tests__/rating.test.ts`

**Interfaces:**
- Produces: `shouldOfferRatingMute(skippedOfType: number, muted: boolean): boolean` — gebruikt door Task 3.

- [ ] **Step 1: Failing test schrijven**

`src/server/wearables/__tests__/rating.test.ts` (zelfde importstijl als `ingest.test.ts` — check die eerst; standaard expliciete vitest-imports):

```ts
import { describe, expect, it } from 'vitest'

import { shouldOfferRatingMute } from '../rating'

describe('shouldOfferRatingMute', () => {
  it('biedt aan bij elke derde overgeslagen rit van een type (3, 6, 9)', () => {
    expect(shouldOfferRatingMute(3, false)).toBe(true)
    expect(shouldOfferRatingMute(6, false)).toBe(true)
    expect(shouldOfferRatingMute(9, false)).toBe(true)
  })

  it('biedt niet aan onder de drie of tussen veelvouden in', () => {
    expect(shouldOfferRatingMute(0, false)).toBe(false)
    expect(shouldOfferRatingMute(1, false)).toBe(false)
    expect(shouldOfferRatingMute(2, false)).toBe(false)
    expect(shouldOfferRatingMute(4, false)).toBe(false)
    expect(shouldOfferRatingMute(5, false)).toBe(false)
  })

  it('biedt nooit aan als het type al gedempt is', () => {
    expect(shouldOfferRatingMute(3, true)).toBe(false)
    expect(shouldOfferRatingMute(9, true)).toBe(false)
  })
})
```

- [ ] **Step 2: Test draaien, moet falen**

Run: `npx vitest run src/server/wearables/__tests__/rating.test.ts`
Expected: FAIL — module `../rating` bestaat niet.

- [ ] **Step 3: Implementatie**

`src/server/wearables/rating.ts`:

```ts
/**
 * Demp-aanbod-regel voor de beoordeel-popup: bij elke derde overgeslagen rit
 * van hetzelfde type (3, 6, 9, …) bieden we aan om dat type stil te houden,
 * zolang het niet al gedempt is. De teller is zelf de throttle: het aanbod
 * komt hooguit één keer per drie skips, zonder "al aangeboden"-boekhouding.
 */
export function shouldOfferRatingMute(skippedOfType: number, muted: boolean): boolean {
  return !muted && skippedOfType >= 3 && skippedOfType % 3 === 0
}
```

- [ ] **Step 4: Test draaien, moet slagen**

Run: `npx vitest run src/server/wearables/__tests__/rating.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/wearables/rating.ts src/server/wearables/__tests__/rating.test.ts
git commit -m "feat(wearables): demp-aanbod-regel voor de beoordeel-popup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: tRPC-endpoints — skip onthouden, dempen, filteren (web)

**Files:**
- Modify: `src/server/routers/wearables.ts` (imports bovenaan; `unratedActivities` ~regel 399; nieuwe endpoints direct onder `rateActivity`)

**Interfaces:**
- Consumes: `shouldOfferRatingMute` uit Task 2; kolommen uit Task 1.
- Produces (voor de app, Tasks 4/5):
  - `wearables.unratedActivities` — als voorheen, maar zonder overgeslagen ritten en zonder gedempte types.
  - `wearables.skipRating({ id: string })` → `{ ok: true, activity: CardioActivity, skippedOfType: number, offerMute: boolean }`
  - `wearables.setRatingMute({ activity: CardioActivity, muted: boolean })` → `{ ok: true, muted: CardioActivity[] }`
  - `wearables.ratingMutes` (query) → `CardioActivity[]`

- [ ] **Step 1: Imports aanvullen**

Bovenaan `wearables.ts`: `CardioActivity` als value-import toevoegen aan de bestaande `@prisma/client`-import, en de nieuwe helper importeren:

```ts
import { CardioActivity, Prisma, type PrismaClient } from '@prisma/client'
import { shouldOfferRatingMute } from '@/server/wearables/rating'
```

- [ ] **Step 2: `unratedActivities` uitbreiden**

De bestaande query vervangen door (alleen de `where`-opbouw en de verse demp-lijst zijn nieuw):

```ts
  unratedActivities: wearablesProcedure.query(async ({ ctx }) => {
    const since = startOfDay()
    since.setDate(since.getDate() - 7)
    // Demp-lijst vers lezen, niet uit de (tot 60s) gecachete ctx.user: na
    // "weer aanzetten" in instellingen moet de popup direct terug kunnen komen.
    const me = await ctx.prisma.user.findUnique({
      where: { id: ctx.user!.id },
      select: { ratingMutedActivities: true },
    })
    const mutedTypes = me?.ratingMutedActivities ?? []
    const rows = await ctx.prisma.cardioLog.findMany({
      where: {
        patientId: ctx.user!.id,
        source: { in: ['APPLE_WATCH', 'STRAVA'] },
        ratedAt: null,
        skippedAt: null,
        ...(mutedTypes.length ? { activity: { notIn: mutedTypes } } : {}),
        completedAt: { gte: since },
      },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        id: true, activity: true, distanceM: true, durationSec: true,
        avgHeartRate: true, rpe: true, source: true, completedAt: true,
      },
    })
    return rows.map(r => ({ ...r, completedAt: r.completedAt.toISOString() }))
  }),
```

- [ ] **Step 3: Nieuwe endpoints, direct onder `rateActivity`**

```ts
  /**
   * "Overslaan" in de beoordeel-popup: onthoud de keuze zodat de rit niet bij
   * elke app-start terugkomt. De rit mist niets — de HR-schatting blijft de
   * RPE — en beoordelen via het detailscherm kan altijd nog. Geeft terug of
   * de client het demp-aanbod voor dit type moet tonen (elke 3e skip).
   */
  skipRating: wearablesProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // ratedAt-guard: is de rit intussen op een ander apparaat beoordeeld,
      // dan wint die beoordeling en slaan we niets over.
      const res = await ctx.prisma.cardioLog.updateMany({
        where: { id: input.id, patientId: ctx.user!.id, ratedAt: null },
        data: { skippedAt: new Date() },
      })
      if (res.count === 0) throw new TRPCError({ code: 'NOT_FOUND' })
      const log = await ctx.prisma.cardioLog.findUnique({
        where: { id: input.id },
        select: { activity: true },
      })
      if (!log) throw new TRPCError({ code: 'NOT_FOUND' })
      const windowStart = startOfDay()
      windowStart.setDate(windowStart.getDate() - 30)
      const [skippedOfType, me] = await Promise.all([
        ctx.prisma.cardioLog.count({
          where: {
            patientId: ctx.user!.id,
            activity: log.activity,
            skippedAt: { gte: windowStart },
          },
        }),
        ctx.prisma.user.findUnique({
          where: { id: ctx.user!.id },
          select: { ratingMutedActivities: true },
        }),
      ])
      const muted = (me?.ratingMutedActivities ?? []).includes(log.activity)
      return {
        ok: true,
        activity: log.activity,
        skippedOfType,
        offerMute: shouldOfferRatingMute(skippedOfType, muted),
      }
    }),

  /**
   * Demp de beoordeel-popup voor een activiteitstype, of zet hem weer aan.
   * Idempotent; dezelfde mutation doet beide richtingen (omkeerbaar via
   * instellingen in de app).
   */
  setRatingMute: wearablesProcedure
    .input(z.object({ activity: z.nativeEnum(CardioActivity), muted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const me = await ctx.prisma.user.findUnique({
        where: { id: ctx.user!.id },
        select: { ratingMutedActivities: true },
      })
      const current = new Set(me?.ratingMutedActivities ?? [])
      if (input.muted) current.add(input.activity)
      else current.delete(input.activity)
      await ctx.prisma.user.update({
        where: { id: ctx.user!.id },
        data: { ratingMutedActivities: { set: [...current] } },
      })
      return { ok: true, muted: [...current] }
    }),

  /** Gedempte activiteitstypes, voor het instellingen-scherm in de app. */
  ratingMutes: wearablesProcedure.query(async ({ ctx }) => {
    const me = await ctx.prisma.user.findUnique({
      where: { id: ctx.user!.id },
      select: { ratingMutedActivities: true },
    })
    return me?.ratingMutedActivities ?? []
  }),
```

- [ ] **Step 4: Checks**

Run: `npx tsc --noEmit && npm run test`
Expected: beide schoon/groen.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/wearables.ts
git commit -m "feat(wearables): overslaan onthouden en beoordeel-popup per type dempen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: App — sheet, wachtrij en detailscherm (mobile)

**Files:**
- Modify: `components/rating-sheet.tsx` (props + header-knop + backdrop)
- Modify: `components/rating-queue.tsx` (skip persistent, close, demp-aanbod, export ACTIVITY_NL)
- Modify: `app/health/activity/[id].tsx:574` (`onSkip` → `onClose`)

**Interfaces:**
- Consumes: `wearables.skipRating` / `wearables.setRatingMute` uit Task 3.
- Produces: `RatingSheet`-props `onSkip?: () => void` (persistent; toont knop "Overslaan") en `onClose: () => void` (backdrop/hardware-back; knop "Sluiten" als `onSkip` ontbreekt). `ACTIVITY_NL` geëxporteerd uit `rating-queue.tsx` (Task 5 gebruikt die).

- [ ] **Step 1: `rating-sheet.tsx` — props splitsen**

In de props: `onSkip: () => void;` wordt:

```ts
  /** "Overslaan": bewust deze rit niet beoordelen (wordt onthouden). Zonder deze prop toont de knop "Sluiten". */
  onSkip?: () => void;
  /** Sheet dichtdoen zonder iets vast te leggen (backdrop-tik, hardware-back). */
  onClose: () => void;
```

`onRequestClose={onSkip}` → `onRequestClose={onClose}`; backdrop `onPress={saving ? undefined : onSkip}` → `onPress={saving ? undefined : onClose}`; de header-knop wordt:

```tsx
                <Pressable hitSlop={10} onPress={onSkip ?? onClose} disabled={saving}>
                  <ThemedText style={styles.later}>{onSkip ? 'Overslaan' : 'Sluiten'}</ThemedText>
                </Pressable>
```

- [ ] **Step 2: `rating-queue.tsx` — skip persistent + ronde parkeren + demp-aanbod**

`export const ACTIVITY_NL` (was `const`). `HostValue` krijgt `close: () => void` naast `skip`. De `skip`-callback vervangen door:

```ts
  // "Overslaan": lokaal meteen door naar de volgende, server onthoudt de keuze.
  // Bij elke derde skip van hetzelfde type stelt de server een demp-aanbod voor.
  const skip = useCallback(() => {
    const cur = queue[0];
    if (!cur) return;
    const restOfType = queue.slice(1).filter((a) => a.activity === cur.activity).length;
    setQueue((q) => q.slice(1));
    trpcMutate<{ ok: boolean; activity: string; offerMute: boolean }>('wearables.skipRating', { id: cur.id })
      .then((res) => {
        if (!res?.offerMute) return;
        const name = ACTIVITY_NL[cur.activity] ?? 'Workout';
        Alert.alert(
          `${name} stil houden?`,
          `Je sloeg nu 3 keer ${name.toLowerCase()} over. Wil je dat we hier niet meer om vragen? De schatting uit je hartslag blijft meetellen. Terugzetten kan bij Instellingen.`,
          [
            { text: 'Blijf vragen', style: 'cancel' },
            {
              text: 'Niet meer vragen',
              onPress: () => {
                trpcMutate('wearables.setRatingMute', { activity: cur.activity, muted: true }).catch(() => {});
                setQueue((q) => q.filter((a) => a.activity !== cur.activity));
                setBatchTotal((t) => Math.max(0, t - restOfType));
              },
            },
          ],
        );
      })
      // Mislukt de server-call, dan komt de rit hooguit nog één keer terug.
      .catch(() => {});
  }, [queue]);

  // Backdrop-tik of hardware-back: de hele ronde parkeren zonder iets te
  // bewaren. Bij de volgende foreground/refresh komt alles gewoon terug.
  const close = useCallback(() => {
    setQueue([]);
    setBatchTotal(0);
  }, []);
```

`hostValue` krijgt `close` in het object én in de dependency-array. `RatingSheetHost` geeft door: `onSkip={host.skip}` en `onClose={host.close}`.

- [ ] **Step 3: `app/health/activity/[id].tsx`**

`onSkip={() => setSheetOpen(false)}` → `onClose={() => setSheetOpen(false)}` (de knop heet daar dan "Sluiten"; er valt niets over te slaan, je opende de sheet zelf).

- [ ] **Step 4: Typecheck**

Run: `cd /Users/eva/mbt-gym-mobile && npx tsc --noEmit`
Expected: schoon.

- [ ] **Step 5: Commit (mobile repo)**

```bash
git add components/rating-sheet.tsx components/rating-queue.tsx "app/health/activity/[id].tsx"
git commit -m "feat(beoordelen): overslaan wordt onthouden, met demp-aanbod per activiteitstype

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: App — instellingen-sectie "Beoordeel-popups" (mobile)

**Files:**
- Modify: `app/settings.tsx` (state + fetch + sectie tussen MELDINGEN en PRIVACY)

**Interfaces:**
- Consumes: `wearables.ratingMutes` / `wearables.setRatingMute` (Task 3), `ACTIVITY_NL` uit `rating-queue.tsx` (Task 4).

- [ ] **Step 1: Imports + state + handlers**

Bovenaan: `Fragment` toevoegen aan de react-import, en `import { ACTIVITY_NL } from '@/components/rating-queue';`. In de component:

```ts
  // Gedempte beoordeel-popups (per activiteitstype). De rij blijft staan tot
  // je het scherm verlaat, zodat de switch niet onder je vinger verdwijnt;
  // bij het volgende bezoek zijn weer-aangezette types uit de lijst.
  const [ratingMutes, setRatingMutes] = useState<string[]>([]);
  const [ratingAsk, setRatingAsk] = useState<Record<string, boolean>>({});
  useEffect(() => {
    trpcQuery<string[]>('wearables.ratingMutes')
      .then((rows) => {
        setRatingMutes(rows ?? []);
        setRatingAsk(Object.fromEntries((rows ?? []).map((a) => [a, false])));
      })
      // Rollen zonder wearable-toegang geven 403; sectie blijft dan weg.
      .catch(() => {});
  }, []);

  const toggleRatingAsk = async (activity: string, next: boolean) => {
    const prev = ratingAsk[activity] ?? false;
    setRatingAsk((m) => ({ ...m, [activity]: next }));
    try {
      await trpcMutate('wearables.setRatingMute', { activity, muted: !next });
    } catch {
      setRatingAsk((m) => ({ ...m, [activity]: prev }));
      Alert.alert('Kon niet opslaan', 'Controleer je internetverbinding en probeer opnieuw.');
    }
  };
```

- [ ] **Step 2: Sectie in de JSX, direct na de MELDINGEN-`</View>` en vóór `<Kicker …>PRIVACY`**

```tsx
          {ratingMutes.length > 0 && (
            <>
              <Kicker style={styles.groupLabel}>BEOORDEEL-POPUPS</Kicker>
              <View style={styles.group}>
                {ratingMutes.map((a, i) => (
                  <Fragment key={a}>
                    {i > 0 && <Divider />}
                    <SwitchRow
                      title={ACTIVITY_NL[a] ?? 'Workout'}
                      sub="Vraag na het syncen om een beoordeling"
                      value={ratingAsk[a] ?? false}
                      onChange={(v) => toggleRatingAsk(a, v)}
                    />
                  </Fragment>
                ))}
              </View>
            </>
          )}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/eva/mbt-gym-mobile && npx tsc --noEmit`
Expected: schoon.

- [ ] **Step 4: Commit (mobile repo)**

```bash
git add app/settings.tsx
git commit -m "feat(instellingen): gedempte beoordeel-popups per type weer aan te zetten

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verificatie en zelf-review

- [ ] **Step 1: Volle checks beide repo's**

Run (web): `cd /Users/eva/mbt-gym && npx tsc --noEmit && npm run test && npm run lint`
Run (mobile): `cd /Users/eva/mbt-gym-mobile && npx tsc --noEmit`
Expected: alles schoon. Lint-fouten in NIET-aangeraakte bestanden negeren.

- [ ] **Step 2: Kritische zelf-review van de diff** — via superpowers:requesting-code-review; extra letten op: ownership-checks op de nieuwe mutations (alles keyt op `ctx.user.id`), de `ratedAt`-race, en of oude app-builds echt niets merken (alleen additieve API's).

- [ ] **Step 3: Best-effort simulator-QA** — alleen als er zonder veel omwegen een ingelogde sessie met onbeoordeelde ritten beschikbaar is (backend poort 3001, zie mobile-werkwijze). Anders expliciet rapporteren dat dit op device-QA wacht. GEEN EAS-build.
