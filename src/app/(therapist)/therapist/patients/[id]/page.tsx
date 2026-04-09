'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc/client'
import {
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Activity,
  ClipboardList,
  MessageSquare,
  Plus,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  UserCog,
  Trash2,
  AlertTriangle,
  BarChart2,
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',    bg: '#ccfbf1', text: '#0D6B6E' },
  DRAFT:     { label: 'Concept',   bg: '#fef9c3', text: '#a16207' },
  COMPLETED: { label: 'Afgerond',  bg: '#f1f5f9', text: '#475569' },
  ARCHIVED:  { label: 'Gearchiveerd', bg: '#f1f5f9', text: '#475569' },
}

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  PATIENT:   { label: 'Patiënt',    bg: '#dbeafe', text: '#1e40af' },
  ATHLETE:   { label: 'Atleet',     bg: '#ccfbf1', text: '#0D6B6E' },
  THERAPIST: { label: 'Therapeut',  bg: '#f3e8ff', text: '#7c3aed' },
  ADMIN:     { label: 'Admin',      bg: '#fef9c3', text: '#a16207' },
}

const ROLE_OPTIONS = [
  { value: 'PATIENT', label: 'Patiënt' },
  { value: 'ATHLETE', label: 'Atleet' },
  { value: 'THERAPIST', label: 'Therapeut' },
] as const

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const utils = trpc.useUtils()
  const { data: patient, isLoading } = trpc.patients.get.useQuery({ id })
  const router = useRouter()
  const [showRoleMenu, setShowRoleMenu] = useState(false)
  const [resending, setResending] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const changeRole = trpc.patients.changeRole.useMutation({
    onSuccess: () => {
      utils.patients.get.invalidate({ id })
      setShowRoleMenu(false)
    },
  })

  const resendInvite = trpc.patients.resendInvite.useMutation({
    onSuccess: () => setResending(false),
    onError: () => setResending(false),
  })

  const deletePatient = trpc.patients.delete.useMutation({
    onSuccess: () => {
      router.push('/therapist/patients')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!patient) return notFound()

  const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null

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
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-white shrink-0"
          style={{ background: '#1A3A3A' }}
        >
          {patient.avatarInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{patient.name}</h1>
            {patient.role && ROLE_CONFIG[patient.role] && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: ROLE_CONFIG[patient.role].bg, color: ROLE_CONFIG[patient.role].text }}
              >
                {ROLE_CONFIG[patient.role].label}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{patient.email}</p>
          {status && (
            <span
              className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: status.bg, color: status.text }}
            >
              {status.label}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex gap-2">
            {patient.programId ? (
              <Link href={`/therapist/programs/${patient.programId}/edit`}>
                <Button size="sm" className="gap-1.5" style={{ background: '#4ECDC4' }}>
                  <ClipboardList className="w-3.5 h-3.5" /> Programma
                </Button>
              </Link>
            ) : (
              <Link href={`/therapist/programs/new?patientId=${patient.id}`}>
                <Button size="sm" className="gap-1.5" style={{ background: '#4ECDC4' }}>
                  <Plus className="w-3.5 h-3.5" /> Programma
                </Button>
              </Link>
            )}
            <Link href={`/therapist/patients/${patient.id}/progress`}>
              <Button size="sm" variant="outline" className="gap-1.5">
                <BarChart2 className="w-3.5 h-3.5" /> Progressie
              </Button>
            </Link>
          </div>
          <div className="flex gap-2">
            {/* Role switcher */}
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => setShowRoleMenu(!showRoleMenu)}
              >
                <UserCog className="w-3.5 h-3.5" /> Rol wijzigen
              </Button>
              {showRoleMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
                  {ROLE_OPTIONS.map(opt => {
                    const isCurrent = patient.role === opt.value
                    return (
                      <button
                        key={opt.value}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 transition-colors flex items-center justify-between"
                        onClick={() => {
                          if (!isCurrent) changeRole.mutate({ id: patient.id, role: opt.value })
                        }}
                        disabled={changeRole.isPending || isCurrent}
                      >
                        <span style={isCurrent ? { fontWeight: 600, color: '#4ECDC4' } : {}}>{opt.label}</span>
                        {isCurrent && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#4ECDC4' }} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Resend invite */}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => {
                setResending(true)
                resendInvite.mutate({ id: patient.id })
              }}
              disabled={resending || resendInvite.isPending}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              {resendInvite.isSuccess ? 'Verstuurd!' : 'Opnieuw uitnodigen'}
            </Button>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Contact</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="truncate">{patient.email}</span>
              </div>
              {patient.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{patient.phone}</span>
                </div>
              )}
              {patient.dateOfBirth && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{new Date(patient.dateOfBirth).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Lid sinds</h3>
            <div className="text-sm">
              <p className="font-medium">
                {new Date(patient.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            {patient.notes && (
              <>
                <h3 className="text-xs text-muted-foreground uppercase tracking-wide font-semibold pt-2">Notities</h3>
                <p className="text-sm text-muted-foreground">{patient.notes}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete patient */}
      <Card style={{ borderRadius: '12px', borderColor: '#fecaca' }}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-red-600">Patiënt verwijderen</p>
              <p className="text-xs text-muted-foreground mt-0.5">Dit verwijdert de patiënt en alle bijbehorende programma&apos;s permanent.</p>
            </div>
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Verwijderen
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuleren
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs h-7 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => deletePatient.mutate({ id: patient.id })}
                  disabled={deletePatient.isPending}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {deletePatient.isPending ? 'Verwijderen...' : 'Bevestigen'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Programs */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Programma&apos;s</h3>
        {patient.programs.length > 0 ? (
          patient.programs.map(prog => {
            const progStatus = STATUS_CONFIG[prog.status]
            return (
              <Card key={prog.id} style={{ borderRadius: '12px' }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{prog.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {prog.weeks} weken · {prog.daysPerWeek} dagen/week
                      </p>
                      {prog.startDate && (
                        <p className="text-xs text-muted-foreground">
                          Start: {new Date(prog.startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {progStatus && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: progStatus.bg, color: progStatus.text }}
                        >
                          {progStatus.label}
                        </span>
                      )}
                      <Link href={`/therapist/programs/${prog.id}/edit`}>
                        <Button variant="outline" size="sm" className="text-xs h-7">
                          Bewerken
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <Card style={{ borderRadius: '12px' }}>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <ClipboardList className="w-8 h-8 text-zinc-300" />
              <p className="text-sm text-muted-foreground">Geen programma toegewezen</p>
              <Link href={`/therapist/programs/new?patientId=${patient.id}`}>
                <Button
                  size="sm"
                  className="gap-1.5"
                  style={{ background: '#4ECDC4' }}
                >
                  <Plus className="w-4 h-4" /> Programma toewijzen
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
