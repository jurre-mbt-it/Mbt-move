'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { trpc } from '@/lib/trpc/client'
import { CheckCircle2, Clock, Flame, ChevronDown, ChevronUp } from 'lucide-react'

export default function AthleteHistoryPage() {
  const { data: sessions, isLoading } = trpc.patient.getSessionHistory.useQuery({ limit: 50 })
  const [expanded, setExpanded] = useState<string | null>(null)

  const history = sessions ?? []
  const totalMinutes = history.reduce((s, h) => s + h.durationMinutes, 0)

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Voortgang</h1>
        <p className="text-zinc-400 text-sm mt-1">{history.length} sessies afgerond</p>
      </div>

      <div className="px-4 -mt-3 space-y-3 pb-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <Flame className="w-5 h-5 mx-auto mb-1" style={{ color: '#f97316' }} />
              <p className="text-lg font-bold">5</p>
              <p className="text-[10px] text-muted-foreground">Streak</p>
            </CardContent>
          </Card>
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <CheckCircle2 className="w-5 h-5 mx-auto mb-1" style={{ color: '#4ECDC4' }} />
              <p className="text-lg font-bold">{history.length}</p>
              <p className="text-[10px] text-muted-foreground">Totaal</p>
            </CardContent>
          </Card>
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1" style={{ color: '#6366f1' }} />
              <p className="text-lg font-bold">{Math.round(totalMinutes / 60)}u</p>
              <p className="text-[10px] text-muted-foreground">Totale tijd</p>
            </CardContent>
          </Card>
        </div>

        {/* Session list */}
        <h2 className="text-sm font-semibold mt-2">Sessiegeschiedenis</h2>
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Laden…</p>
        )}
        {!isLoading && history.length === 0 && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Nog geen sessies voltooid</p>
            </CardContent>
          </Card>
        )}
        {history.map(session => {
          const isOpen = expanded === session.id
          return (
            <Card key={session.id} style={{ borderRadius: '14px', overflow: 'hidden' }}>
              <button
                className="w-full text-left"
                onClick={() => setExpanded(isOpen ? null : session.id)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{ background: '#f0fdfa', color: '#4ECDC4' }}
                  >
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">
                      {new Date(session.completedAt).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.exerciseCount} oefeningen · {session.durationMinutes} min
                      {session.programName ? ` · ${session.programName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {session.painLevel !== null && (
                      <p className="text-xs text-muted-foreground">Pijn {session.painLevel}/10</p>
                    )}
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-zinc-400" />
                      : <ChevronDown className="w-4 h-4 text-zinc-400" />
                    }
                  </div>
                </CardContent>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-0 border-t border-zinc-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <div className="rounded-xl p-3 text-center" style={{ background: '#f4f4f5' }}>
                      <p className="text-sm font-bold">{session.durationMinutes} min</p>
                      <p className="text-[10px] text-muted-foreground">Duur</p>
                    </div>
                    <div className="rounded-xl p-3 text-center" style={{ background: '#f4f4f5' }}>
                      <p className="text-sm font-bold">{session.exerciseCount}</p>
                      <p className="text-[10px] text-muted-foreground">Oefeningen</p>
                    </div>
                    {session.painLevel !== null && (
                      <div className="rounded-xl p-3 text-center" style={{ background: '#f4f4f5' }}>
                        <p className="text-sm font-bold">{session.painLevel}/10</p>
                        <p className="text-[10px] text-muted-foreground">Pijn</p>
                      </div>
                    )}
                    {session.exertionLevel !== null && (
                      <div className="rounded-xl p-3 text-center" style={{ background: '#f4f4f5' }}>
                        <p className="text-sm font-bold">{session.exertionLevel}/10</p>
                        <p className="text-[10px] text-muted-foreground">Inspanning</p>
                      </div>
                    )}
                  </div>
                  {session.notes && (
                    <p className="text-xs text-muted-foreground italic pt-1">&ldquo;{session.notes}&rdquo;</p>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
