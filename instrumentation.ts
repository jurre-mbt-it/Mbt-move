/**
 * Next.js `instrumentation` hook — runt één keer per Node-process startup.
 * Gebruikt Sentry als `SENTRY_DSN` gezet is; skipt stil anders.
 *
 * Setup: maak account op sentry.io, project "mbt-move", kopieer DSN.
 * Env-vars in Vercel:
 *   SENTRY_DSN=https://...@o...ingest.sentry.io/...
 *   NEXT_PUBLIC_SENTRY_DSN=<zelfde>           ← voor client-side
 *   SENTRY_ENVIRONMENT=production|preview      ← optioneel
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      // Server-side errors zijn meestal de meest waardevolle signalen
      sendDefaultPii: false, // patiëntdata NOOIT naar Sentry
      ignoreErrors: [
        // tRPC rate-limits zijn verwacht gedrag
        'TOO_MANY_REQUESTS',
      ],
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    })
  }
}

export async function onRequestError(
  err: unknown,
  request: {
    path: string
    method: string
    headers: Record<string, string | string[] | undefined>
  },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(err, request, context)
}
