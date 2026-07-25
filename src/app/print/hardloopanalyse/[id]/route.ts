import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auditLog } from '@/server/audit'
import { renderRunningAnalysisPdfHtml } from '@/lib/pdf/runningAnalysis'
import { actorCanSeePatient, getPrintActor, staffMfaBlock } from '@/lib/pdf/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const actor = await getPrintActor()
  if (!actor) return new NextResponse('Niet ingelogd', { status: 401 })
  const mfaBlock = staffMfaBlock(actor)
  if (mfaBlock) return new NextResponse(mfaBlock, { status: 403 })

  // Zelfde gate als de Mobility Assessment: therapeut met canUseAssessment of admin.
  if (actor.role !== 'ADMIN' && (actor.role !== 'THERAPIST' || !actor.canUseAssessment)) {
    return new NextResponse('Assessment niet geactiveerd voor jouw account', { status: 403 })
  }

  const analysis = await prisma.runningAnalysis.findUnique({
    where: { id },
    include: {
      items: { orderBy: { order: 'asc' } },
      advice: { orderBy: { order: 'asc' } },
      patient: { select: { id: true, name: true, email: true, dateOfBirth: true } },
      therapist: { select: { id: true, name: true, email: true, jobTitle: true } },
    },
  })

  if (!analysis) return new NextResponse('Hardloopanalyse niet gevonden', { status: 404 })

  if (!(await actorCanSeePatient(actor, analysis.patientId))) {
    return new NextResponse('Geen behandelrelatie met deze patiënt', { status: 403 })
  }

  await auditLog({
    event: 'DATA_EXPORTED',
    userId: actor.id,
    actorEmail: actor.email,
    resource: 'RunningAnalysis',
    resourceId: id,
    metadata: { route: 'print.hardloopanalyse', format: 'pdf-html', patientId: analysis.patientId },
    req,
  })

  // metricComments (Json) shallow casten naar de platte vorm die de renderer
  // verwacht — Prisma levert het als recursieve JsonValue.
  const html = renderRunningAnalysisPdfHtml({
    analysis: { ...analysis, metricComments: (analysis.metricComments ?? null) as Record<string, string> | null },
    autoPrint: true,
  })

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}
