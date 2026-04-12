'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSavedWorkouts, deleteWorkout, type Workout, WORKOUT_TYPES } from '@/lib/workout-constants'
import { Plus, Search, Zap, Dumbbell, Trash2, ChevronRight, Clock } from 'lucide-react'
import { WORKOUT_ICON_MAP } from '@/components/icons'

export default function MyWorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    setWorkouts(getSavedWorkouts())
  }, [])

  const completed = workouts.filter(w => w.completedAt)
  const templates = workouts.filter(w => !w.completedAt && !w.startedAt)

  const filtered = (list: Workout[]) =>
    search ? list.filter(w => w.name.toLowerCase().includes(search.toLowerCase())) : list

  function handleDelete(id: string) {
    deleteWorkout(id)
    setWorkouts(getSavedWorkouts())
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-2xl font-bold">Mijn Workouts</h1>
        <p className="text-zinc-400 text-xs mt-1">{workouts.length} workouts</p>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Zoek workouts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-white"
            style={{ borderRadius: '12px' }}
          />
        </div>

        {/* Quick Start */}
        <Link href="/athlete/workouts/new">
          <Card style={{ borderRadius: '14px', borderLeft: '3px solid #4ECDC4' }} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#4ECDC420' }}>
                <Zap className="w-6 h-6" style={{ color: '#4ECDC4' }} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-base">Quick Start</p>
                <p className="text-xs text-muted-foreground">Start een nieuwe workout</p>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-300" />
            </CardContent>
          </Card>
        </Link>

        {/* Completed workouts */}
        {filtered(completed).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Afgerond</p>
            <div className="space-y-2">
              {filtered(completed).map(w => (
                <WorkoutCard key={w.id} workout={w} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* Templates / in-progress */}
        {filtered(templates).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Templates</p>
            <div className="space-y-2">
              {filtered(templates).map(w => (
                <WorkoutCard key={w.id} workout={w} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {workouts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Dumbbell className="w-10 h-10 text-zinc-300 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nog geen workouts</p>
            <p className="text-xs text-muted-foreground mt-1">Tik op Quick Start om je eerste workout te maken</p>
          </div>
        )}
      </div>
    </div>
  )
}

function WorkoutCard({ workout, onDelete }: { workout: Workout; onDelete: (id: string) => void }) {
  const type = WORKOUT_TYPES.find(t => t.value === workout.type)
  const color = type?.color ?? '#4ECDC4'

  return (
    <Card style={{ borderRadius: '12px', borderLeft: `3px solid ${color}` }} className="hover:shadow-md transition-shadow">
      <CardContent className="p-3 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: color + '20' }}
        >
          {(() => { const Icon = type ? WORKOUT_ICON_MAP[type.value] : null; return Icon ? <Icon size={20} /> : '💪' })()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{workout.name || 'Workout'}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span style={{ color }}>{type?.label ?? workout.type}</span>
            <span>·</span>
            <span>{workout.exercises.length} oefeningen</span>
            {workout.duration && (
              <>
                <span>·</span>
                <Clock className="w-3 h-3 inline" />
                <span>{workout.duration} min</span>
              </>
            )}
          </div>
        </div>
        <button onClick={() => onDelete(workout.id)} className="p-2 text-zinc-300 hover:text-red-400 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </CardContent>
    </Card>
  )
}
