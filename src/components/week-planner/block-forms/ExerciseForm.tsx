'use client'

/**
 * Het formulier voor een oefeningsrij, in twee standen:
 *   - exercise: bibliotheek-oefening met sets × reps, per-set-schema, AMRAP,
 *     per zijde, groep, tempo, rust, intensiteit (RPE / %1RM), RIR en de
 *     optie-schakelaars (lichaamsgewicht, alleen afvinken, staafsnelheid,
 *     piekvermogen, max bijhouden) plus de fase.
 *   - cardio: zoeker beperkt tot cardio en plyometrie, eenheid in tijd of
 *     afstand, en doelen (zone, tempo, hartslag, RPE) als schakelaars.
 * Drie rijen, zoals TeamBuildr, in BASE-stijl. Gecontroleerd: alles via draft.
 */

import { DarkMenuSelect, DarkTextarea, P } from '@/components/dark-ui'
import { NumberField } from '@/components/dark-ui/NumberField'
import {
  hasParam, paramValue, withParam,
  type BlockDraft, type BlockPhase, type Category, type ItemGroups,
} from '@/lib/planner-blocks'
import { isPerSideUnit, isRepBasedUnit, PER_SIDE_SEC_UNIT, PER_SIDE_UNIT, REP_UNITS } from '@/lib/program-constants'
import {
  ExerciseCombobox, Field, GroupSelect, NullableNumField, OptionSwitch, RangeToggle, Segmented,
  type ExerciseCandidate,
} from './fields'

type Intensiteit = 'NONE' | 'RPE' | 'PERCENT_1RM'
type Fase = 'MAIN' | BlockPhase

/** Eenheden zonder de /zijde-varianten: per zijde is een aparte schakelaar. */
const UNITS = REP_UNITS.filter(u => !u.value.includes('/zijde'))

function perSideOf(unit: string, perSide: boolean): string {
  const basis = unit.replace('/zijde', '')
  if (!perSide) return basis
  if (basis === 'sec') return PER_SIDE_SEC_UNIT
  if (basis === 'reps') return PER_SIDE_UNIT
  return basis // min en m hebben geen per-zijde-variant
}

const monoVeld = 'w-full h-9 px-2.5 rounded-lg text-sm athletic-mono focus:outline-none'

export function ExerciseForm({ mode, draft, onChange, groups, defaultCategory, searchRef }: {
  mode: 'exercise' | 'cardio'
  draft: BlockDraft
  onChange: (d: BlockDraft) => void
  groups: ItemGroups
  defaultCategory: Category
  searchRef: React.RefObject<HTMLInputElement | null>
}) {
  const set = (patch: Partial<BlockDraft>) => onChange({ ...draft, ...patch })
  const perSide = isPerSideUnit(draft.repUnit)
  const repBased = isRepBasedUnit(draft.repUnit)
  const perSet = draft.repsPerSet != null
  const intens: Intensiteit = draft.intensityType === 'RPE' || draft.intensityType === 'PERCENT_1RM' ? draft.intensityType : 'NONE'
  const fase: Fase = draft.phase ?? 'MAIN'
  const gekozen: ExerciseCandidate | null = draft.exerciseId
    ? { id: draft.exerciseId, name: draft.exerciseName ?? 'Oefening', category: draft.exerciseCategory ?? 'STRENGTH' }
    : null

  function kiesOefening(c: ExerciseCandidate | null) {
    if (!c) { set({ exerciseId: null, exerciseName: null, exerciseCategory: null }); return }
    // De oefening bepaalt haar eenheid: een plank staat in de bibliotheek als
    // "sec" en hoort hier niet stil 10 herhalingen te worden.
    const unit = c.defaultRepUnit ?? (mode === 'cardio' ? 'min' : 'reps')
    const start = c.isUnilateral ? perSideOf(unit, true) : unit
    // Wat de therapeut al invulde (sets, per-set-schema) blijft staan zolang
    // de soort eenheid gelijk blijft; alleen als de oefening in tijd of
    // afstand telt (plank in sec) vervalt een reps-schema, want dat zou dan
    // seconden voorschrijven die niemand zo bedoelde.
    const zelfdeSoort = start.replace('/zijde', '') === draft.repUnit.replace('/zijde', '')
    set({
      exerciseId: c.id, exerciseName: c.name, exerciseCategory: c.category,
      repUnit: zelfdeSoort ? draft.repUnit : start,
      reps: !zelfdeSoort && start.startsWith('sec') ? 30 : draft.reps,
      repsPerSet: zelfdeSoort ? draft.repsPerSet : null,
    })
  }

  function zetSets(n: number) {
    const sets = Math.max(1, Math.min(50, n))
    const huidig = draft.repsPerSet
    const repsPerSet = huidig
      ? Array.from({ length: sets }, (_, i) => huidig[i] ?? huidig[huidig.length - 1] ?? draft.reps)
      : null
    set({ sets, repsPerSet, setsMax: draft.setsMax != null && draft.setsMax <= sets ? sets + 1 : draft.setsMax })
  }

  function togglePerSet(aan: boolean) {
    set({ repsPerSet: aan ? Array.from({ length: draft.sets }, () => draft.reps) : null, repsMax: aan ? null : draft.repsMax })
  }

  function zetRepPerSet(i: number, v: number) {
    const lijst = [...(draft.repsPerSet ?? [])]
    lijst[i] = Math.max(1, Math.min(1000, v))
    set({ repsPerSet: lijst, reps: lijst[0] ?? draft.reps })
  }

  const h9 = 'h-9'

  return (
    <div className="space-y-5">
      {/* Rij 1: oefening, sets, reps/tijd */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_130px_230px] gap-3">
        <Field label={mode === 'cardio' ? 'Activiteit' : 'Oefening'} hint={gekozen ? undefined : 'Zoek in de bibliotheek. Pijltjes en Enter werken.'}>
          <ExerciseCombobox
            value={gekozen} onChange={kiesOefening} autoFocus inputRef={searchRef}
            defaultCategory={mode === 'cardio' ? null : defaultCategory === 'CARDIO' ? 'STRENGTH' : defaultCategory}
            categories={mode === 'cardio' ? ['CARDIO', 'PLYOMETRICS'] : undefined}
          />
        </Field>
        <Field label="Sets" hint={draft.setsMax != null ? 'Bereik: minimaal en maximaal.' : 'Van 1 tot 50.'}>
          <div className="flex items-center gap-1.5">
            <NumberField value={draft.sets} onCommit={zetSets} min={1} max={50} aria-label="Aantal sets" className={h9} />
            {draft.setsMax != null && (
              <>
                <span style={{ color: P.inkDim }}>-</span>
                <NumberField value={draft.setsMax} onCommit={n => set({ setsMax: Math.max(draft.sets, n) })} min={1} max={50} aria-label="Sets maximaal" className={h9} />
              </>
            )}
            <RangeToggle isRange={draft.setsMax != null} onToggle={() => set({ setsMax: draft.setsMax == null ? draft.sets + 1 : null })} />
          </div>
        </Field>
        <Field label={draft.amrap ? 'Minimaal' : perSet ? 'Reps (set 1)' : 'Reps of tijd'}
          hint={draft.amrap ? 'De atleet doet zoveel mogelijk herhalingen.' : perSet ? 'Vul hieronder per set een aantal in.' : 'Kies de eenheid rechts.'}>
          <div className="flex items-center gap-1.5">
            <NumberField
              value={draft.reps} min={1} max={1000} aria-label="Herhalingen of tijd" className={h9}
              onCommit={n => set({ reps: n, repsPerSet: perSet ? (draft.repsPerSet ?? []).map((r, i) => (i === 0 ? n : r)) : null })}
            />
            {!perSet && draft.repsMax != null && (
              <>
                <span style={{ color: P.inkDim }}>-</span>
                <NumberField value={draft.repsMax} onCommit={n => set({ repsMax: Math.max(draft.reps, n) })} min={1} max={1000} aria-label="Herhalingen maximaal" className={h9} />
              </>
            )}
            <DarkMenuSelect
              ariaLabel="Eenheid" value={draft.repUnit.replace('/zijde', '')}
              onValueChange={u => set({ repUnit: perSideOf(u, perSide) })}
              options={UNITS.map(u => ({ value: u.value, label: u.label }))}
              className="w-[84px]"
            />
            {!perSet && <RangeToggle isRange={draft.repsMax != null} onToggle={() => set({ repsMax: draft.repsMax == null ? draft.reps + 2 : null })} />}
          </div>
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <OptionSwitch checked={perSet} onCheckedChange={togglePerSet} label="Per set" hint="Ander aantal per set, bijv. 8/6/6/4." disabled={draft.completionOnly} />
        <OptionSwitch checked={draft.amrap} onCheckedChange={v => set({ amrap: v })} label="AMRAP" hint="Zoveel mogelijk, het getal is de ondergrens." disabled={draft.completionOnly} />
        {(repBased || draft.repUnit.startsWith('sec')) && (
          <OptionSwitch checked={perSide} onCheckedChange={v => set({ repUnit: perSideOf(draft.repUnit, v) })} label="Per zijde" hint="Het aantal geldt links én rechts." />
        )}
      </div>

      {perSet && (
        <Field label="Per set">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(draft.sets, 8)}, minmax(56px, 1fr))` }}>
            {(draft.repsPerSet ?? []).map((r, i) => (
              <div key={i}>
                <NumberField value={r} onCommit={n => zetRepPerSet(i, n)} min={1} max={1000} aria-label={`Set ${i + 1}`} className={h9} />
                <p className="athletic-mono text-center mt-1" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.08em' }}>SET {i + 1}</p>
              </div>
            ))}
          </div>
        </Field>
      )}

      {/* Rij 2: instructie, groep, tempo, rust */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px_110px_100px] gap-3">
        <Field label="Instructie (optioneel)" hint="Voor deze rij in deze training, maximaal 500 tekens.">
          <DarkTextarea rows={2} maxLength={500} value={draft.notes ?? ''} onChange={e => set({ notes: e.target.value || null })} placeholder="Bijv. rustig excentrisch, geen lock-out" />
        </Field>
        <Field label="Groep" hint="Superset of circuit.">
          <GroupSelect value={draft.supersetGroup} onChange={v => set({ supersetGroup: v })} groups={groups} />
        </Field>
        {mode === 'exercise' ? (
          <Field label="Tempo" hint="Bijv. 3-1-2-0.">
            <input
              className={monoVeld}
              style={{ border: `1px solid ${P.line}`, background: P.field, color: P.ink }}
              value={String(paramValue(draft.extraParams, 'tempo') ?? '')} placeholder="3-1-2-0" aria-label="Tempo"
              onChange={e => set({ extraParams: withParam(draft.extraParams, 'tempo', e.target.value || null) })}
            />
          </Field>
        ) : <div className="hidden md:block" />}
        <Field label="Rust" hint="Seconden tussen sets.">
          <NullableNumField value={draft.restTime} onChange={v => set({ restTime: v })} min={0} max={3600} step={15} ariaLabel="Rust in seconden" className={h9} />
        </Field>
      </div>

      {/* Rij 3: intensiteit of cardiodoelen */}
      {mode === 'exercise' ? (
        <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)_100px] gap-3 items-start">
          <Field label="Intensiteit">
            <Segmented<Intensiteit>
              ariaLabel="Soort intensiteit" value={intens}
              options={[{ value: 'NONE', label: 'Geen' }, { value: 'RPE', label: 'RPE' }, { value: 'PERCENT_1RM', label: '% 1RM' }]}
              onChange={v => set(v === 'NONE'
                ? { intensityType: 'NONE', intensityMin: null, intensityMax: null }
                : { intensityType: v, intensityMin: draft.intensityMin ?? (v === 'RPE' ? 7 : 70), intensityMax: null })}
            />
          </Field>
          {intens !== 'NONE' ? (
            <Field label={intens === 'RPE' ? 'RPE' : 'Percentage van 1RM'} hint={draft.intensityMax != null ? 'Bereik.' : undefined}>
              <div className="flex items-center gap-1.5">
                <NullableNumField value={draft.intensityMin} onChange={v => set({ intensityMin: v })}
                  min={intens === 'RPE' ? 1 : 10} max={intens === 'RPE' ? 10 : 120} step={intens === 'RPE' ? 0.5 : 5}
                  ariaLabel={intens === 'RPE' ? 'RPE' : 'Percentage'} className={`${h9} w-24`} />
                {draft.intensityMax != null && (
                  <>
                    <span style={{ color: P.inkDim }}>-</span>
                    <NullableNumField value={draft.intensityMax} onChange={v => set({ intensityMax: v })}
                      min={intens === 'RPE' ? 1 : 10} max={intens === 'RPE' ? 10 : 120} step={intens === 'RPE' ? 0.5 : 5}
                      ariaLabel="Maximaal" className={`${h9} w-24`} />
                  </>
                )}
                <RangeToggle isRange={draft.intensityMax != null}
                  onToggle={() => set({ intensityMax: draft.intensityMax == null ? Math.min(intens === 'RPE' ? 10 : 120, (draft.intensityMin ?? 7) + (intens === 'RPE' ? 1 : 5)) : null })} />
              </div>
            </Field>
          ) : <div className="hidden md:block" />}
          <Field label="RIR" hint="Reps in reserve.">
            <NullableNumField value={paramValue(draft.extraParams, 'rir') as number | null} onChange={v => set({ extraParams: withParam(draft.extraParams, 'rir', v) })}
              min={0} max={10} ariaLabel="Reps in reserve" className={h9} />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Doelen (optioneel)" hint="Elke schakelaar zet een doel dat de atleet in de training ziet.">
            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-1">
              <OptionSwitch checked={hasParam(draft.extraParams, 'zone')} label="Zone"
                onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'zone', v ? 2 : null) })} />
              <OptionSwitch checked={hasParam(draft.extraParams, 'pace')} label="Tempo"
                onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'pace', v ? '5:00' : null) })} />
              <OptionSwitch checked={hasParam(draft.extraParams, 'hartslag')} label="Hartslag"
                onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'hartslag', v ? 140 : null) })} />
              <OptionSwitch checked={intens === 'RPE'} label="RPE"
                onCheckedChange={v => set(v ? { intensityType: 'RPE', intensityMin: 6, intensityMax: null } : { intensityType: 'NONE', intensityMin: null, intensityMax: null })} />
            </div>
          </Field>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {hasParam(draft.extraParams, 'zone') && (
              <Field label="Zone" hint="1 tot 5.">
                <NullableNumField value={paramValue(draft.extraParams, 'zone') as number | null} onChange={v => set({ extraParams: withParam(draft.extraParams, 'zone', v) })} min={1} max={5} ariaLabel="Hartslagzone" className={h9} />
              </Field>
            )}
            {hasParam(draft.extraParams, 'pace') && (
              <Field label="Tempo" hint="Minuten per kilometer.">
                <input className={monoVeld}
                  style={{ border: `1px solid ${P.line}`, background: P.field, color: P.ink }}
                  value={String(paramValue(draft.extraParams, 'pace') ?? '')} placeholder="5:00" aria-label="Tempo in minuten per kilometer"
                  onChange={e => set({ extraParams: withParam(draft.extraParams, 'pace', e.target.value || null) })} />
              </Field>
            )}
            {hasParam(draft.extraParams, 'hartslag') && (
              <Field label="Hartslag" hint="Slagen per minuut.">
                <NullableNumField value={paramValue(draft.extraParams, 'hartslag') as number | null} onChange={v => set({ extraParams: withParam(draft.extraParams, 'hartslag', v) })} min={40} max={250} ariaLabel="Hartslag" className={h9} />
              </Field>
            )}
            {intens === 'RPE' && (
              <Field label="RPE" hint="1 tot 10.">
                <NullableNumField value={draft.intensityMin} onChange={v => set({ intensityMin: v })} min={1} max={10} step={0.5} ariaLabel="RPE" className={h9} />
              </Field>
            )}
          </div>
        </div>
      )}

      <Field label="Opties">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mt-1">
          {mode === 'exercise' && (
            <OptionSwitch checked={draft.isBodyweight} onCheckedChange={v => set({ isBodyweight: v })} label="Lichaamsgewicht" hint="De atleet logt alleen herhalingen, geen kilo's." />
          )}
          <OptionSwitch checked={draft.completionOnly} onCheckedChange={v => set({ completionOnly: v, ...(v ? { repsPerSet: null, amrap: false } : {}) })} label="Alleen afvinken" hint="Geen invoer, alleen een vinkje." />
          {mode === 'exercise' && (
            <>
              <OptionSwitch checked={hasParam(draft.extraParams, 'bar_speed')} onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'bar_speed', v ? 0 : null) })} label="Staafsnelheid" hint="Voegt een m/s-veld toe voor de atleet." />
              <OptionSwitch checked={draft.trackMax !== false} onCheckedChange={v => set({ trackMax: v ? null : false })} label="Max bijhouden" hint="Gelogde sets tellen mee voor 1RM en records." />
            </>
          )}
          {/* Vermogen in watt hoort bij cardio (fiets, roeier, loopband). Bij kracht
              alleen nog zichtbaar als een oude rij hem al aan had, om hem uit te zetten. */}
          {(mode === 'cardio' || hasParam(draft.extraParams, 'peak_power')) && (
            <OptionSwitch checked={hasParam(draft.extraParams, 'peak_power')} onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'peak_power', v ? 0 : null) })} label="Vermogen" hint="Voegt een watt-veld per set toe voor de atleet." />
          )}
        </div>
      </Field>

      <Field label="Fase">
        <Segmented<Fase>
          ariaLabel="Fase in de training" value={fase}
          options={[{ value: 'MAIN', label: 'Hoofd' }, { value: 'WARMUP', label: 'Warming-up' }, { value: 'COOLDOWN', label: 'Cooldown' }]}
          onChange={v => set({ phase: v === 'MAIN' ? null : v })}
        />
      </Field>
    </div>
  )
}
