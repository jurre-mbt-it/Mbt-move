import type { CustomParameter } from '@/components/programs/types'
import { MOCK_EXERCISES } from './exercise-constants'

export const STANDARD_PARAMS = [
  { label: 'Tempo',        type: 'text'   as const, unit: '',     placeholder: '3-1-2-0' },
  { label: 'RPE',          type: 'slider' as const, unit: '/10',  min: 1, max: 10 },
  { label: 'Pauze',        type: 'number' as const, unit: 'sec',  min: 0 },
  { label: 'Gewicht',      type: 'number' as const, unit: 'kg',   min: 0 },
  { label: 'Afstand',      type: 'number' as const, unit: 'm',    min: 0 },
  { label: 'Hartslag',     type: 'number' as const, unit: 'bpm',  min: 0 },
  { label: 'Moeite',       type: 'select' as const, options: ['Makkelijk', 'Matig', 'Zwaar', 'Maximaal'] },
  { label: 'Band kleur',   type: 'select' as const, options: ['Geel', 'Rood', 'Groen', 'Blauw', 'Zwart'] },
]

export const REP_UNITS = [
  { value: 'reps', label: 'reps' },
  { value: 'sec',  label: 'sec'  },
  { value: 'min',  label: 'min'  },
]

// Visual colors per superset group letter
export const SUPERSET_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  A: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
  B: { bg: '#fefce8', border: '#fde047', text: '#a16207' },
  C: { bg: '#fdf4ff', border: '#d8b4fe', text: '#7e22ce' },
  D: { bg: '#fff1f2', border: '#fda4af', text: '#be123c' },
  E: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  F: { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' },
}

export const SUPERSET_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export const DEFAULT_CUSTOM_PARAMS: CustomParameter[] = [
  { id: 'cp1', label: 'Kabelgewicht', type: 'number', unit: 'kg', min: 0, defaultValue: 0, isGlobal: true, order: 0 },
  { id: 'cp2', label: 'Elastiek kleur', type: 'select', options: ['Geel', 'Rood', 'Groen', 'Blauw', 'Zwart'], isGlobal: true, order: 1 },
  { id: 'cp3', label: 'Pijnniveau',   type: 'slider', unit: '/10', min: 0, max: 10, defaultValue: 0, isGlobal: false, order: 2 },
]

// Mock programs for the list page
export const MOCK_PROGRAMS = [
  {
    id: 'p1',
    name: 'Knie Revalidatie — Fase 1',
    description: 'Initieel herstelprotocol na VKB reconstructie',
    status: 'ACTIVE',
    patientName: 'Jan de Vries',
    weeks: 4,
    daysPerWeek: 3,
    exerciseCount: 8,
    createdAt: new Date('2025-03-01'),
    isTemplate: false,
  },
  {
    id: 'p2',
    name: 'Schouder Stabilisatie',
    description: 'Rotatorcuff versterking na SLAP laesie',
    status: 'DRAFT',
    patientName: 'Maria Jansen',
    weeks: 6,
    daysPerWeek: 2,
    exerciseCount: 6,
    createdAt: new Date('2025-03-10'),
    isTemplate: false,
  },
  {
    id: 'p3',
    name: 'Heup Mobiliteit Template',
    description: 'Standaard heup mobilisatie protocol',
    status: 'ACTIVE',
    patientName: null,
    weeks: 3,
    daysPerWeek: 4,
    exerciseCount: 5,
    createdAt: new Date('2025-02-15'),
    isTemplate: true,
  },
]

// Pre-populated program for the edit demo (id: p1)
export function buildMockProgram() {
  const ex = MOCK_EXERCISES

  const makeEx = (
    idx: number,
    e: typeof ex[number],
    day: number,
    week: number,
    sets = 3,
    reps = 10,
    supersetGroup: string | null = null,
    supersetOrder = 0,
  ) => ({
    uid: `uid-${idx}`,
    exerciseId: e.id,
    name: e.name,
    category: e.category,
    difficulty: e.difficulty,
    muscleLoads: e.muscleLoads as Record<string, number>,
    easierVariantId: null,
    harderVariantId: null,
    videoUrl: e.videoUrl,
    sets,
    reps,
    repUnit: 'reps' as const,
    rest: 60,
    extraParams: [],
    supersetGroup,
    supersetOrder,
    selected: false,
    day,
    week,
  })

  return [
    makeEx(1, ex[0], 1, 1, 4, 8),                    // Bulgarian Split Squat — Day 1
    makeEx(2, ex[1], 1, 1, 3, 6),                    // Nordic Hamstring — Day 1
    makeEx(3, ex[2], 1, 1, 2, 45, 'A', 0),           // Hip 90/90 — Superset A, Day 1
    makeEx(4, ex[3], 1, 1, 3, 10, 'A', 1),           // Single Leg Deadlift — Superset A, Day 1
    makeEx(5, ex[5], 2, 1, 3, 12),                   // Schouder Ext. Rot. — Day 2
    makeEx(6, ex[4], 2, 1, 3, 5),                    // Box Jump — Day 2
  ]
}
