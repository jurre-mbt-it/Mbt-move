import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign In – MBT Gym',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAFAFA' }}>
      <LoginForm />
    </div>
  )
}
