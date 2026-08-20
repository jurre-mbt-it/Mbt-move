/**
 * Notification dispatcher for CIE insights.
 *
 * v1 channels:
 *   - In-app: write a Notification row for each active treating therapist.
 *   - Email: for CRITICAL urgency only, via Resend (`src/server/mail.ts`).
 *
 * Respects TherapistInsightPref.quietHoursStart/End for email dispatch.
 * No web-push / APNs in v1.
 */
import type { Insight, PrismaClient } from '@prisma/client'
import { sendMail, escapeHtml } from '@/server/mail'
import { getAppUrl } from '@/lib/app-url'
import { emailShell, EMAIL_PALETTE as P } from '@/server/email/shell'
import { BASE_SENDER } from '@/server/email/sender'

function isWithinQuietHours(now: Date, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false
  const hour = now.getHours()
  if (start === end) return false
  if (start < end) return hour >= start && hour < end
  // Overnight range (e.g. 22..7)
  return hour >= start || hour < end
}

export function renderCriticalEmail(insight: Insight, patientName: string): {
  subject: string
  html: string
  text: string
} {
  const dashboardUrl = `${getAppUrl()}/therapist/signals`
  const safeTitle = escapeHtml(insight.title)
  const safeSuggestion = escapeHtml(insight.suggestion)
  const safePatientName = escapeHtml(patientName)

  const body = `
    <tr><td style="padding:0 28px 0 28px;">
      <div style="color:${P.danger};font-size:11px;letter-spacing:0.16em;font-weight:900;text-transform:uppercase;margin-bottom:8px;">Kritiek klinisch signaal</div>
      <p style="color:${P.ink};font-size:16px;font-weight:700;margin:0 0 12px 0;">${safeTitle}</p>
      <p style="color:${P.inkMuted};font-size:14px;line-height:1.55;margin:0 0 16px 0;">${safeSuggestion}</p>
      <p style="color:${P.inkMuted};font-size:12px;margin:0 0 16px 0;">Patiënt: <strong style="color:${P.ink};">${safePatientName}</strong></p>
      <p style="color:${P.inkMuted};font-size:12px;line-height:1.55;margin:0;padding:10px 14px;border-left:3px solid ${P.inkMuted};background:${P.surfaceHi};border-radius:6px;">
        Dit is een geautomatiseerd attentiesignaal op basis van vaste regels, geen diagnose en geen behandeladvies. Je eigen klinische oordeel prevaleert.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="color:${P.inkMuted};font-size:11px;line-height:1.55;margin:0;">
        Je krijgt deze melding omdat je behandelend therapeut bent van deze patiënt. Voorkeuren pas je aan via Instellingen, Signalen.
      </p>
    </td></tr>`

  return {
    // Strip regelovergangen uit titel: insight.title bevat patiëntnaam, die door de
    // patiënt zelf wordt ingevuld. Regelovergangen in een headerveld kunnen
    // header-injectie mogelijk maken.
    subject: `[KRITIEK] ${insight.title.replace(/[\r\n]+/g, ' ').trim()}`,
    html: emailShell({
      sender: BASE_SENDER,
      heading: 'Kritiek signaal',
      bodyHtml: body,
      cta: { url: dashboardUrl, label: 'Bekijk in dashboard' },
    }),
    text:
      `[KRITIEK] ${insight.title}\n\n${insight.suggestion}\n\nPatiënt: ${patientName}\n\n` +
      `Dit is een geautomatiseerd attentiesignaal op basis van vaste regels, geen diagnose en geen behandeladvies. Je eigen klinische oordeel prevaleert.\n\n` +
      `Bekijk in dashboard: ${dashboardUrl}\n\n` +
      `Je krijgt deze melding omdat je behandelend therapeut bent van deze patiënt. Voorkeuren pas je aan via Instellingen, Signalen.`,
  }
}

export async function dispatchInsightNotifications(
  prisma: PrismaClient,
  args: {
    insight: Insight
    patientName: string
    therapistIds: string[]
  },
): Promise<void> {
  const { insight, patientName, therapistIds } = args
  if (therapistIds.length === 0) return

  // Load therapist prefs + email addresses in one query
  const therapists = await prisma.user.findMany({
    where: { id: { in: therapistIds } },
    select: {
      id: true,
      email: true,
      insightPrefs: {
        select: {
          signalsEnabled: true,
          notificationPrefs: true,
          quietHoursStart: true,
          quietHoursEnd: true,
        },
      },
    },
  })

  const now = new Date()

  for (const therapist of therapists) {
    // Honor per-signal enable/disable
    const prefs = therapist.insightPrefs
    const signalsEnabled = (prefs?.signalsEnabled ?? {}) as Record<string, boolean | undefined>
    if (signalsEnabled[insight.signalType] === false) continue

    // Always write in-app notification
    await prisma.notification.create({
      data: {
        userId: therapist.id,
        title: insight.title,
        body: insight.suggestion,
        type: `cie.${insight.signalType}`,
        data: {
          insightId: insight.id,
          signalType: insight.signalType,
          urgency: insight.urgency,
          patientName,
        },
      },
    })

    // Email only for CRITICAL and outside quiet hours
    if (insight.urgency === 'CRITICAL') {
      const quiet = isWithinQuietHours(
        now,
        prefs?.quietHoursStart ?? null,
        prefs?.quietHoursEnd ?? null,
      )
      if (quiet) continue

      const rendered = renderCriticalEmail(insight, patientName)
      await sendMail({
        to: therapist.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        sender: BASE_SENDER,
      }).catch((err) => {
        console.warn('[cie-dispatcher] email send failed', { therapistId: therapist.id, err: String(err) })
      })
    }
  }
}
