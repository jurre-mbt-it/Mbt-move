'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getTodayExercises, DAY_NAMES, TODAY_DAY } from '@/lib/patient-constants'
import { Play, CheckCircle2, ArrowLeft, ChevronRight, Timer } from 'lucide-react'

type SessionState = 'ready' | 'active' | 'done'

export default function AthleteSessionPage() {
  const exercises = getTodayExercises()
  const [state, setState] = useState<SessionState>('ready')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completed, setCompleted] = useState<Set<number>>(new Set())

  const current = exercises[currentIndex]

  function markDone() {
    setCompleted(prev => new Set(prev).add(currentIndex))
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setState('done')
    }
  }

  if (exercises.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAFA' }}>
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Geen oefeningen voor vandaag</p>
          <Link href="/athlete/dashboard">
            <Button variant="outline">Terug naar dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'ready') {
    return (
      <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
        <div className="px-4 pt-12 pb-8" style={{ background: '#1A3A3A' }}>
          <Link href="/athlete/dashboard" className="text-zinc-400 flex items-center gap-1 text-sm mb-4">
            <ArrowLeft className="w-4 h-4" /> Terug
          </Link>
          <h1 className="text-white text-xl font-bold">{DAY_NAMES[TODAY_DAY - 1]}</h1>
          <p className="text-zinc-400 text-sm mt-1">{exercises.length} oefeningen</p>
        </div>
        <div className="px-4 -mt-3 space-y-3 pb-6">
          {exercises.map((e, i) => (
            <Card key={e.uid} style={{ borderRadius: '14px' }}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ background: '#f0fdfa', color: '#4ECDC4' }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.sets} × {e.reps} {e.repUnit}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button className="w-full gap-2 text-white" style={{ background: '#4ECDC4' }} onClick={() => setState('active')}>
            <Play className="w-4 h-4 fill-current" /> Start sessie
          </Button>
        </div>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAFA' }}>
        <div className="text-center space-y-4 px-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: '#f0fdfa' }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: '#4ECDC4' }} />
          </div>
          <h2 className="text-xl font-bold">Sessie voltooid!</h2>
          <p className="text-muted-foreground text-sm">{completed.size}/{exercises.length} oefeningen afgerond</p>
          <Link href="/athlete/dashboard">
            <Button style={{ background: '#4ECDC4' }} className="text-white">Terug naar dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1A3A3A' }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setState('ready')} className="text-zinc-400 flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Overzicht
          </button>
          <span className="text-zinc-400 text-sm">{currentIndex + 1}/{exercises.length}</span>
        </div>
        <h1 className="text-white text-lg font-bold">{current.name}</h1>
        <p className="text-zinc-400 text-sm mt-1">{current.sets} × {current.reps} {current.repUnit}</p>
      </div>

      <div className="px-4 pt-4 space-y-4 pb-6">
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Timer className="w-4 h-4" />
              <span className="text-sm">Rust: {current.restTime}s tussen sets</span>
            </div>
            {current.notes && (
              <p className="text-xs text-muted-foreground italic">{current.notes}</p>
            )}
          </CardContent>
        </Card>

        <Button className="w-full gap-2 text-white" style={{ background: '#4ECDC4' }} onClick={markDone}>
          <CheckCircle2 className="w-4 h-4" />
          {currentIndex < exercises.length - 1 ? 'Volgende oefening' : 'Sessie afronden'}
        </Button>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {exercises.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: completed.has(i) ? '#4ECDC4' : i === currentIndex ? '#1A3A3A' : '#d4d4d8'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
