'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { DarkButton, MetaLabel, P, CARD } from '@/components/dark-ui'
import { BlockRows } from '@/components/week-planner/BlockRows'
import { ExerciseBlockDialog, type BlockDialogType } from '@/components/week-planner/ExerciseBlockDialog'
import { newBlock, type BlockDraft, type ItemGroup, type ItemGroups, type PlannerBlock } from '@/lib/planner-blocks'

let teller = 100
const rij = (patch: Partial<PlannerBlock>): PlannerBlock => ({
  ...newBlock(patch.blockKind ?? 'EXERCISE'),
  id: `p${teller++}`,
  order: teller,
  ...patch,
})

const START: PlannerBlock[] = [
  rij({ exerciseId: 'e1', exerciseName: 'Fietsen rustig', exerciseCategory: 'CARDIO', sets: 1, reps: 8, repUnit: 'min', phase: 'WARMUP' }),
  rij({ exerciseId: 'e2', exerciseName: 'Barbell Back Squat', exerciseCategory: 'STRENGTH', sets: 4, reps: 8, repsPerSet: [8, 6, 6, 4], restTime: 120, intensityType: 'RPE', intensityMin: 8, extraParams: [{ id: 'tempo', label: 'Tempo', type: 'text', value: '3-1-1-0' }] }),
  rij({ exerciseId: 'e3', exerciseName: 'Romanian Deadlift', exerciseCategory: 'STRENGTH', sets: 3, reps: 5, amrap: true, restTime: 90 }),
  rij({ exerciseId: 'e4', exerciseName: 'Bulgarian Split Squat', exerciseCategory: 'STRENGTH', sets: 3, reps: 10, repUnit: 'reps/zijde', supersetGroup: 'A' }),
  rij({ exerciseId: 'e5', exerciseName: 'Copenhagen Plank', exerciseCategory: 'STABILITY', sets: 3, reps: 30, repUnit: 'sec/zijde', supersetGroup: 'A' }),
  rij({ blockKind: 'NOTE', text: 'Vandaag ligt de nadruk op tempo, niet op gewicht.' }),
  rij({ exerciseId: 'e6', exerciseName: 'Kettlebell Swing', exerciseCategory: 'PLYOMETRICS', sets: 3, reps: 15, supersetGroup: 'B' }),
  rij({ exerciseId: 'e7', exerciseName: 'Box Jump', exerciseCategory: 'PLYOMETRICS', sets: 3, reps: 6, supersetGroup: 'B' }),
  rij({ blockKind: 'BREAK', durationSec: 180 }),
  rij({ exerciseId: 'e8', exerciseName: 'Hamstring stretch', exerciseCategory: 'MOBILITY', sets: 2, reps: 45, repUnit: 'sec', phase: 'COOLDOWN', completionOnly: true }),
]

const START_GROEPEN: ItemGroups = {
  B: { kind: 'CIRCUIT', name: 'Finisher', rounds: 3, timeCapSec: 720, restSec: 60 },
}

export function Preview() {
  const [blocks, setBlocks] = useState<PlannerBlock[]>(START)
  const [groups, setGroups] = useState<ItemGroups>(START_GROEPEN)
  const [dialoog, setDialoog] = useState<{ type: BlockDialogType; edit: PlannerBlock | null; letter: string | null } | null>(null)

  async function opslaan(d: BlockDraft) {
    setBlocks(prev => d.id
      ? prev.map(b => (b.id === d.id ? { ...b, ...d, id: b.id, order: b.order } : b))
      : [...prev, { ...d, id: `n${teller++}`, order: prev.length }])
  }
  async function groep(letter: string, g: ItemGroup) { setGroups(prev => ({ ...prev, [letter]: g })) }
  const verwijder = (b: PlannerBlock) => setBlocks(prev => prev.filter(x => x.id !== b.id))
  const verplaats = (b: PlannerBlock, dir: -1 | 1) => setBlocks(prev => {
    const i = prev.findIndex(x => x.id === b.id); const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n
  })
  const open = (type: BlockDialogType, edit: PlannerBlock | null = null, letter: string | null = null) => setDialoog({ type, edit, letter })

  return (
    <div className="athletic-dark min-h-screen p-8" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <MetaLabel>Voorvertoning</MetaLabel>
          <h1 className="text-2xl font-black mt-1">Planner-blokken, ontwerp</h1>
          <p className="text-sm mt-1" style={{ color: P.inkMuted }}>
            Echte componenten op voorbeelddata. Zoeken in de bibliotheek werkt alleen ingelogd; alles verder is klikbaar.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          {/* Dagcel zoals in de weekplanner */}
          <div>
            <MetaLabel>Dagcel in de kalender</MetaLabel>
            <div className="rounded-xl p-2 flex flex-col gap-1 mt-2" style={{ ...CARD, minHeight: 130 }}>
              <div className="flex items-center justify-between">
                <span className="text-xs athletic-mono font-bold px-1.5 py-px rounded-md" style={{ color: P.bg, background: P.ink }}>14</span>
                <span className="athletic-mono text-[9px]" style={{ color: P.inkDim }}>W3</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-semibold" style={{ background: '#C9613F', color: '#0A1C1D' }}>
                <span className="truncate flex-1">Onderlichaam kracht</span>
              </div>
              <div className="athletic-mono px-2 pt-1" style={{ fontSize: 9, letterSpacing: '0.06em', color: P.inkMuted }}>1 u 05 min</div>
              <BlockRows
                compact blocks={blocks} groups={groups}
                onEdit={b => open('exercise', b)} onRemove={verwijder} onMove={verplaats}
                onEditGroup={l => open('circuit', null, l)}
              />
              <button type="button" onClick={() => open('exercise')}
                className="self-start text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer mbt-btn-hover opacity-70 hover:opacity-100"
                style={{ color: P.brand, borderColor: 'rgba(232,122,85,0.4)', background: 'rgba(232,122,85,0.08)' }}>
                <Plus className="w-3 h-3" /> Oefening
              </button>
            </div>
          </div>

          {/* Zijpaneel-weergave */}
          <div>
            <MetaLabel>Zijpaneel</MetaLabel>
            <div className="rounded-xl p-4 mt-2 space-y-2" style={{ ...CARD }}>
              <MetaLabel>Geplande oefeningen</MetaLabel>
              <BlockRows
                blocks={blocks} groups={groups}
                onEdit={b => open('exercise', b)} onRemove={verwijder} onMove={verplaats}
                onEditGroup={l => open('circuit', null, l)}
              />
              <DarkButton variant="secondary" size="sm" onClick={() => open('exercise')} className="w-full text-xs">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Oefening toevoegen
              </DarkButton>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <DarkButton variant="primary" size="sm" onClick={() => open('exercise')}>Pop-up: oefening</DarkButton>
              <DarkButton variant="secondary" size="sm" onClick={() => open('exercise', blocks[1] ?? null)}>Bewerken: squat 8/6/6/4</DarkButton>
              <DarkButton variant="secondary" size="sm" onClick={() => open('cardio')}>Pop-up: cardio</DarkButton>
              <DarkButton variant="secondary" size="sm" onClick={() => open('circuit')}>Pop-up: circuit</DarkButton>
              <DarkButton variant="secondary" size="sm" onClick={() => open('note')}>Pop-up: notitie</DarkButton>
              <DarkButton variant="secondary" size="sm" onClick={() => open('break')}>Pop-up: pauze</DarkButton>
            </div>
          </div>
        </div>
      </div>

      {dialoog && (
        <ExerciseBlockDialog
          open
          onClose={() => setDialoog(null)}
          dayLabel="Maandag 14 september"
          workoutName="Onderlichaam kracht"
          initialType={dialoog.type}
          editBlock={dialoog.edit}
          editGroupLetter={dialoog.letter}
          blocks={blocks}
          groups={groups}
          defaultCategory="STRENGTH"
          saving={false}
          onSubmitBlock={opslaan}
          onSubmitGroup={groep}
        />
      )}
    </div>
  )
}
