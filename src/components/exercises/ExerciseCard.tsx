'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Play, Edit, MoreHorizontal, PlayCircle, Heart, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EXERCISE_CATEGORIES, DIFFICULTIES } from '@/lib/exercise-constants'
import { cn } from '@/lib/utils'
import { MarkMatch } from '@/components/exercises/MarkMatch'
import { CATEGORY_COLORS } from '@/lib/palette'

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
    isFavorite?: boolean
  }
  onAddToCollection?: (id: string) => void
  /** When provided, clicking the card calls this instead of navigating to edit */
  onPreview?: () => void
  /** When provided, toont een hartje rechts-boven op de thumbnail. */
  onToggleFavorite?: (id: string, currentlyFavorite: boolean) => void
  /** Quick-add → handler krijgt de exercise-id. Toont Physitrack-stijl + bolletje
   *  rechtsonder op de thumbnail. */
  onQuickAdd?: (id: string) => void
  /** Wat er getypt is, om het overeenkomende stuk in de naam te markeren. */
  query?: string
}


const DIFFICULTY_DOTS = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 }

export function ExerciseCard({
  exercise,
  onAddToCollection,
  onPreview,
  onToggleFavorite,
  onQuickAdd,
  query,
}: ExerciseCardProps) {
  const category = EXERCISE_CATEGORIES.find(c => c.value === exercise.category)
  const difficulty = DIFFICULTIES.find(d => d.value === exercise.difficulty)
  const color = CATEGORY_COLORS[exercise.category] ?? '#E87A55'
  const dots = DIFFICULTY_DOTS[exercise.difficulty as keyof typeof DIFFICULTY_DOTS] ?? 1

  const hasVideo = exercise.mediaType === 'YOUTUBE' || exercise.mediaType === 'VIMEO'

  function getYouTubeThumbnail(url: string): string | null {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/)
    return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null
  }

  const thumbnail = exercise.thumbnailUrl
    || (exercise.mediaType === 'YOUTUBE' && exercise.videoUrl ? getYouTubeThumbnail(exercise.videoUrl) : null)

  const cardInner = (
    <Card className="group overflow-hidden transition-shadow hover:shadow-md cursor-pointer" style={{ borderRadius: '12px' }}>
      {/* Thumbnail / placeholder */}
      <div
        className="relative h-36 flex items-center justify-center"
        style={{ background: `${color}15` }}
      >
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
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

        {/* Play overlay — shown on hover when onPreview is set */}
        {onPreview && hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#081A1C]/0 group-hover:bg-[#081A1C]/45 transition-all">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: '#E87A55' }}
            >
              <Play className="w-5 h-5 text-[#F5F2ED] ml-0.5" />
            </div>
          </div>
        )}

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full text-[#0E2729]"
            style={{ background: color }}
          >
            {category?.label ?? exercise.category}
          </span>
        </div>

        {/* Favorite heart — top-right */}
        {onToggleFavorite && (
          <button
            type="button"
            aria-label={exercise.isFavorite ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleFavorite(exercise.id, exercise.isFavorite ?? false)
            }}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center bg-[#081A1C]/55 hover:bg-[#081A1C]/72 transition-colors"
          >
            <Heart
              className="w-4 h-4 transition-all"
              style={{
                color: exercise.isFavorite ? '#F0796C' : '#F5F2ED',
                fill: exercise.isFavorite ? '#F0796C' : 'transparent',
                strokeWidth: exercise.isFavorite ? 2 : 1.8,
              }}
            />
          </button>
        )}

        {/* Difficulty dots — bottom-right zodat het hartje top-right kan staan */}
        <div className="absolute bottom-2 right-2 flex gap-0.5 px-1.5 py-1 rounded-full bg-[#081A1C]/45">
          {[1, 2, 3].map(n => (
            <span
              key={n}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: n <= dots ? color : `${color}50` }}
            />
          ))}
        </div>

        {/* Quick-add — Physitrack-stijl + bolletje, altijd zichtbaar zodat je
            zonder hover door de bibliotheek kunt klikken. Plek: bottom-left zodat
            'ie de difficulty-dots niet overlapt. */}
        {onQuickAdd && (
          <button
            type="button"
            aria-label={`Voeg ${exercise.name} toe aan programma`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onQuickAdd(exercise.id)
            }}
            className="absolute bottom-2 left-2 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95"
            style={{ background: '#E87A55', color: '#0E2729' }}
          >
            <Plus className="w-4 h-4" strokeWidth={3} />
          </button>
        )}
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">
              <MarkMatch text={exercise.name} query={query ?? ''} />
            </h3>
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
                onClick={e => e.preventDefault()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onPreview && (
                <DropdownMenuItem onClick={e => { e.preventDefault(); onPreview() }}>
                  <Play className="w-4 h-4 mr-2" />
                  Video bekijken
                </DropdownMenuItem>
              )}
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

  if (onPreview) {
    return (
      <div
        role="button"
        tabIndex={0}
        className="block w-full text-left cursor-pointer"
        onClick={onPreview}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPreview()
          }
        }}
      >
        {cardInner}
      </div>
    )
  }

  return (
    <Link href={`/therapist/exercises/${exercise.id}/edit`} className="block">
      {cardInner}
    </Link>
  )
}
