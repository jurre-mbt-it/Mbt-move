'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { httpBatchLink } from '@trpc/client'
import { useState } from 'react'
import { trpc } from './client'

function getBaseUrl() {
  if (typeof window !== 'undefined') return ''
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  return `http://localhost:${process.env.PORT ?? 3000}`
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 60s "vers": revisits binnen een minuut komen direct uit cache,
            // geen refetch. gcTime houdt de cache 5 min in leven zodat heen-en-
            // weer navigeren snel blijft, ook ná het vers-venster.
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            // Geen verrassende reload als je terugklikt naar het tabblad.
            refetchOnWindowFocus: false,
            // Faal sneller bij een échte fout i.p.v. 3× opnieuw proberen.
            retry: 1,
          },
        },
      })
  )

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
        }),
      ],
    })
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
      </QueryClientProvider>
    </trpc.Provider>
  )
}
