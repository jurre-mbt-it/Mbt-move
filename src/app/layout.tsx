import type { Metadata } from 'next'
import { TRPCProvider } from '@/lib/trpc/Provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s – MBT Gym',
    default: 'MBT Gym',
  },
  description: 'Exercise prescription and rehabilitation platform for clinicians and patients.',
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
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: '#141A1B',
              color: '#F5F7F6',
              border: '1px solid rgba(255,255,255,0.12)',
            },
          }}
        />
      </body>
    </html>
  )
}
