import { redirect } from 'next/navigation'

export default function RootPage() {
  // Redirect to login by default.
  // The middleware will handle redirecting authenticated users to their
  // appropriate dashboard based on role.
  redirect('/login')
}
