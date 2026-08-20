import { MfaChallenge } from '@/components/auth/MfaChallenge'

export const metadata = {
  title: 'Tweestapsverificatie',
}

export default function MfaChallengePage() {
  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--p-bg)' }}>
      <MfaChallenge />
    </div>
  )
}
