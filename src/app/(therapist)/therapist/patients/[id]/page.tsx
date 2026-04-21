'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { trpc } from '@/lib/trpc/client'
import {
  ArrowLeft, CheckCircle2, Clock, TrendingUp, Calendar,
  Activity, ClipboardList, Plus, Edit3, Phone, Mail, User,
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',    bg: 'rgba(190,242,100,0.12)', text: '#15803d' },
  DRAFT:     { label: 'Concept',   bg: 'rgba(244,194,97,0.14)', text: '#F4C261' },
  COMPLETED: { label: 'Afgerond', bg: 'rgba(255,255,255,0.06)', text: '#7B8889' },
}

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: patient, isLoading } = trpc.patients.get.useQuery({ id })
  const { data: programsRaw = [] } = trpc.programs.list.useQuery({ patientId: id })
  const programs = programsRaw as Array<{
    id: string; name: string; status: string; weeks: number;
    daysPerWeek: number; startDate: Date | null; endDate: Date | null; isTemplate: boolean
  }>


  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl animate-pulse">
        <div className="h-5 w-32 bg-[#1C2425] rounded" />
        <div className="h-20 bg-[#1C2425] rounded-xl" />
        <div className="h-24 bg-[#1C2425] rounded-xl" />
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Patiënt niet gevonden of geen toegang.</p>
        <Link href="/therapist/patients">
          <Button variant="outline" className="mt-4">Terug naar patiënten</Button>
        </Link>
      </div>
    )
  }

  const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null
  const activePrograms = programs.filter(p => p.status === 'ACTIVE' && !p.isTemplate)

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Back */}
      <Link
        href="/therapist/patients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Terug naar patiënten
      </Link>

      {/* Patient header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-white shrink-0"
          style={{ background: '#1C2425' }}
        >
          {patient.avatarInitials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{patient.name}</h1>
          <p className="text-sm text-muted-foreground">{patient.email}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {status && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: status.bg, color: status.text }}>
                {status.label}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-1.5 ml-auto">
          <Link href={`/therapist/treatment/${patient.id}`}>
            <Button size="sm" className="gap-1.5" style={{ background: '#BEF264', color: '#0A0E0F' }}>
              ▶ Start behandeling
            </Button>
          </Link>
          {patient.programId ? (
            <Link href={`/therapist/programs/${patient.programId}/edit`}>
              <Button size="sm" variant="outline" className="gap-1.5 w-full">
                <ClipboardList className="w-3.5 h-3.5" /> Programma
              </Button>
            </Link>
          ) : (
            <Link href={`/therapist/programs/new?patientId=${patient.id}`}>
              <Button size="sm" variant="outline" className="gap-1.5 w-full">
                <Plus className="w-3.5 h-3.5" /> Programma
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard icon={<Activity className="w-4 h-4" style={{ color: '#BEF264' }} />}
          value={activePrograms.length} label="Actieve prog." />
        <StatCard icon={<ClipboardList className="w-4 h-4" style={{ color: '#60a5fa' }} />}
          value={programs.length} label="Totaal prog." />
        <StatCard icon={<TrendingUp className="w-4 h-4" style={{ color: '#a78bfa' }} />}
          value={patient.weeksTotal ? `${patient.weeksTotal}w` : '—'} label="Programma duur" />
        <StatCard icon={<Calendar className="w-4 h-4" style={{ color: '#f97316' }} />}
          value={patient.startDate ? new Date(patient.startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—'}
          label="Startdatum" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profiel" className="space-y-4">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="profiel" className="text-xs px-1">Profiel</TabsTrigger>
          <TabsTrigger value="programmas" className="text-xs px-1">Programma's</TabsTrigger>
          <TabsTrigger value="voortgang" className="text-xs px-1">Voortgang</TabsTrigger>
        </TabsList>

        {/* ── TAB: Profiel ─────────────────────────────────────── */}
        <TabsContent value="profiel" className="space-y-4">
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm">Contactgegevens</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>{patient.email}</span>
                </div>
                {patient.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>{patient.phone}</span>
                  </div>
                )}
                {patient.dateOfBirth && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="w-4 h-4 shrink-0" />
                    <span>Geboortedatum: {new Date(patient.dateOfBirth).toLocaleDateString('nl-NL')}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>Aangemaakt: {new Date(patient.createdAt).toLocaleDateString('nl-NL')}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          {patient.notes && (
            <Card style={{ borderRadius: '14px' }}>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-2">Notities</h3>
                <p className="text-sm text-muted-foreground">{patient.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB: Programma's ──────────────────────────────────── */}
        <TabsContent value="programmas" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{programs.length} programma{programs.length !== 1 ? "'s" : ""}</p>
            <Link href={`/therapist/programs/new?patientId=${patient.id}`}>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" /> Nieuw
              </Button>
            </Link>
          </div>
          {programs.length === 0 && (
            <Card style={{ borderRadius: '14px' }}>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">Geen programma's gevonden</p>
                <Button size="sm" className="mt-3 gap-1.5" style={{ background: '#BEF264' }}
                  onClick={() => router.push(`/therapist/programs/new?patientId=${patient.id}`)}>
                  <Plus className="w-3.5 h-3.5" /> Programma aanmaken
                </Button>
              </CardContent>
            </Card>
          )}
          {programs.map(prog => {
            const progStatus = STATUS_CONFIG[prog.status] ?? STATUS_CONFIG.DRAFT
            return (
              <Card key={prog.id} style={{ borderRadius: '14px' }}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Link href={`/therapist/programs/${prog.id}/edit`} className="flex-1 min-w-0 cursor-pointer">
                    <p className="font-semibold text-sm truncate">{prog.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {prog.weeks} weken · {prog.daysPerWeek}×/week
                      {prog.startDate && ` · Start ${new Date(prog.startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </Link>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{ background: progStatus.bg, color: progStatus.text }}>
                    {progStatus.label}
                  </span>
                  <ProgramActions programId={prog.id} status={prog.status} patientId={patient.id} />
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        {/* ── TAB: Voortgang ───────────────────────────────────── */}
        <TabsContent value="voortgang">
          <Link href={`/therapist/patients/${patient.id}/progress`}>
            <Card style={{ borderRadius: '14px' }} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#BEF264' }} />
                <div>
                  <p className="font-semibold text-sm">Voortgangsrapport bekijken</p>
                  <p className="text-xs text-muted-foreground">Sessies, pijn, workload en 1RM trends</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </TabsContent>
      </Tabs>

    </div>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <Card style={{ borderRadius: '12px' }}>
      <CardContent className="px-3 py-3">
        <div className="mb-1">{icon}</div>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}

function ProgramActions({
  programId,
  status,
  patientId,
}: {
  programId: string
  status: string
  patientId: string
}) {
  const utils = trpc.useUtils()
  const save = trpc.programs.save.useMutation({
    onSuccess: () => {
      utils.programs.list.invalidate()
      utils.patients.get.invalidate({ id: patientId })
    },
  })

  const isActive = status === 'ACTIVE'

  return (
    <div className="flex items-center gap-2 shrink-0">
      {!isActive && (
        <Button
          size="sm"
          className="text-xs gap-1"
          style={{ background: '#BEF264', color: '#0A0E0F' }}
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              id: programId,
              status: 'ACTIVE',
              patientId,
              startDate: new Date().toISOString(),
            })
          }
        >
          ▶ Start
        </Button>
      )}
      <Link href={`/therapist/programs/${programId}/edit`}>
        <Button variant="outline" size="sm" className="text-xs">
          Wijzig
        </Button>
      </Link>
    </div>
  )
}
