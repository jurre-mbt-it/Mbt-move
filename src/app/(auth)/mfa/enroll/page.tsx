import { MfaEnrollForm } from '@/components/auth/MfaEnrollForm'

export const metadata = {
  title: 'Enable 2FA – MBT Gym',
}

export default function MfaEnrollPage() {
  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center p-4" style={{ background: '#0A0E0F' }}>
      <MfaEnrollForm />
    </div>
  )
}
