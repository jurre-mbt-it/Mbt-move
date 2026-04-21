import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign In – MBT Move',
}

export default function LoginPage() {
  return (
    <div
      className="athletic-dark min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0A0E0F' }}
    >
      <LoginForm />
    </div>
  )
}
