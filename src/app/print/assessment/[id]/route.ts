import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auditLog } from '@/server/audit'
import { renderAssessmentPdfHtml } from '@/lib/pdf/assessment'
import { actorIsTreating, getPrintActor, staffMfaBlock } from '@/lib/pdf/auth'

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

  // Spiegel van assessmentProcedure: alleen therapeut met canUseAssessment,
  // of admin. Anders 403 — wel met nette HTML zodat de tab niet leeg blijft.
  if (actor.role !== 'ADMIN' && (actor.role !== 'THERAPIST' || !actor.canUseAssessment)) {
    return new NextResponse('Mobility Assessment niet geactiveerd voor jouw account', {
      status: 403,
    })
  }

  const assessment = await prisma.patientAssessment.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, name: true, email: true } },
      therapist: { select: { id: true, name: true, email: true } },
      scores: {
        include: {
          test: {
            select: {
              id: true,
              name: true,
              description: true,
              criteria: true,
              testType: true,
              archetype: true,
              order: true,
              suggestedMobilizations: {
                orderBy: { order: 'asc' },
                include: {
                  exercise: { select: { id: true, name: true, category: true } },
                },
              },
            },
          },
        },
      },
      archetypeSummaries: true,
    },
  })

  if (!assessment) {
    return new NextResponse('Assessment niet gevonden', { status: 404 })
  }

  if (!(await actorIsTreating(actor, assessment.patientId))) {
    return new NextResponse('Geen behandelrelatie met deze patiënt', { status: 403 })
  }

  // Audit log: gevoelige patient-data wordt naar PDF geëxporteerd. We
  // loggen dit expliciet zodat een admin later kan herleiden wie wanneer
  // welke export deed.
  await auditLog({
    event: 'DATA_EXPORTED',
    userId: actor.id,
    actorEmail: actor.email,
    resource: 'PatientAssessment',
    resourceId: id,
    metadata: { route: 'print.assessment', format: 'pdf-html', patientId: assessment.patientId },
    req,
  })

  const html = renderAssessmentPdfHtml({
    assessment,
    autoPrint: true,
  })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
