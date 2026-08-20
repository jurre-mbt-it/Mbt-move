'use client'

import dynamic from 'next/dynamic'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X, VideoOff, TrendingDown, TrendingUp, Lightbulb, Edit } from 'lucide-react'
import Link from 'next/link'
import { EXERCISE_CATEGORIES, DIFFICULTIES } from '@/lib/exercise-constants'
import { CATEGORY_COLORS } from '@/lib/palette'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player') as any, { ssr: false }) as any

const MBT_GREEN = 'var(--p-brand)'


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
  const color = CATEGORY_COLORS[exercise.category ?? ''] ?? 'var(--p-brand)'

  const primaryMuscles = exercise.muscleLoads
    ? Object.entries(exercise.muscleLoads)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : []

  // Radix zet altijd een aria-describedby op DialogContent, ook als er geen
  // DialogDescription bestaat. Bij een oefening zonder omschrijving wijst dat
  // naar een id die nergens staat, en dat logt een console-warning. Alleen dan
  // halen we het attribuut weg; mét omschrijving blijft de koppeling intact.
  const describedBy = exercise.description ? {} : { 'aria-describedby': undefined }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        hideCloseButton
        {...describedBy}
        className="max-w-md mx-auto p-0 overflow-hidden gap-0"
        style={{ borderRadius: '20px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Video / placeholder */}
        <div className="relative">
          {exercise.videoUrl ? (
            <div className="aspect-video bg-black">
              <ReactPlayer
                src={exercise.videoUrl}
                width="100%"
                height="100%"
                controls
                light
                playIcon={
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--p-brand)' }}
                  >
                    <span className="text-[var(--p-ink)] text-xl ml-1">▶</span>
                  </div>
                }
              />
            </div>
          ) : (
            <div
              className="aspect-video flex flex-col items-center justify-center gap-2"
              style={{ background: `${color}15` }}
            >
              <VideoOff className="w-8 h-8 text-[var(--p-ink-muted)]" />
              <p className="text-sm text-[var(--p-ink-muted)]">Geen video beschikbaar</p>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--p-bg)]/55 text-[var(--p-ink)] hover:bg-[var(--p-bg)]/72 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Name + badges */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="font-bold text-lg leading-tight tracking-normal flex-1">{exercise.name}</DialogTitle>
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
                  className="text-xs font-semibold px-2 py-0.5 rounded-full text-[var(--p-bg)]"
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
            <DialogDescription className="text-sm text-[var(--p-ink-muted)] leading-relaxed">{exercise.description}</DialogDescription>
          )}

          {/* Muscle groups */}
          {primaryMuscles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--p-ink-muted)] uppercase tracking-wide mb-2">Spiergroepen</p>
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
              <p className="text-xs font-semibold text-[var(--p-ink-muted)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" style={{ color: MBT_GREEN }} />
                Coaching cues
              </p>
              <ul className="space-y-1.5">
                {exercise.coachingCues.map((cue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--p-ink-muted)]">
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
                <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(245,185,66,0.10)' }}>
                  <TrendingDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--p-gold)' }} />
                  <span style={{ color: 'var(--p-gold)' }}>
                    <span className="font-semibold">Te moeilijk?</span> Probeer: {exercise.easierVariant}
                  </span>
                </div>
              )}
              {exercise.harderVariant && (
                <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(232,122,85,0.10)' }}>
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: MBT_GREEN }} />
                  <span style={{ color: 'var(--p-brand)' }}>
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
