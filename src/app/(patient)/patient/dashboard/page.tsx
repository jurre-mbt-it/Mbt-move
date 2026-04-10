'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ConsentPopup } from '@/components/research/ConsentPopup'
import { DpaPopup } from '@/components/dpa/DpaPopup'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { trpc } from '@/lib/trpc/client'
import { RecoveryPanel } from '@/components/recovery/RecoveryPanel'
import { WorkloadPanel } from '@/components/workload/WorkloadPanel'
import { Play, CheckCircle2, Flame, TrendingUp, Calendar, ChevronRight, AlertCircle } from 'lucide-react'
import { DAY_LABELS } from '@/lib/program-constants'

const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

export default function PatientDashboard() {
  const { data: sessionData } = trpc.patient.getTodayExercises.useQuery()
  const { data: activeProgram } = trpc.patient.getActiveProgram.useQuery()
  const { data: sessionHistory } = trpc.patient.getSessionHistory.useQuery({ limit: 20 })
  const { data: rawWorkloadSessions } = trpc.patient.getWorkloadSessions.useQuery()
  const { data: rawRecoverySessions } = trpc.patient.getRecoverySessions.useQuery()

  // Convert serialized dates back to Date objects for the panel components
  const workloadSessions = rawWorkloadSessions?.map(s => ({ ...s, date: new Date(s.date) })) ?? []
  const recoverySessions = rawRecoverySessions?.map(s => ({ ...s, completedAt: new Date(s.completedAt) })) ?? []

  const todayExercises = sessionData?.exercises ?? []
  const program = sessionData?.program ?? null
  const lastSession = sessionHistory?.[0] ?? null
  const streak = 5 // TODO: compute from history
  const completedToday = sessionHistory?.some(s =>
    new Date(s.completedAt).toDateString() === new Date().toDateString()
  ) ?? false

  const currentWeek = program?.currentWeek ?? 1
  const weekCompleted = sessionHistory?.filter(s => {
    const d = new Date(s.completedAt)
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
    weekStart.setHours(0, 0, 0, 0)
    return d >= weekStart
  }).length ?? 0
  const weekTotal = activeProgram?.daysPerWeek ?? 0
  const weekProgress = weekTotal > 0 ? Math.min((weekCompleted / weekTotal) * 100, 100) : 0

  const today = new Date().getDay() // 0=Sun, 1=Mon, …
  const todayDayNum = today === 0 ? 7 : today // convert to Mon=1…Sun=7

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'

  const firstName = 'Hey' // user name shown from auth context — kept simple for now

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <DpaPopup />
      <ConsentPopup />
      {/* Header */}
      <div className="px-4 pt-12 pb-8" style={{ background: '#1A3A3A' }}>
        <p className="text-zinc-400 text-sm">{greeting}</p>
        <h1 className="text-white text-2xl font-bold mt-0.5">{firstName} 👋</h1>
        {program && <p className="text-zinc-400 text-xs mt-1">Programma: {program.name}</p>}
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<Flame className="w-4 h-4" style={{ color: '#f97316' }} />} value={streak} label="Streak" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" style={{ color: '#4ECDC4' }} />} value={sessionHistory?.length ?? 0} label="Sessies" />
          <StatCard icon={<TrendingUp className="w-4 h-4" style={{ color: '#6366f1' }} />} value={`${Math.round(weekProgress)}%`} label="Deze week" />
        </div>

        {/* Today's session */}
        <Card style={{ borderRadius: '14px', overflow: 'hidden' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#4ECDC4' }}>
            <div>
              <p className="text-white text-xs font-medium opacity-80">Vandaag · {DAY_NAMES[todayDayNum - 1]}</p>
              <p className="text-white font-bold text-base">
                {completedToday ? 'Klaar voor vandaag! 🎉' : `${todayExercises.length} oefeningen`}
              </p>
            </div>
            {!completedToday && (
              <Link href="/patient/session">
                <Button size="sm" className="bg-white gap-1.5 font-semibold text-xs" style={{ color: '#0D6B6E' }}>
                  <Play className="w-3 h-3 fill-current" /> Start
                </Button>
              </Link>
            )}
          </div>
          <CardContent className="px-4 py-3 space-y-2.5">
            {completedToday ? (
              <div className="py-2 text-center space-y-1">
                <p className="text-sm font-semibold">Lekker bezig!</p>
                <p className="text-xs text-muted-foreground">Alle trainingen voor vandaag zijn afgerond</p>
              </div>
            ) : todayExercises.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">Geen oefeningen voor vandaag</p>
            ) : (
              <>
                {todayExercises.slice(0, 3).map(e => (
                  <div key={e.uid} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm" style={{ background: '#f4f4f5' }}>
                      💪
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.sets} × {e.reps} {e.repUnit}</p>
                    </div>
                  </div>
                ))}
                {todayExercises.length > 3 && (
                  <p className="text-xs text-muted-foreground pt-0.5">+{todayExercises.length - 3} meer</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Week overview */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">Week {currentWeek} voortgang</p>
              <span className="text-xs text-muted-foreground">{weekCompleted}/{weekTotal} sessies</span>
            </div>
            <Progress value={weekProgress} className="h-1.5 mb-4" />
            <div className="flex gap-1.5 justify-between">
              {DAY_LABELS.map((label, i) => {
                const dayNum = i + 1
                const isToday = dayNum === todayDayNum
                const isDone = dayNum < todayDayNum && sessionHistory?.some(s => {
                  const d = new Date(s.completedAt)
                  return d.getDay() === (dayNum === 7 ? 0 : dayNum)
                })
                return (
                  <div key={label} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className="w-full aspect-square rounded-full flex items-center justify-center text-xs font-medium max-w-[36px]"
                      style={
                        isDone ? { background: '#4ECDC4', color: 'white' }
                          : isToday ? { background: '#1A3A3A', color: 'white' }
                            : { background: '#f4f4f5', color: '#d4d4d8' }
                      }
                    >
                      {isDone ? '✓' : label.slice(0, 2)}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recovery / supercompensation model */}
        <RecoveryPanel sessions={recoverySessions ?? []} />

        {/* ACWR workload monitoring */}
        <WorkloadPanel sessions={workloadSessions ?? []} />

        {/* Pain report quick link */}
        <Link href="/patient/pain">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fee2e2' }}>
              <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#991b1b' }}>Pijn rapporteren</p>
              <p className="text-xs" style={{ color: '#dc2626' }}>Meld klachten aan je therapeut</p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#fca5a5' }} />
          </div>
        </Link>

        {/* Last session recap */}
        {lastSession && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm">Laatste sessie</p>
                <Link href="/patient/history" className="text-xs flex items-center gap-0.5" style={{ color: '#4ECDC4' }}>
                  Alles <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#f0fdfa' }}>
                  <Calendar className="w-5 h-5" style={{ color: '#4ECDC4' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {new Date(lastSession.completedAt).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })}
                    {lastSession.programName ? ` · ${lastSession.programName}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lastSession.exerciseCount} oefeningen · {lastSession.durationMinutes} min
                  </p>
                </div>
                {lastSession.painLevel !== null && (
                  <Badge variant="outline" className="text-xs shrink-0">Pijn {lastSession.painLevel}/10</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <Card style={{ borderRadius: '14px' }}>
      <CardContent className="px-3 py-3">
        <div className="mb-1">{icon}</div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
