import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign In – MBT Move',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0A0A0A' }}>
      <LoginForm />
    </div>
  )
}
