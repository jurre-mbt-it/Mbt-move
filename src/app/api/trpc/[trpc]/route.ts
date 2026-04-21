import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { type NextRequest, NextResponse } from 'next/server'
import { appRouter } from '@/server/routers/_app'
import { createTRPCContext } from '@/server/trpc'

/**
 * CORS allow-list. Ooit stond hier `*`, wat betekent dat elke site met een
 * gelekte Bearer-token authenticated requests naar deze API kon doen — zie
 * security review #8. Native mobile clients (Expo/iOS) sturen geen Origin
 * header, dus die raken we niet kwijt.
 */
const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_APP_URL,
  'https://mbt-move.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  // Expo dev — web-preview / capacitor schemes
  'http://localhost:8081',
  'http://localhost:19006',
].filter(Boolean) as string[])

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-trpc-source',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  // Geen Origin header → native client of same-origin; niks extra nodig.
  if (!origin) return base
  // Origin in allowlist → echo terug. Anders: geen Allow-Origin header, browser blockt.
  if (ALLOWED_ORIGINS.has(origin)) {
    base['Access-Control-Allow-Origin'] = origin
  }
  return base
}

const handler = async (req: NextRequest) => {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req }),
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(`tRPC failed on ${path ?? '<no-path>'}: ${error.message}`)
          }
        : undefined,
  })

  const corsHeaders = buildCorsHeaders(req.headers.get('origin'))
  for (const [k, v] of Object.entries(corsHeaders)) {
    response.headers.set(k, v)
  }
  return response
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(req.headers.get('origin')),
  })
}

export { handler as GET, handler as POST }
