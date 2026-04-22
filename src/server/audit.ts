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
  | 'CONSENT_CHANGED'
  | 'DPA_ACCEPTED'
  // GDPR
  | 'DATA_EXPORTED'
  | 'ACCOUNT_DELETION_REQUESTED'
  | 'ACCOUNT_DELETED'
  | 'ACCOUNT_DELETION_CANCELLED'
  // Admin
  | 'ROLE_CHANGED'
  | 'PRACTICE_CHANGED'
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
  const ip =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    undefined
  const userAgent = headers.get('user-agent') ?? undefined
  return { ip, userAgent }
}
