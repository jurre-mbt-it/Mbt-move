'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { type PatientProfile, generateAccessCode } from '@/lib/mock-data'
import { ClipboardList, Copy, Mail, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

// Mock programma's beschikbaar voor toewijzing
const AVAILABLE_PROGRAMS = [
  { id: 'p1', name: 'Knie Revalidatie — Fase 1', weeks: 6, category: 'Knie' },
  { id: 'p2', name: 'Schouder Herstel — Fase 2', weeks: 8, category: 'Schouder' },
  { id: 'p3', name: 'Enkel & Achilles Fase 1', weeks: 6, category: 'Enkel' },
  { id: 'p4', name: 'PFPS Protocol — Bilateral', weeks: 8, category: 'Knie' },
  { id: 'p5', name: 'Enkeldistorsie Herstel', weeks: 8, category: 'Enkel' },
  { id: 'p6', name: 'Rugpijn — Core Stabiliteit', weeks: 10, category: 'Rug' },
  { id: 'p7', name: 'Schouder Impingement Preventie', weeks: 6, category: 'Schouder' },
]

interface AssignProgramDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: PatientProfile
}

type Step = 'select' | 'dates' | 'code'

export function AssignProgramDialog({ open, onOpenChange, patient }: AssignProgramDialogProps) {
  const [step, setStep] = useState<Step>('select')
  const [selectedProgram, setSelectedProgram] = useState<typeof AVAILABLE_PROGRAMS[number] | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [accessCode] = useState(() => patient.accessCode || generateAccessCode())
  const [sending, setSending] = useState(false)

  function handleSelectProgram(p: typeof AVAILABLE_PROGRAMS[number]) {
    setSelectedProgram(p)
    // Auto-fill start date to today
    const today = new Date().toISOString().split('T')[0]
    setStartDate(today)
    // Auto-fill end date based on weeks
    const end = new Date()
    end.setDate(end.getDate() + p.weeks * 7)
    setEndDate(end.toISOString().split('T')[0])
  }

  function handleNext() {
    if (!selectedProgram) return
    setStep('dates')
  }

  async function handleAssign() {
    if (!selectedProgram || !startDate) return
    setSending(true)
    try {
      // Try to send email via Resend (graceful failure)
      await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: patient.email,
          patientName: patient.name,
          programName: selectedProgram.name,
          accessCode,
          startDate,
        }),
      }).catch(() => null) // ignore network errors

      toast.success(`Programma toegewezen aan ${patient.name}`)
      setStep('code')
    } finally {
      setSending(false)
    }
  }

  function handleClose() {
    setStep('select')
    setSelectedProgram(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent style={{ borderRadius: '16px', maxWidth: '480px' }}>
        {step === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>Programma toewijzen</DialogTitle>
              <DialogDescription>
                Kies een programma voor {patient.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-2 max-h-72 overflow-y-auto pr-1">
              {AVAILABLE_PROGRAMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProgram(p)}
                  className="w-full text-left"
                >
                  <div
                    className="flex items-center gap-3 p-3 rounded-xl border transition-colors"
                    style={
                      selectedProgram?.id === p.id
                        ? { borderColor: '#BEF264', background: 'rgba(190,242,100,0.10)' }
                        : { borderColor: 'rgba(255,255,255,0.12)' }
                    }
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: '#1C2425' }}
                    >
                      <ClipboardList className="w-4 h-4 text-[#7B8889]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.weeks} weken</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">{p.category}</Badge>
                  </div>
                </button>
              ))}
            </div>
            <Button
              className="w-full"
              style={{ background: '#BEF264' }}
              disabled={!selectedProgram}
              onClick={handleNext}
            >
              Volgende
            </Button>
          </>
        )}

        {step === 'dates' && selectedProgram && (
          <>
            <DialogHeader>
              <DialogTitle>Start- en einddatum</DialogTitle>
              <DialogDescription>
                {selectedProgram.name} · {selectedProgram.weeks} weken
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Startdatum</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Einddatum (optioneel)</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>

              <div className="rounded-xl p-3 space-y-1" style={{ background: '#1C2425' }}>
                <p className="text-xs font-medium text-muted-foreground">Toegangscode patiënt</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-lg">{accessCode}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(accessCode)
                      toast.success('Gekopieerd')
                    }}
                  >
                    <Copy className="w-4 h-4 text-[#7B8889] hover:text-[#7B8889]" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Patiënt kan inloggen via <span className="font-medium">/login/code</span>
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('select')}>
                  Terug
                </Button>
                <Button
                  className="flex-1 gap-2"
                  style={{ background: '#BEF264' }}
                  disabled={!startDate || sending}
                  onClick={handleAssign}
                >
                  <Mail className="w-4 h-4" />
                  {sending ? 'Versturen...' : 'Toewijzen & e-mail sturen'}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'code' && selectedProgram && (
          <>
            <DialogHeader>
              <DialogTitle>Toegewezen!</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(190,242,100,0.14)' }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: '#BEF264' }} />
              </div>
              <div>
                <p className="font-semibold">{selectedProgram.name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Toegewezen aan {patient.name}
                </p>
              </div>

              <div className="rounded-xl p-4" style={{ background: '#1C2425' }}>
                <p className="text-xs text-muted-foreground mb-1">Toegangscode</p>
                <p className="font-mono font-bold text-2xl">{accessCode}</p>
                <button
                  className="text-xs mt-1 flex items-center gap-1 mx-auto"
                  style={{ color: '#BEF264' }}
                  onClick={() => {
                    navigator.clipboard.writeText(accessCode)
                    toast.success('Gekopieerd')
                  }}
                >
                  <Copy className="w-3 h-3" /> Kopieer code
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                Een e-mail is verstuurd naar <strong>{patient.email}</strong> (indien Resend geconfigureerd is)
              </p>

              <Button className="w-full" style={{ background: '#BEF264' }} onClick={handleClose}>
                Sluiten
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
