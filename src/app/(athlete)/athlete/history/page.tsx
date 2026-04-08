'use client'

import { Card, CardContent } from '@/components/ui/card'
import { MOCK_SESSION_HISTORY } from '@/lib/patient-constants'
import { CheckCircle2, Clock, Flame } from 'lucide-react'

export default function AthleteHistoryPage() {
  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Voortgang</h1>
        <p className="text-zinc-400 text-sm mt-1">{MOCK_SESSION_HISTORY.length} sessies afgerond</p>
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
              <p className="text-lg font-bold">{MOCK_SESSION_HISTORY.length}</p>
              <p className="text-[10px] text-muted-foreground">Totaal</p>
            </CardContent>
          </Card>
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1" style={{ color: '#6366f1' }} />
              <p className="text-lg font-bold">
                {Math.round(MOCK_SESSION_HISTORY.reduce((s, h) => s + h.duration, 0) / 60)}u
              </p>
              <p className="text-[10px] text-muted-foreground">Totale tijd</p>
            </CardContent>
          </Card>
        </div>

        {/* Session list */}
        <h2 className="text-sm font-semibold mt-2">Sessiegeschiedenis</h2>
        {MOCK_SESSION_HISTORY.map((session, i) => (
          <Card key={i} style={{ borderRadius: '14px' }}>
            <CardContent className="p-4 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ background: '#f0fdfa', color: '#4ECDC4' }}
              >
                W{session.week + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{session.dayLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {session.exercisesCompleted}/{session.exercisesTotal} oefeningen · {session.duration} min
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">
                  {new Date(session.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
