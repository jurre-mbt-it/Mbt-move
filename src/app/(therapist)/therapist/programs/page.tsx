'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MOCK_PROGRAMS } from '@/lib/program-constants'
import { Plus, Layers, Users, Calendar, Copy, Pencil } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: '#dcfce7', text: '#15803d', label: 'Actief' },
  DRAFT:  { bg: '#fef9c3', text: '#a16207', label: 'Concept' },
  COMPLETED: { bg: '#f1f5f9', text: '#475569', label: 'Afgerond' },
}

export default function ProgramsPage() {
  const templates = MOCK_PROGRAMS.filter(p => p.isTemplate)
  const programs  = MOCK_PROGRAMS.filter(p => !p.isTemplate)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programma&apos;s</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Maak en beheer revalidatieprogramma&apos;s</p>
        </div>
        <Link href="/therapist/programs/new">
          <Button style={{ background: '#3ECF6A' }} className="gap-2">
            <Plus className="w-4 h-4" />
            Nieuw programma
          </Button>
        </Link>
      </div>

      {/* Templates */}
      {templates.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Layers className="w-4 h-4" /> Templates ({templates.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map(p => (
              <ProgramCard key={p.id} program={p} isTemplate />
            ))}
          </div>
        </section>
      )}

      {/* Programs */}
      <section className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Users className="w-4 h-4" /> Patiëntprogramma&apos;s ({programs.length})
        </h2>
        {programs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl text-center">
            <p className="text-sm text-muted-foreground">Nog geen programma&apos;s</p>
            <Link href="/therapist/programs/new">
              <Button variant="outline" size="sm" className="mt-3">
                <Plus className="w-4 h-4 mr-1" /> Programma aanmaken
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {programs.map(p => (
              <ProgramCard key={p.id} program={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ProgramCard({ program, isTemplate = false }: { program: typeof MOCK_PROGRAMS[number]; isTemplate?: boolean }) {
  const status = STATUS_COLORS[program.status] ?? STATUS_COLORS.DRAFT

  return (
    <Card style={{ borderRadius: '12px' }} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{program.name}</h3>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: status.bg, color: status.text }}
              >
                {status.label}
              </span>
              {isTemplate && (
                <Badge variant="secondary" className="text-xs">Template</Badge>
              )}
            </div>
            {program.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{program.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {program.patientName && (
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{program.patientName}</span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />{program.weeks} wk · {program.daysPerWeek}×/wk
              </span>
              <span>{program.exerciseCount} oefeningen</span>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => toast.info('Dupliceren werkt met Supabase')}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Link href={`/therapist/programs/${program.id}/edit`}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
