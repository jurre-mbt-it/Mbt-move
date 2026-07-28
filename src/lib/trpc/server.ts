import { cache } from 'react'
import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query'
import { createHydrationHelpers } from '@trpc/react-query/rsc'
import { appRouter, type AppRouter } from '@/server/routers/_app'
import { createTRPCContext, createCallerFactory } from '@/server/trpc'

/**
 * Server-side tRPC voor RSC-prefetch: pagina's kunnen queries alvast op de
 * server starten (`void serverTrpc.x.y.prefetch()`) en via <HydrateClient>
 * naar de client streamen. De client-`useQuery`'s met dezelfde key vinden de
 * data dan al in de React Query-cache — geen hydrate→fetch-waterfall meer.
 *
 * Prefetch ALLEEN queries waarvan de input server-side exact reproduceerbaar
 * is (geen input, of input die niet van browser-tijd/-staat afhangt) — anders
 * matcht de query-key niet en is de prefetch dode lading.
 */

// Per request éen context/queryclient (React.cache), zodat meerdere prefetches
// binnen dezelfde render de auth-lookup delen.
const createContext = cache(() => createTRPCContext({}))

const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          // Ook pending queries dehydrateren: de pagina hoeft niet op de data
          // te wachten, de promise streamt mee naar de client.
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
)

/**
 * De app draait zonder transformer: clients krijgen JSON (Dates als ISO-
 * strings). Een directe caller geeft echte Date-objecten terug en RSC zou die
 * als Date de client-cache in serialiseren — een andere shape dan een gewone
 * fetch. Deze wrapper JSON-round-tript elk resultaat zodat gehydrateerde data
 * byte-voor-byte hetzelfde is als wat over de draad zou komen.
 */
function jsonClone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

// De caller is een recursieve proxy: elk niveau is een functie waarop je ook
// dieper kunt navigeren. Daarom beide traps: `get` wikkelt kinderen, `apply`
// voert de procedure uit en kloont het resultaat.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapCaller(target: any): any {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const v = Reflect.get(obj, prop, receiver)
      if (typeof prop !== 'string') return v
      if (typeof v === 'function' || (v && typeof v === 'object')) return wrapCaller(v)
      return v
    },
    apply(fn, thisArg, args) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Promise.resolve(Reflect.apply(fn as any, thisArg, args)).then(jsonClone)
    },
  })
}

const baseCaller = createCallerFactory(appRouter)(createContext)
const caller = wrapCaller(baseCaller) as typeof baseCaller

export const { trpc: serverTrpc, HydrateClient } = createHydrationHelpers<AppRouter>(
  caller,
  getQueryClient,
)
