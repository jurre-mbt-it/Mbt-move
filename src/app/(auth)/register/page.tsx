import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata = {
  title: 'Create Account – MBT Gym',
}

export default function RegisterPage() {
  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center p-4" style={{ background: '#0A0E0F' }}>
      <RegisterForm />
    </div>
  )
}
