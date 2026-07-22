import { MfaChallenge } from '@/components/auth/MfaChallenge'

export const metadata = {
  title: 'Two-Factor Auth – MBT Gym',
}

export default function MfaChallengePage() {
  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center p-4" style={{ background: '#0E2729' }}>
      <MfaChallenge />
    </div>
  )
}
