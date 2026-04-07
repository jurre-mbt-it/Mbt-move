'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { getTodayExercises, TODAY_DAY, DAY_NAMES } from '@/lib/patient-constants'
import { CheckCircle2, ChevronLeft, Clock, Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import type { ExerciseLogEntry } from '@/lib/patient-constants'

export default function SessionPage() {
  const router = useRouter()
  const exercises = getTodayExercises()

  const [logs, setLogs] = useState<Record<string, ExerciseLogEntry>>(() =>
    Object.fromEntries(exercises.map(e => [e.uid, {
      exerciseId: e.exerciseId,
      setsCompleted: e.sets,
      repsCompleted: e.reps,
      weight: null,
      painLevel: null,
      done: false,
    }]))
  )
  const [expanded, setExpanded] = useState<string | null>(exercises[0]?.uid ?? null)
  const [elapsed, setElapsed] = useState(0)
  const [showComplete, setShowComplete] = useState(false)
  const [painLevel, setPainLevel] = useState<number | null>(null)
  const [exertion, setExertion] = useState<number | null>(null)
  const [sessionNotes, setSessionNotes] = useState('')

  useEffect(() => {
    const timer = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const doneCount = Object.values(logs).filter(l => l.done).length
  const progress = exercises.length > 0 ? (doneCount / exercises.length) * 100 : 0
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  const toggleDone = (uid: string) => {
    setLogs(prev => {
      const updated = { ...prev, [uid]: { ...prev[uid], done: !prev[uid].done } }
      // Auto-expand next undone exercise
      if (!prev[uid].done) {
        const nextUndone = exercises.find(e => !updated[e.uid].done)
        setExpanded(nextUndone?.uid ?? null)
      }
      return updated
    })
  }

  const updateLog = (uid: string, field: keyof ExerciseLogEntry, value: number | null) => {
    setLogs(prev => ({ ...prev, [uid]: { ...prev[uid], [field]: value } }))
  }

  const handleFinish = () => {
    router.push('/patient/dashboard')
  }

  if (showComplete) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#FAFAFA' }}>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 text-4xl" style={{ background: '#f0fdf4' }}>
            🎉
          </div>
          <h1 className="text-2xl font-bold mb-1">Goed gedaan!</h1>
          <p className="text-muted-foreground text-sm mb-6">
            {doneCount} van {exercises.length} oefeningen · {mins}:{secs.toString().padStart(2, '0')} min
          </p>

          {/* Pain & exertion */}
          <div className="w-full max-w-sm space-y-4 text-left">
            <RatingRow label="Pijnniveau" value={painLevel} max={10} onChange={setPainLevel} colors={['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444']} />
            <RatingRow label="Inspanning (RPE)" value={exertion} max={10} onChange={setExertion} colors={['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444']} />

            <div>
              <label className="text-sm font-medium block mb-1.5">Notities (optioneel)</label>
              <textarea
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                placeholder="Hoe voelde de sessie?"
                className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-200"
                rows={3}
              />
            </div>
          </div>
        </div>
        <div className="px-6 pb-8">
          <Button
            onClick={handleFinish}
            className="w-full h-12 text-base font-semibold"
            style={{ background: '#3ECF6A' }}
          >
            Sessie opslaan
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-6" style={{ background: '#FAFAFA' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3 border-b" style={{ background: '#fff' }}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => router.back()} className="p-1 -ml-1">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{DAY_NAMES[TODAY_DAY - 1]} · Week 1</p>
            <p className="font-semibold text-sm">{doneCount}/{exercises.length} gedaan</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Exercise list */}
      <div className="px-4 pt-4 space-y-3">
        {exercises.map((e, idx) => {
          const log = logs[e.uid]
          const isExpanded = expanded === e.uid

          return (
            <Card
              key={e.uid}
              style={{
                borderRadius: '14px',
                borderColor: log.done ? '#bbf7d0' : undefined,
                background: log.done ? '#f0fdf4' : undefined,
              }}
            >
              <CardContent className="px-4 py-3">
                {/* Header row */}
                <button
                  className="w-full flex items-center gap-3 text-left"
                  onClick={() => setExpanded(isExpanded ? null : e.uid)}
                >
                  <button
                    className="shrink-0"
                    onClick={ev => { ev.stopPropagation(); toggleDone(e.uid) }}
                  >
                    <CheckCircle2
                      className="w-6 h-6 transition-colors"
                      style={{ color: log.done ? '#3ECF6A' : '#d4d4d8' }}
                      fill={log.done ? '#3ECF6A' : 'none'}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-semibold text-sm', log.done && 'line-through text-muted-foreground')}>
                      {idx + 1}. {e.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{e.sets} × {e.reps} {e.repUnit}</p>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
                </button>

                {/* Expanded logging */}
                {isExpanded && (
                  <div className="mt-4 space-y-3 border-t pt-3">
                    <div className="grid grid-cols-3 gap-3">
                      <LogInput
                        label="Sets"
                        value={log.setsCompleted}
                        min={0}
                        max={20}
                        onChange={v => updateLog(e.uid, 'setsCompleted', v)}
                      />
                      <LogInput
                        label="Reps"
                        value={log.repsCompleted}
                        min={0}
                        max={100}
                        onChange={v => updateLog(e.uid, 'repsCompleted', v)}
                      />
                      <LogInput
                        label="Gewicht (kg)"
                        value={log.weight ?? 0}
                        min={0}
                        max={500}
                        step={2.5}
                        onChange={v => updateLog(e.uid, 'weight', v)}
                      />
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Pijn tijdens oefening</p>
                      <div className="flex gap-1">
                        {Array.from({ length: 11 }, (_, i) => (
                          <button
                            key={i}
                            onClick={() => updateLog(e.uid, 'painLevel', log.painLevel === i ? null : i)}
                            className="flex-1 h-7 rounded text-xs font-medium transition-all"
                            style={{
                              background: log.painLevel === i
                                ? i <= 3 ? '#22c55e' : i <= 6 ? '#f97316' : '#ef4444'
                                : '#f4f4f5',
                              color: log.painLevel === i ? 'white' : '#71717a',
                            }}
                          >
                            {i}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => toggleDone(e.uid)}
                      className="w-full py-2 rounded-xl text-sm font-semibold transition-colors"
                      style={{
                        background: log.done ? '#f0fdf4' : '#3ECF6A',
                        color: log.done ? '#15803d' : 'white',
                      }}
                    >
                      {log.done ? '✓ Gedaan' : 'Markeer als gedaan'}
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Finish button */}
      {doneCount > 0 && (
        <div className="px-4 pt-6">
          <Button
            onClick={() => setShowComplete(true)}
            className="w-full h-12 text-base font-semibold"
            style={{ background: '#3ECF6A' }}
          >
            {doneCount === exercises.length ? 'Sessie afronden 🎉' : `Doorgaan (${doneCount}/${exercises.length})`}
          </Button>
        </div>
      )}
    </div>
  )
}

function LogInput({
  label, value, min = 0, max = 999, step = 1, onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-xs text-muted-foreground text-center">{label}</p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: '#f4f4f5' }}
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-10 text-center font-semibold text-sm">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: '#f4f4f5' }}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function RatingRow({
  label, value, max, onChange, colors,
}: {
  label: string
  value: number | null
  max: number
  onChange: (v: number | null) => void
  colors: string[]
}) {
  return (
    <div>
      <p className="text-sm font-medium mb-1.5">{label}</p>
      <div className="flex gap-1">
        {Array.from({ length: max + 1 }, (_, i) => {
          const colorIdx = Math.floor((i / max) * (colors.length - 1))
          return (
            <button
              key={i}
              onClick={() => onChange(value === i ? null : i)}
              className="flex-1 h-8 rounded text-xs font-medium transition-all"
              style={{
                background: value === i ? colors[colorIdx] : '#f4f4f5',
                color: value === i ? 'white' : '#71717a',
              }}
            >
              {i}
            </button>
          )
        })}
      </div>
    </div>
  )
}
