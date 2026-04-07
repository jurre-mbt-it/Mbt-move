import type { Metadata } from 'next'
import { TRPCProvider } from '@/lib/trpc/Provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s – MBT Move',
    default: 'MBT Move',
  },
  description: 'Exercise prescription and rehabilitation platform for clinicians and patients.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        <TRPCProvider>
          {children}
        </TRPCProvider>
        <Toaster />
      </body>
    </html>
  )
}
