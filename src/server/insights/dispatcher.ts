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
import { sendMail } from '@/server/mail'

const BRAND = {
  bg: '#0A0E0F',
  surface: '#141A1B',
  ink: '#F5F7F6',
  inkMuted: '#7B8889',
  lime: '#BEF264',
  danger: '#F87171',
}

function isWithinQuietHours(now: Date, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false
  const hour = now.getHours()
  if (start === end) return false
  if (start < end) return hour >= start && hour < end
  // Overnight range (e.g. 22..7)
  return hour >= start || hour < end
}

function renderCriticalEmail(insight: Insight, patientName: string): {
  subject: string
  html: string
  text: string
} {
  const subject = `[KRITIEK] ${insight.title}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mbt-gym.nl'
  const dashboardUrl = `${appUrl}/therapist/signals`

  const html = `<!DOCTYPE html>
<html lang="nl">
  <body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <div style="color:${BRAND.danger};font-size:11px;letter-spacing:0.16em;font-weight:900;text-transform:uppercase;margin-bottom:8px;">
        Kritiek klinisch signaal
      </div>
      <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:900;letter-spacing:-0.01em;">
        ${insight.title}
      </h1>
      <p style="color:${BRAND.inkMuted};font-size:14px;line-height:1.55;margin:0 0 20px 0;">
        ${insight.suggestion}
      </p>
      <p style="color:${BRAND.inkMuted};font-size:12px;margin:0 0 20px 0;">
        Patiënt: <strong style="color:${BRAND.ink};">${patientName}</strong>
      </p>
      <a href="${dashboardUrl}" style="display:inline-block;background:${BRAND.lime};color:${BRAND.bg};padding:12px 20px;border-radius:8px;font-weight:900;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">
        Bekijk in dashboard →
      </a>
      <p style="color:${BRAND.inkMuted};font-size:11px;margin-top:32px;line-height:1.55;">
        Je ontvangt deze melding omdat je een behandelend therapeut bent van deze patiënt en de Clinical Insight Engine is geactiveerd. Je kunt voorkeuren aanpassen via Instellingen → Signalen.
      </p>
    </div>
  </body>
</html>`

  const text = `[KRITIEK] ${insight.title}

${insight.suggestion}

Patiënt: ${patientName}

Bekijk in dashboard: ${dashboardUrl}

Je ontvangt deze melding omdat je een behandelend therapeut bent van deze patient en de Clinical Insight Engine is geactiveerd.`

  return { subject, html, text }
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
      }).catch((err) => {
        console.warn('[cie-dispatcher] email send failed', { therapistId: therapist.id, err: String(err) })
      })
    }
  }
}
