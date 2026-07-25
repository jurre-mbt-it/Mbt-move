import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auditLog } from '@/server/audit'
import { renderProgressPdfHtml } from '@/lib/pdf/progress'
import { actorCanSeePatient, getPrintActor, staffMfaBlock } from '@/lib/pdf/auth'
import { getPatientProgressData } from '@/lib/progress-data'
import { getPatientRehabTrackerData } from '@/lib/rehab-data'

export const dynamic = 'force-dynamic'

const NOTE_MAX_LENGTH = 4000

export async function GET(
  req: Request,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const { patientId } = await params
  const url = new URL(req.url)
  const rawNote = url.searchParams.get('note')
  // Cap op een redelijke lengte zodat een rogue URL geen 100MB HTML kan
  // genereren. 4000 chars dekt ruim een halve A4 aan vrije tekst.
  const note = rawNote && rawNote.length <= NOTE_MAX_LENGTH ? rawNote : null

  const actor = await getPrintActor()
  if (!actor) {
    return new NextResponse('Niet ingelogd', { status: 401 })
  }
  const mfaBlock = staffMfaBlock(actor)
  if (mfaBlock) return new NextResponse(mfaBlock, { status: 403 })

  if (actor.role !== 'ADMIN' && actor.role !== 'THERAPIST') {
    return new NextResponse('Geen toegang', { status: 403 })
  }

  if (!(await actorCanSeePatient(actor, patientId))) {
    return new NextResponse('Geen toegang tot deze patiënt', { status: 403 })
  }

  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    select: { id: true, name: true, email: true },
  })
  if (!patient) {
    return new NextResponse('Patiënt niet gevonden', { status: 404 })
  }

  const [progress, rehabTracker] = await Promise.all([
    getPatientProgressData(prisma, patientId),
    getPatientRehabTrackerData(prisma, patientId),
  ])

  await auditLog({
    event: 'DATA_EXPORTED',
    userId: actor.id,
    actorEmail: actor.email,
    resource: 'PatientProgress',
    resourceId: patientId,
    metadata: {
      route: 'print.progress',
      format: 'pdf-html',
      windowDays: progress.windowDays,
      hasRehabTracker: !!rehabTracker,
      hasNote: !!note,
    },
    req,
  })

  const html = renderProgressPdfHtml({
    progress: {
      patient: { name: patient.name, email: patient.email },
      generatedAt: new Date(),
      ...progress,
      rehabTracker,
      note,
    },
    autoPrint: true,
  })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
