'use client'

import { use } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { MOCK_PATIENTS } from '@/lib/therapist-constants'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  TrendingUp,
  Calendar,
  Activity,
  ClipboardList,
  MessageSquare,
  AlertCircle,
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',   bg: '#dcfce7', text: '#15803d' },
  DRAFT:     { label: 'Concept',  bg: '#fef9c3', text: '#a16207' },
  COMPLETED: { label: 'Afgerond', bg: '#f1f5f9', text: '#475569' },
}

// Mock session history per patient
const MOCK_SESSION_LOGS: Record<string, { date: string; rpe: number; pain: number; done: number; total: number }[]> = {
  pat1: [
    { date: '2025-03-28', rpe: 6, pain: 3, done: 4, total: 4 },
    { date: '2025-03-26', rpe: 7, pain: 4, done: 4, total: 4 },
    { date: '2025-03-24', rpe: 5, pain: 3, done: 3, total: 4 },
    { date: '2025-03-21', rpe: 6, pain: 5, done: 4, total: 4 },
    { date: '2025-03-19', rpe: 7, pain: 4, done: 4, total: 4 },
    { date: '2025-03-17', rpe: 8, pain: 6, done: 4, total: 4 },
    { date: '2025-03-14', rpe: 6, pain: 5, done: 3, total: 4 },
  ],
  pat4: [
    { date: '2025-03-20', rpe: 5, pain: 2, done: 4, total: 4 },
    { date: '2025-03-18', rpe: 6, pain: 2, done: 4, total: 4 },
    { date: '2025-03-15', rpe: 6, pain: 3, done: 4, total: 4 },
  ],
}

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const patient = MOCK_PATIENTS.find(p => p.id === id)

  if (!patient) notFound()

  const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null
  const sessions = MOCK_SESSION_LOGS[id] ?? []
  const avgPain = sessions.length
    ? Math.round(sessions.reduce((s, l) => s + l.pain, 0) / sessions.length * 10) / 10
    : null
  const avgRpe = sessions.length
    ? Math.round(sessions.reduce((s, l) => s + l.rpe, 0) / sessions.length * 10) / 10
    : null
  const daysSince = patient.lastSessionDate
    ? Math.floor((Date.now() - new Date(patient.lastSessionDate).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Back */}
      <Link
        href="/therapist/patients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Terug naar patiënten
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-white shrink-0"
            style={{ background: '#1A1A1A' }}
          >
            {patient.avatarInitials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{patient.name}</h1>
            <p className="text-sm text-muted-foreground truncate">{patient.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {status && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: status.bg, color: status.text }}
                >
                  {status.label}
                </span>
              )}
              {patient.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none">
            <MessageSquare className="w-4 h-4" /> Bericht
          </Button>
          {patient.programId ? (
            <Link href={`/therapist/programs/${patient.programId}/edit`} className="flex-1 sm:flex-none">
              <Button size="sm" className="gap-1.5 w-full" style={{ background: '#3ECF6A' }}>
                <ClipboardList className="w-4 h-4" /> Programma
              </Button>
            </Link>
          ) : (
            <Link href="/therapist/programs/new" className="flex-1 sm:flex-none">
              <Button size="sm" className="gap-1.5 w-full" style={{ background: '#3ECF6A' }}>
                <ClipboardList className="w-4 h-4" /> + Programma
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity className="w-4 h-4" style={{ color: '#3ECF6A' }} />}
          value={`${patient.compliance}%`}
          label="Compliance"
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" style={{ color: '#60a5fa' }} />}
          value={`${patient.sessionsCompleted}/${patient.sessionsTotal}`}
          label="Sessies"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" style={{ color: '#a78bfa' }} />}
          value={avgPain !== null ? `${avgPain}/10` : '—'}
          label="Gem. pijn"
        />
        <StatCard
          icon={<Calendar className="w-4 h-4" style={{ color: '#f97316' }} />}
          value={daysSince !== null ? `${daysSince}d` : '—'}
          label="Laatste sessie"
        />
      </div>

      {/* Inactive warning */}
      {daysSince !== null && daysSince > 7 && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: '#fff7ed', color: '#c2410c' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Geen sessie in <strong>{daysSince} dagen</strong>. Overweeg contact op te nemen.</p>
        </div>
      )}

      {/* Program progress */}
      {patient.programStatus === 'ACTIVE' && patient.programName && (
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Huidig programma</h2>
              {patient.programId && (
                <Link
                  href={`/therapist/programs/${patient.programId}/edit`}
                  className="text-xs"
                  style={{ color: '#3ECF6A' }}
                >
                  Bewerken
                </Link>
              )}
            </div>
            <p className="font-medium">{patient.programName}</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Week {patient.weeksCurrent} van {patient.weeksTotal}</span>
                <span>{Math.round((patient.weeksCurrent / patient.weeksTotal) * 100)}%</span>
              </div>
              <Progress value={(patient.weeksCurrent / patient.weeksTotal) * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session history */}
      {sessions.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm mb-3">Sessiegeschiedenis</h2>
          <div className="space-y-2">
            {sessions.map((log, i) => (
              <Card key={i} style={{ borderRadius: '12px' }}>
                <CardContent className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: log.done === log.total ? '#dcfce7' : '#fef9c3' }}
                      >
                        {log.done === log.total
                          ? <CheckCircle2 className="w-4 h-4" style={{ color: '#15803d' }} />
                          : <Clock className="w-4 h-4" style={{ color: '#a16207' }} />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(log.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.done}/{log.total} oefeningen
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground text-right">
                      <div>
                        <p className="font-medium text-foreground">{log.pain}/10</p>
                        <p>pijn</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{log.rpe}/10</p>
                        <p>RPE</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-xl text-center">
          <Clock className="w-8 h-8 text-zinc-300 mb-2" />
          <p className="text-sm text-muted-foreground">Nog geen sessies gelogd</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <Card style={{ borderRadius: '12px' }}>
      <CardContent className="px-3 py-3">
        <div className="mb-1">{icon}</div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
