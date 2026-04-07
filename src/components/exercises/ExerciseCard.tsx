'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Play, Edit, MoreHorizontal, PlayCircle } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EXERCISE_CATEGORIES, DIFFICULTIES } from '@/lib/exercise-constants'
import { cn } from '@/lib/utils'

interface ExerciseCardProps {
  exercise: {
    id: string
    name: string
    category: string
    bodyRegion: string[]
    difficulty: string
    mediaType?: string | null
    videoUrl?: string | null
    thumbnailUrl?: string | null
    description?: string | null
    tags?: string[]
  }
  onAddToCollection?: (id: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH:    '#3ECF6A',
  MOBILITY:    '#60a5fa',
  PLYOMETRICS: '#f59e0b',
  CARDIO:      '#f87171',
  STABILITY:   '#a78bfa',
}

const DIFFICULTY_DOTS = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 }

export function ExerciseCard({ exercise, onAddToCollection }: ExerciseCardProps) {
  const category = EXERCISE_CATEGORIES.find(c => c.value === exercise.category)
  const difficulty = DIFFICULTIES.find(d => d.value === exercise.difficulty)
  const color = CATEGORY_COLORS[exercise.category] ?? '#3ECF6A'
  const dots = DIFFICULTY_DOTS[exercise.difficulty as keyof typeof DIFFICULTY_DOTS] ?? 1

  const hasVideo = exercise.mediaType === 'YOUTUBE' || exercise.mediaType === 'VIMEO'

  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-md" style={{ borderRadius: '12px' }}>
      {/* Thumbnail / placeholder */}
      <div
        className="relative h-36 flex items-center justify-center"
        style={{ background: `${color}15` }}
      >
        {exercise.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={exercise.thumbnailUrl}
            alt={exercise.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: `${color}30` }}
          >
            {hasVideo ? (
              <PlayCircle className="w-6 h-6" style={{ color }} />
            ) : (
              <Play className="w-6 h-6" style={{ color }} />
            )}
          </div>
        )}

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
            style={{ background: color }}
          >
            {category?.label ?? exercise.category}
          </span>
        </div>

        {/* Difficulty dots */}
        <div className="absolute top-2 right-2 flex gap-0.5">
          {[1, 2, 3].map(n => (
            <span
              key={n}
              className="w-2 h-2 rounded-full"
              style={{ background: n <= dots ? color : `${color}40` }}
            />
          ))}
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{exercise.name}</h3>
            {exercise.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{exercise.description}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/therapist/exercises/${exercise.id}/edit`} className="flex items-center gap-2">
                  <Edit className="w-4 h-4" />
                  Bewerken
                </Link>
              </DropdownMenuItem>
              {onAddToCollection && (
                <DropdownMenuItem onClick={() => onAddToCollection(exercise.id)}>
                  Aan collectie toevoegen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tags */}
        {exercise.tags && exercise.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {exercise.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                {tag}
              </Badge>
            ))}
            {exercise.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                +{exercise.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Difficulty label */}
        <p className="text-xs text-muted-foreground mt-2">{difficulty?.label}</p>
      </CardContent>
    </Card>
  )
}
