'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  PATIENTS,
  getSessionsByPatient,
  getMessagesByPatient,
} from '@/lib/mock-data'
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
  Copy,
  Plus,
  Send,
  Edit3,
  Save,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { AssignProgramDialog } from '@/components/patients/AssignProgramDialog'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',    bg: '#dcfce7', text: '#15803d' },
  DRAFT:     { label: 'Concept',   bg: '#fef9c3', text: '#a16207' },
  COMPLETED: { label: 'Afgerond', bg: '#f1f5f9', text: '#475569' },
}

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const patient = PATIENTS.find(p => p.id === id)
  if (!patient) notFound()

  const sessions = getSessionsByPatient(id)
  const messages = getMessagesByPatient(id)
  const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null

  const avgPain = sessions.length
    ? Math.round(sessions.reduce((s, l) => s + l.pain, 0) / sessions.length * 10) / 10
    : null
  const avgRpe = sessions.length
    ? Math.round(sessions.reduce((s, l) => s + l.rpe, 0) / sessions.length * 10) / 10
    : null
  const daysSince = patient.lastSessionDate
    ? Math.floor((new Date('2026-04-08').getTime() - new Date(patient.lastSessionDate).getTime()) / (1000 * 60 * 60 * 24))
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

      {/* Patient header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-white shrink-0"
          style={{ background: '#1A1A1A' }}
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
            {patient.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>

        {/* Access code + actions */}
        <div className="flex flex-col items-end gap-2 ml-auto">
          <button
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-mono font-medium border"
            style={{ background: '#f4f4f5', borderColor: '#e4e4e7' }}
            onClick={() => {
              navigator.clipboard.writeText(patient.accessCode)
              toast.success('Toegangscode gekopieerd')
            }}
          >
            {patient.accessCode}
            <Copy className="w-3 h-3 text-zinc-400" />
          </button>
          <div className="flex flex-col gap-1.5">
            <Link href="/therapist/messages">
              <Button variant="outline" size="sm" className="gap-1.5 w-full">
                <MessageSquare className="w-3.5 h-3.5" /> Bericht
              </Button>
            </Link>
            {patient.programId ? (
              <Link href={`/therapist/programs/${patient.programId}/edit`}>
                <Button size="sm" className="gap-1.5 w-full" style={{ background: '#3ECF6A' }}>
                  <ClipboardList className="w-3.5 h-3.5" /> Programma
                </Button>
              </Link>
            ) : (
              <Link href="/therapist/programs/new">
                <Button size="sm" className="gap-1.5 w-full" style={{ background: '#3ECF6A' }}>
                  <Plus className="w-3.5 h-3.5" /> Programma
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

      {/* Alert: inactief */}
      {daysSince !== null && daysSince > 7 && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: '#fff7ed', color: '#c2410c' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Geen sessie in <strong>{daysSince} dagen</strong>. Overweeg contact op te nemen.</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="profiel" className="space-y-4">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="profiel" className="text-xs px-1">Profiel</TabsTrigger>
          <TabsTrigger value="programmas" className="text-xs px-1">Programma's</TabsTrigger>
          <TabsTrigger value="voortgang" className="text-xs px-1">Voortgang</TabsTrigger>
          <TabsTrigger value="berichten" className="text-xs px-1">Berichten</TabsTrigger>
        </TabsList>

        {/* ── TAB: Profiel ─────────────────────────────────────── */}
        <TabsContent value="profiel" className="space-y-4">
          <ProfielTab patient={patient} />
        </TabsContent>

        {/* ── TAB: Programma's ──────────────────────────────────── */}
        <TabsContent value="programmas" className="space-y-4">
          <ProgrammasTab patient={patient} />
        </TabsContent>

        {/* ── TAB: Voortgang ───────────────────────────────────── */}
        <TabsContent value="voortgang" className="space-y-4">
          <VoortgangTab sessions={sessions} avgPain={avgPain} avgRpe={avgRpe} compliance={patient.compliance} />
        </TabsContent>

        {/* ── TAB: Berichten ───────────────────────────────────── */}
        <TabsContent value="berichten" className="space-y-4">
          <BerichtenTab messages={messages} patientName={patient.name} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Profiel Tab ─────────────────────────────────────────────────────────────

function ProfielTab({ patient }: { patient: ReturnType<typeof PATIENTS[0]['id'] extends string ? typeof PATIENTS[number] : never> & object }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    diagnosis: patient.diagnosis,
    goals: patient.goals.join('\n'),
    limitations: patient.limitations.join('\n'),
    sport: patient.sport ?? '',
    notes: patient.notes ?? '',
  })

  function handleSave() {
    toast.success('Profiel opgeslagen (mock)')
    setEditing(false)
  }

  return (
    <div className="space-y-4">
      {/* Persoonsgegevens */}
      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Persoonsgegevens</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {patient.dateOfBirth && (
              <InfoRow label="Geboortedatum" value={new Date(patient.dateOfBirth).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })} />
            )}
            {patient.gender && (
              <InfoRow label="Geslacht" value={patient.gender === 'M' ? 'Man' : patient.gender === 'V' ? 'Vrouw' : 'Anders'} />
            )}
            {patient.height && (
              <InfoRow label="Lengte" value={`${patient.height} cm`} />
            )}
            {patient.weight && (
              <InfoRow label="Gewicht" value={`${patient.weight} kg`} />
            )}
            {patient.phone && (
              <InfoRow label="Telefoon" value={patient.phone} />
            )}
            {patient.sport && (
              <InfoRow label="Sport / activiteit" value={patient.sport} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Klinisch profiel */}
      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Klinisch profiel</h3>
            {editing ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5" /> Annuleren
                </Button>
                <Button size="sm" className="h-7 px-2 gap-1" style={{ background: '#3ECF6A' }} onClick={handleSave}>
                  <Save className="w-3.5 h-3.5" /> Opslaan
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setEditing(true)}>
                <Edit3 className="w-3.5 h-3.5" /> Bewerken
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Diagnose</Label>
                <Textarea
                  value={form.diagnosis}
                  onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sport / activiteit</Label>
                <Input
                  value={form.sport}
                  onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Doelstellingen (één per regel)</Label>
                <Textarea
                  value={form.goals}
                  onChange={e => setForm(f => ({ ...f, goals: e.target.value }))}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Beperkingen (één per regel)</Label>
                <Textarea
                  value={form.limitations}
                  onChange={e => setForm(f => ({ ...f, limitations: e.target.value }))}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vrije notities</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Diagnose</p>
                <p>{patient.diagnosis}</p>
              </div>
              {patient.goals.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Doelstellingen</p>
                  <ul className="space-y-1">
                    {patient.goals.map((g, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#3ECF6A' }} />
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {patient.limitations.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Beperkingen</p>
                  <ul className="space-y-1">
                    {patient.limitations.map((l, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#f97316' }} />
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {patient.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notities</p>
                  <p className="text-muted-foreground">{patient.notes}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Programma's Tab ──────────────────────────────────────────────────────────

function ProgrammasTab({ patient }: { patient: typeof PATIENTS[number] }) {
  const [assignOpen, setAssignOpen] = useState(false)
  const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null

  return (
    <div className="space-y-4">
      {patient.programId && patient.programName ? (
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Huidig programma</span>
              {status && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: status.bg, color: status.text }}>
                  {status.label}
                </span>
              )}
            </div>
            <p className="font-semibold">{patient.programName}</p>
            {patient.startDate && patient.endDate && (
              <p className="text-xs text-muted-foreground">
                {new Date(patient.startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} — {new Date(patient.endDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
            {patient.programStatus === 'ACTIVE' && patient.weeksTotal > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Week {patient.weeksCurrent} van {patient.weeksTotal}</span>
                  <span>{Math.round((patient.weeksCurrent / patient.weeksTotal) * 100)}%</span>
                </div>
                <Progress value={(patient.weeksCurrent / patient.weeksTotal) * 100} className="h-2" />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Link href={`/therapist/programs/${patient.programId}/edit`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                  <ClipboardList className="w-3.5 h-3.5" /> Bewerken
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setAssignOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" /> Nieuw toewijzen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <ClipboardList className="w-8 h-8 text-zinc-300" />
            <p className="text-sm text-muted-foreground">Geen programma toegewezen</p>
            <Button
              size="sm"
              className="gap-1.5"
              style={{ background: '#3ECF6A' }}
              onClick={() => setAssignOpen(true)}
            >
              <Plus className="w-4 h-4" /> Programma toewijzen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Snelle links */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/therapist/programs/new">
          <Card style={{ borderRadius: '12px' }} className="hover:shadow-sm transition-shadow cursor-pointer">
            <CardContent className="p-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium">Nieuw programma</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/therapist/programs/library">
          <Card style={{ borderRadius: '12px' }} className="hover:shadow-sm transition-shadow cursor-pointer">
            <CardContent className="p-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium">Uit bibliotheek</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <AssignProgramDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        patient={patient}
      />
    </div>
  )
}

// ─── Voortgang Tab ────────────────────────────────────────────────────────────

function VoortgangTab({
  sessions,
  avgPain,
  avgRpe,
  compliance,
}: {
  sessions: ReturnType<typeof getSessionsByPatient>
  avgPain: number | null
  avgRpe: number | null
  compliance: number
}) {
  if (sessions.length === 0) {
    return (
      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-8 h-8 text-zinc-300 mb-2" />
          <p className="text-sm text-muted-foreground">Nog geen sessies gelogd</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Samenvatting */}
      <div className="grid grid-cols-3 gap-3">
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: '#3ECF6A' }}>{compliance}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Adherence</p>
          </CardContent>
        </Card>
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{avgPain ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Gem. pijn/10</p>
          </CardContent>
        </Card>
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{avgRpe ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Gem. RPE/10</p>
          </CardContent>
        </Card>
      </div>

      {/* Pijn-trend (visuele balk) */}
      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">Pijnverloop laatste {sessions.length} sessies</p>
          <div className="flex items-end gap-1.5 h-16">
            {sessions.slice(0, 10).reverse().map((s) => (
              <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${(s.pain / 10) * 52}px`,
                    minHeight: '4px',
                    background: s.pain <= 3 ? '#3ECF6A' : s.pain <= 6 ? '#f97316' : '#ef4444',
                  }}
                />
                <span className="text-[10px] text-muted-foreground">{s.pain}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">Oud → Nieuw · Groen ≤ 3 · Oranje ≤ 6 · Rood &gt; 6</p>
        </CardContent>
      </Card>

      {/* Sessie log */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Sessiegeschiedenis</p>
        <div className="space-y-2">
          {sessions.map((s) => (
            <Card key={s.id} style={{ borderRadius: '12px' }}>
              <CardContent className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: s.done === s.total ? '#dcfce7' : '#fef9c3' }}
                    >
                      {s.done === s.total
                        ? <CheckCircle2 className="w-4 h-4" style={{ color: '#15803d' }} />
                        : <Clock className="w-4 h-4" style={{ color: '#a16207' }} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        W{s.week}D{s.day} · {new Date(s.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.done}/{s.total} oefeningen · {s.duration} min
                        {s.notes ? ` · ${s.notes}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-right text-muted-foreground">
                    <div><p className="font-medium text-foreground">{s.pain}/10</p><p>pijn</p></div>
                    <div><p className="font-medium text-foreground">{s.rpe}/10</p><p>RPE</p></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Berichten Tab ────────────────────────────────────────────────────────────

function BerichtenTab({
  messages,
  patientName,
}: {
  messages: ReturnType<typeof getMessagesByPatient>
  patientName: string
}) {
  const [newMessage, setNewMessage] = useState('')

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim()) return
    toast.success('Bericht verstuurd (mock)')
    setNewMessage('')
  }

  if (messages.length === 0) {
    return (
      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-8 h-8 text-zinc-300 mb-2" />
          <p className="text-sm text-muted-foreground">Nog geen berichten met {patientName}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.from === 'therapist' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[80%] rounded-2xl px-3 py-2 text-sm"
                style={
                  msg.from === 'therapist'
                    ? { background: '#3ECF6A', color: '#fff' }
                    : { background: '#f4f4f5', color: '#1a1a1a' }
                }
              >
                <p>{msg.content}</p>
                <p className="text-[10px] mt-1 opacity-60">
                  {new Date(msg.date).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · {new Date(msg.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <form onSubmit={handleSend} className="flex gap-2">
        <Input
          placeholder={`Bericht aan ${patientName}...`}
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          style={{ borderRadius: '10px' }}
        />
        <Button type="submit" size="sm" style={{ background: '#3ECF6A' }} disabled={!newMessage.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
