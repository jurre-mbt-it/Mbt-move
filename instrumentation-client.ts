/**
 * Client-side Sentry init — runt in de browser zodra een pagina laadt.
 * Skipt als `NEXT_PUBLIC_SENTRY_DSN` ontbreekt.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0, // replays uit — patiëntdata-risico
    replaysOnErrorSampleRate: 0.0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip querystrings met patient IDs en e-mails
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url)
          url.searchParams.forEach((_, key) => {
            if (['email', 'patientId', 'userId', 'token'].includes(key)) {
              url.searchParams.set(key, '[redacted]')
            }
          })
          event.request.url = url.toString()
        } catch {
          // url kon niet geparsed — laat as-is, Sentry zal m accepteren
        }
      }
      return event
    },
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
