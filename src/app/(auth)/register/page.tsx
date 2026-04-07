import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata = {
  title: 'Create Account – MBT Move',
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAFAFA' }}>
      <RegisterForm />
    </div>
  )
}
