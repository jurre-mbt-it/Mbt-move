/**
 * Validatie van één rij in de bloklijst van een planner-workout (zie
 * lib/planner-blocks.ts) en van de groepen op het item. Los van de router
 * zodat het te testen is zonder Prisma.
 */
import { z } from 'zod'
import { parseStructured } from '@/lib/cardio-workout'

export const blockParamSchema = z.object({
  id: z.string().max(60).optional(),
  label: z.string().min(1).max(60),
  type: z.string().max(20).optional(),
  value: z.union([z.string().max(200), z.number().min(-1_000_000).max(1_000_000)]).nullable().optional(),
  valueMax: z.union([z.string().max(200), z.number().min(-1_000_000).max(1_000_000)]).nullable().optional(),
  unit: z.string().max(20).optional(),
  options: z.array(z.string().max(60)).max(20).optional(),
  min: z.number().min(-1_000_000).max(1_000_000).optional(),
  max: z.number().min(-1_000_000).max(1_000_000).optional(),
})

const HTTP_URL = /^https?:\/\/\S+$/i

export const blockInputSchema = z.object({
  blockKind: z.enum(['EXERCISE', 'NOTE', 'BREAK']).default('EXERCISE'),
  exerciseId: z.string().nullable().optional(),
  sets: z.number().int().min(1).max(50).default(3),
  reps: z.number().int().min(1).max(1000).default(10),
  repUnit: z.string().max(20).default('reps'),
  restTime: z.number().int().min(0).max(3600).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  setsMax: z.number().int().min(1).max(50).nullable().optional(),
  repsMax: z.number().int().min(1).max(1000).nullable().optional(),
  intensityType: z.enum(['NONE', 'RPE', 'PERCENT_1RM', 'RELATIVE_DAILY_MAX', 'TECHNIQUE', 'TEXT']).default('NONE'),
  intensityMin: z.number().min(-1000).max(1000).nullable().optional(),
  intensityMax: z.number().min(-1000).max(1000).nullable().optional(),
  intensityText: z.string().max(200).nullable().optional(),
  supersetGroup: z.string().max(4).nullable().optional(),
  supersetOrder: z.number().int().min(0).max(20).default(0),
  extraParams: z.array(blockParamSchema).max(20).default([]),
  repsPerSet: z.array(z.number().int().min(1).max(1000)).max(50).nullable().optional(),
  amrap: z.boolean().default(false),
  phase: z.enum(['WARMUP', 'COOLDOWN']).nullable().optional(),
  isBodyweight: z.boolean().default(false),
  completionOnly: z.boolean().default(false),
  trackMax: z.boolean().nullable().optional(),
  text: z.string().max(500).nullable().optional(),
  videoUrl: z.string().max(500).regex(HTTP_URL, 'Alleen een http(s)-link').nullable().optional(),
  durationSec: z.number().int().min(10).max(3600).nullable().optional(),
}).superRefine((b, ctx) => {
  if (b.blockKind === 'EXERCISE' && !b.exerciseId) {
    ctx.addIssue({ code: 'custom', path: ['exerciseId'], message: 'Kies een oefening' })
  }
  if (b.blockKind === 'NOTE' && !(b.text ?? '').trim()) {
    ctx.addIssue({ code: 'custom', path: ['text'], message: 'De notitie is leeg' })
  }
  if (b.blockKind === 'BREAK' && b.durationSec == null) {
    ctx.addIssue({ code: 'custom', path: ['durationSec'], message: 'Geef de pauze een duur' })
  }
  if (b.repsPerSet && b.repsPerSet.length !== b.sets) {
    ctx.addIssue({ code: 'custom', path: ['repsPerSet'], message: 'Vul voor elke set een aantal in' })
  }
})

export type BlockInputParsed = z.infer<typeof blockInputSchema>

export const itemGroupSchema = z.object({
  kind: z.enum(['SUPERSET', 'CIRCUIT']),
  name: z.string().max(60).optional(),
  description: z.string().max(300).optional(),
  rounds: z.number().int().min(1).max(10).optional(),
  timeCapSec: z.number().int().min(10).max(7200).optional(),
  restSec: z.number().int().min(0).max(600).optional(),
})

export const itemGroupsSchema = z.record(z.string().regex(/^[A-F]$/), itemGroupSchema)

/** Programma-groepen per week-dag, sleutel "w1d2". */
export const programGroupsSchema = z.record(z.string().regex(/^w\d+d\d+$/), itemGroupsSchema)

/** Cardio-workout per programmadag: alleen de gestructureerde vorm (version 1), max 8 kB per dag. */
export const programCardioSchema = z.record(
  z.string().regex(/^w\d+d\d+$/),
  z.record(z.string(), z.unknown()).refine(v => parseStructured(v) !== null && JSON.stringify(v).length <= 8000, 'Ongeldige cardio-workout'),
)
