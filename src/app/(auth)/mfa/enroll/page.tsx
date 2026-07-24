import { Suspense } from 'react'
import { MfaEnrollForm } from '@/components/auth/MfaEnrollForm'

export const metadata = {
  title: 'Enable 2FA – BASE',
}

export default function MfaEnrollPage() {
  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center p-4" style={{ background: '#0E2729' }}>
      <Suspense fallback={null}>
        <MfaEnrollForm />
      </Suspense>
    </div>
  )
}
