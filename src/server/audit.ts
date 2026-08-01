/**
 * Audit-log helper — AVG art. 32.
 *
 * Schrijft naar `audit_logs` tabel. Wordt via Prisma (service-role) geïnsert;
 * RLS verbergt daarna de inserts tegen read-attempts van non-admins.
 *
 * Belangrijk: metadata mag GEEN vrije PII bevatten (bv. volledig wachtwoord,
 * pijn-notitie, medische vrije tekst). Alleen IDs, event-type, status-codes.
 */
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export type AuditEvent =
  // Auth events
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'MFA_ENROLLED'
  | 'MFA_VERIFIED'
  | 'MFA_FAILED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_CHANGED'
  // Invite events
  | 'INVITE_CREATED'
  | 'INVITE_REDEEMED'
  | 'INVITE_FAILED'
  | 'INVITE_RESENT'
  // Data access
  | 'PATIENT_VIEWED'
  | 'PROGRAM_VIEWED'
  | 'SESSION_LOG_VIEWED'
  // Data mutations
  | 'PROGRAM_CREATED'
  | 'PROGRAM_UPDATED'
  | 'PROGRAM_DELETED'
  | 'SESSION_LOGGED'
  | 'CARDIO_SESSION_LOGGED'
  | 'PAIN_REPORTED'
  | 'CONSENT_CHANGED'
  // Een coach vraagt een therapeut om mee te kijken bij een atleet; de
  // atleet keurt de koppeling zelf goed (co-monitoring).
  | 'CO_MONITOR_REQUESTED'
  | 'DPA_ACCEPTED'
  | 'GHV_ACCEPTED'
  // Rehab-trajecten (episodes). Starten, afsluiten en heropenen zijn alle drie
  // klinische besluiten en horen in het spoor: zonder het startevent staat er
  // een einde in het log zonder begin. De toelichting (`outcomeNote`) blijft op
  // de rij zelf staan, want die is vrije tekst en mag hier niet in.
  | 'REHAB_TRAJECT_STARTED'
  | 'REHAB_TRAJECT_CLOSED'
  | 'REHAB_TRAJECT_REOPENED'
  // Uitbehandeld zetten en terughalen. Alleen de reden-enum gaat mee in de
  // metadata; de vrije toelichting staat op PatientCareStatus.note, want dat is
  // medische vrije tekst. Sluit het archiveren ook een rehab-traject af, dan
  // komt er náást deze regel een eigen REHAB_TRAJECT_CLOSED bij: anders is
  // achteraf niet te zien of de therapeut dat traject zelf sloot.
  | 'PATIENT_DISCHARGED'
  | 'PATIENT_REACTIVATED'
  // GDPR
  | 'DATA_EXPORTED'
  | 'ACCOUNT_DELETION_REQUESTED'
  | 'ACCOUNT_DELETED'
  // De cron kon een aangevraagde verwijdering niet uitvoeren. Hoort in de
  // trail en niet alleen in de serverlogs: er loopt een AVG-termijn door
  // terwijl het account blijft staan, en niemand leest die logs uit zichzelf.
  | 'ACCOUNT_DELETE_FAILED'
  | 'ACCOUNT_DELETION_CANCELLED'
  // Admin
  | 'ROLE_CHANGED'
  | 'PRACTICE_CHANGED'
  | 'MFA_RESET_BY_ADMIN'
  // Rate-limit
  | 'RATE_LIMIT_HIT'

export interface AuditInput {
  event: AuditEvent
  userId?: string | null
  actorEmail?: string | null
  resource?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  req?: NextRequest | Request | null
}

/**
 * Log een event naar audit_logs. Faalt silently om nooit de business-flow te breken.
 * Return `true` bij succes, `false` anders (zie server-console voor foutdetails).
 */
export async function auditLog(input: AuditInput): Promise<boolean> {
  try {
    const { ip, userAgent } = extractRequestMeta(input.req)
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        actorEmail: input.actorEmail ?? null,
        event: input.event,
        resource: input.resource,
        resourceId: input.resourceId,
        ip,
        userAgent,
        metadata: (input.metadata as object | undefined) ?? undefined,
      },
    })
    return true
  } catch (err) {
    // Audit-write mag nooit business logic breken
    // (bv. als tabel nog niet bestaat na fresh clone)
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[audit] failed to write:', (err as Error).message)
    }
    return false
  }
}

function extractRequestMeta(req?: NextRequest | Request | null): {
  ip?: string
  userAgent?: string
} {
  if (!req) return {}
  const headers = req.headers
  // Voorkeur voor `x-real-ip`: dat zet Vercel's edge-proxy op het echte
  // client-IP. `x-forwarded-for`.split(',')[0] is de EERSTE waarde en die is
  // client-supplied (spoofbaar) wanneer het request niet achter de Vercel-proxy
  // langskomt. Voor een best-effort audit-trail is dit acceptabel, maar het IP
  // is dus niet forensisch betrouwbaar — behandel het als indicatief.
  const ip =
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  const userAgent = headers.get('user-agent') ?? undefined
  return { ip, userAgent }
}
