import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auditLog } from '@/server/audit'
import { renderTestReportPdfHtml } from '@/lib/pdf/testReport'
import { actorCanSeePatient, getPrintActor, staffMfaBlock } from '@/lib/pdf/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const actor = await getPrintActor()
  if (!actor) {
    return new NextResponse('Niet ingelogd', { status: 401 })
  }
  const mfaBlock = staffMfaBlock(actor)
  if (mfaBlock) return new NextResponse(mfaBlock, { status: 403 })
  // Testrapport is een therapeut/admin-feature (niet patient-facing in v1).
  if (actor.role !== 'ADMIN' && actor.role !== 'THERAPIST') {
    return new NextResponse('Geen toegang tot testrapporten', { status: 403 })
  }

  const report = await prisma.testReport.findUnique({
    where: { id },
    include: {
      entries: { orderBy: [{ categoryOrder: 'asc' }, { order: 'asc' }] },
      advice: { orderBy: { order: 'asc' } },
      patient: { select: { id: true, name: true, email: true, dateOfBirth: true } },
      therapist: { select: { id: true, name: true, email: true, jobTitle: true } },
    },
  })

  if (!report) {
    return new NextResponse('Testrapport niet gevonden', { status: 404 })
  }

  if (!(await actorCanSeePatient(actor, report.patientId))) {
    return new NextResponse('Geen behandelrelatie met deze patiënt', { status: 403 })
  }

  // Audit: gevoelige patient-data wordt naar PDF geëxporteerd.
  await auditLog({
    event: 'DATA_EXPORTED',
    userId: actor.id,
    actorEmail: actor.email,
    resource: 'TestReport',
    resourceId: id,
    metadata: { route: 'print.testReport', format: 'pdf-html', patientId: report.patientId },
    req,
  })

  const html = renderTestReportPdfHtml({ report, autoPrint: true })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
