import { MfaChallenge } from '@/components/auth/MfaChallenge'

export const metadata = {
  title: 'Two-Factor Auth – MBT Gym',
}

export default function MfaChallengePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAFAFA' }}>
      <MfaChallenge />
    </div>
  )
}
