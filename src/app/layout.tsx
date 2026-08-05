import type { Metadata, Viewport } from 'next'
import { TRPCProvider } from '@/lib/trpc/Provider'
import { Toaster } from '@/components/ui/sonner'
import { CookieBanner } from '@/components/CookieBanner'
import './globals.css'

// Nonce-based CSP (zie src/proxy.ts) vereist dat ELKE pagina dynamisch rendert:
// een statisch geprerenderde pagina krijgt build-time geen nonce, waardoor haar
// scripts in productie door `script-src 'strict-dynamic'` geblokkeerd worden
// (kapotte login/MFA/landing). Dit forceert alle routes dynamisch — bewuste
// trade-off van de afdwingende CSP (geen static/CDN-caching). Cascade vanuit de
// root-layout dekt ook toekomstige pagina's.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    template: '%s · BASE',
    default: 'BASE',
  },
  description: 'Exercise prescription and rehabilitation platform for clinicians and patients.',
}

export const viewport: Viewport = {
  themeColor: '#0E2729',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full overflow-x-hidden athletic-dark">
      <body className="athletic-dark min-h-full flex flex-col antialiased overflow-x-hidden w-full max-w-[100vw]">
        <TRPCProvider>
          {children}
        </TRPCProvider>
        <CookieBanner />
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: 'var(--p-surface)',
              color: 'var(--p-ink)',
              border: '1px solid var(--p-line-strong)',
            },
          }}
        />
      </body>
    </html>
  )
}
