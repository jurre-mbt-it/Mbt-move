import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Inloggen',
}

export default function LoginPage() {
  return (
    <div
      className="athletic-dark min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0E2729' }}
    >
      <LoginForm />
    </div>
  )
}
