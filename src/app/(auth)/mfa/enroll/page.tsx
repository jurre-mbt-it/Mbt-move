import { MfaEnrollForm } from '@/components/auth/MfaEnrollForm'

export const metadata = {
  title: 'Enable 2FA – MBT Move',
}

export default function MfaEnrollPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAFAFA' }}>
      <MfaEnrollForm />
    </div>
  )
}
