import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'

/**
 * CSP-violation report sink (AVG/security — actie 11 uit de DPIA).
 *
 * De Content-Security-Policy draait in REPORT-ONLY modus (`next.config.ts`).
 * Zonder report-endpoint gaan violations alléén naar de browserconsole en
 * worden ze nergens verzameld — waardoor je niet kunt zien wat je moet
 * aanscherpen vóór je CSP afdwingend maakt. Deze route verzamelt ze.
 *
 * Bewust minimaal:
 *  - Geen auth: browsers POSTen reports ongeauthenticeerd.
 *  - Geen DB-tabel: we loggen gestructureerd met prefix `[csp-report]` zodat het
 *    in de Vercel-logs te filteren is. (Wil je persistentie/aggregatie: forward
 *    naar Sentry of een tabel mét RLS — zie AGENTS.md.)
 *  - Alleen de velden die nodig zijn om de policy aan te scherpen worden gelogd,
 *    niet de volledige payload.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Violation = Record<string, unknown>

function pick(v: Violation) {
  // Legacy `application/csp-report` gebruikt hyphenated keys; de Reporting API
  // (`application/reports+json`) gebruikt camelCase. We dekken beide.
  return {
    directive:
      v['effective-directive'] ??
      v['violated-directive'] ??
      v['effectiveDirective'] ??
      null,
    blockedUri: v['blocked-uri'] ?? v['blockedURL'] ?? null,
    documentUri: v['document-uri'] ?? v['documentURL'] ?? null,
    scriptSample: v['script-sample'] ?? v['sample'] ?? null,
    disposition: v['disposition'] ?? null,
  }
}

export async function POST(req: NextRequest) {
  try {
    // Best-effort IP-throttle tegen log-flooding. Het endpoint is bewust
    // ongeauthenticeerd (browsers POSTen reports zonder sessie), dus we keyen
    // op het (spoofbare) client-IP — genoeg om per-bron log-spam te dempen.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await rateLimit('csp.report', ip, RATE_LIMITS.cspReport)
    if (!rl.ok) return new NextResponse(null, { status: 204 })

    const raw = await req.text()
    // Guard tegen lege/oversized bodies (spam/abuse).
    if (!raw || raw.length > 16_000) {
      return new NextResponse(null, { status: 204 })
    }

    const parsed = JSON.parse(raw)
    let violations: Violation[]

    if (Array.isArray(parsed)) {
      // Reporting API: array van { type, body, ... }
      violations = parsed
        .filter((r) => !r?.type || r.type === 'csp-violation')
        .map((r) => (r?.body as Violation) ?? r)
    } else if (parsed?.['csp-report']) {
      // Legacy: { "csp-report": { ... } }
      violations = [parsed['csp-report'] as Violation]
    } else {
      violations = [parsed as Violation]
    }

    // Cap het aantal gelogde violations per request (één report-POST kan een
    // grote array bevatten) tegen log-amplificatie.
    for (const v of violations.slice(0, 20)) {
      if (v && typeof v === 'object') {
        console.warn('[csp-report]', JSON.stringify(pick(v)))
      }
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    // Nooit een report-POST laten falen — best-effort logging.
    return new NextResponse(null, { status: 204 })
  }
}
