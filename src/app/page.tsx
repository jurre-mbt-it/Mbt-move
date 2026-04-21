'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    // Check if there are auth tokens in the hash fragment
    const hash = window.location.hash
    if (hash && (hash.includes('access_token') || hash.includes('error'))) {
      // Redirect to callback page with the hash preserved
      window.location.href = '/auth/callback' + hash
      return
    }

    // Check if already logged in
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Get role from DB (more reliable than user_metadata)
        let role = user.user_metadata?.role
        try {
          const res = await fetch('/api/auth/me')
          if (res.ok) {
            const data = await res.json()
            if (data.role) role = data.role
          }
        } catch { /* fallback to metadata role */ }
        if (role === 'PATIENT') router.replace('/patient/dashboard')
        else if (role === 'ATHLETE') router.replace('/athlete/dashboard')
        else router.replace('/therapist/dashboard')
      } else {
        router.replace('/login')
      }
    }
    checkAuth()
  }, [router])

  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center" style={{ background: '#0A0E0F' }}>
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#BEF264', borderTopColor: 'transparent' }} />
    </div>
  )
}
