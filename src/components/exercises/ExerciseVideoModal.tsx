'use client'

import dynamic from 'next/dynamic'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X, VideoOff, TrendingDown, TrendingUp, Lightbulb, Edit } from 'lucide-react'
import Link from 'next/link'
import { EXERCISE_CATEGORIES, DIFFICULTIES } from '@/lib/exercise-constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player') as any, { ssr: false }) as any

const MBT_GREEN = '#3ECF6A'

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH:    '#4ECDC4',
  MOBILITY:    '#60a5fa',
  PLYOMETRICS: '#f59e0b',
  CARDIO:      '#f87171',
  STABILITY:   '#a78bfa',
}

export type ExerciseForModal = {
  id?: string
  name: string
  description?: string | null
  category?: string
  difficulty?: string
  videoUrl?: string | null
  muscleLoads?: Record<string, number>
  coachingCues?: string[]
  easierVariant?: string | null
  harderVariant?: string | null
  sets?: number
  reps?: number
  repUnit?: string
  editHref?: string  // link to edit page (therapist only)
}

interface Props {
  open: boolean
  onClose: () => void
  exercise: ExerciseForModal | null
}

export function ExerciseVideoModal({ open, onClose, exercise }: Props) {
  if (!exercise) return null

  const categoryLabel = EXERCISE_CATEGORIES.find(c => c.value === exercise.category)?.label ?? exercise.category
  const difficultyLabel = DIFFICULTIES.find(d => d.value === exercise.difficulty)?.label ?? exercise.difficulty
  const color = CATEGORY_COLORS[exercise.category ?? ''] ?? '#4ECDC4'

  const primaryMuscles = exercise.muscleLoads
    ? Object.entries(exercise.muscleLoads)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : []

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-md mx-auto p-0 overflow-hidden gap-0"
        style={{ borderRadius: '20px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Video / placeholder */}
        <div className="relative">
          {exercise.videoUrl ? (
            <div className="aspect-video bg-black">
              <ReactPlayer
                url={exercise.videoUrl}
                width="100%"
                height="100%"
                controls
                light
                playIcon={
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: '#4ECDC4' }}
                  >
                    <span className="text-white text-xl ml-1">▶</span>
                  </div>
                }
              />
            </div>
          ) : (
            <div
              className="aspect-video flex flex-col items-center justify-center gap-2"
              style={{ background: `${color}15` }}
            >
              <VideoOff className="w-8 h-8 text-zinc-400" />
              <p className="text-sm text-zinc-400">Geen video beschikbaar</p>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 text-white hover:bg-black/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Name + badges */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold text-lg leading-tight flex-1">{exercise.name}</h2>
              {exercise.editHref && (
                <Link href={exercise.editHref}>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0 h-8 text-xs">
                    <Edit className="w-3.5 h-3.5" />
                    Bewerken
                  </Button>
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {exercise.category && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ background: color }}
                >
                  {categoryLabel}
                </span>
              )}
              {exercise.difficulty && (
                <Badge variant="outline" className="text-xs">{difficultyLabel}</Badge>
              )}
              {exercise.sets && exercise.reps && (
                <Badge variant="secondary" className="text-xs">
                  {exercise.sets} × {exercise.reps} {exercise.repUnit ?? 'reps'}
                </Badge>
              )}
            </div>
          </div>

          {/* Description */}
          {exercise.description && (
            <p className="text-sm text-zinc-600 leading-relaxed">{exercise.description}</p>
          )}

          {/* Muscle groups */}
          {primaryMuscles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Spiergroepen</p>
              <div className="flex flex-wrap gap-1.5">
                {primaryMuscles.map(([muscle, load]) => (
                  <div
                    key={muscle}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                    style={{ background: `${color}18` }}
                  >
                    <span style={{ color }}>{muscle}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <span
                          key={n}
                          className="w-1 h-2.5 rounded-sm"
                          style={{ background: n <= load ? color : `${color}30` }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coaching cues */}
          {exercise.coachingCues && exercise.coachingCues.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" style={{ color: MBT_GREEN }} />
                Coaching cues
              </p>
              <ul className="space-y-1.5">
                {exercise.coachingCues.map((cue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                    <span className="font-bold mt-0.5 shrink-0" style={{ color: MBT_GREEN }}>·</span>
                    {cue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Variants */}
          {(exercise.easierVariant || exercise.harderVariant) && (
            <div className="space-y-1.5">
              {exercise.easierVariant && (
                <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: '#fefce8' }}>
                  <TrendingDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-amber-700">
                    <span className="font-semibold">Te moeilijk?</span> Probeer: {exercise.easierVariant}
                  </span>
                </div>
              )}
              {exercise.harderVariant && (
                <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: '#f0fdf4' }}>
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: MBT_GREEN }} />
                  <span style={{ color: '#166534' }}>
                    <span className="font-semibold">Te makkelijk?</span> Probeer: {exercise.harderVariant}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
