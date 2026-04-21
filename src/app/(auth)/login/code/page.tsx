'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PATIENTS } from '@/lib/mock-data'
import Link from 'next/link'
import { ArrowLeft, KeyRound } from 'lucide-react'

export default function AccessCodeLoginPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError('')

    // Normalize: uppercase, strip spaces
    const normalized = code.trim().toUpperCase().replace(/\s/g, '')

    // Look up in mock data
    await new Promise(r => setTimeout(r, 400)) // simulate network
    const patient = PATIENTS.find(p => p.accessCode.replace('-', '') === normalized.replace('-', ''))

    if (!patient) {
      setError('Toegangscode niet herkend. Controleer de code en probeer opnieuw.')
      setLoading(false)
      inputRef.current?.select()
      return
    }

    // In production: exchange code for session via Supabase / API
    // For now: redirect to patient dashboard
    router.push('/patient/dashboard')
  }

  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center p-4" style={{ background: '#0A0E0F' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/Logo.jpg" alt="MBT Gym" className="h-10 w-auto" />
        </div>

        <div className="bg-[#141A1B] rounded-2xl shadow-sm border p-8 space-y-6" style={{ borderColor: '#e4e4e7' }}>
          {/* Icon */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: '#f0fdfa' }}
            >
              <KeyRound className="w-7 h-7" style={{ color: '#4ECDC4' }} />
            </div>
            <h1 className="text-xl font-bold mt-2">Toegangscode invoeren</h1>
            <p className="text-sm text-muted-foreground">
              Voer de code in die je van je therapeut hebt ontvangen.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              ref={inputRef}
              placeholder="bijv. MBT-JV24"
              value={code}
              onChange={e => {
                setCode(e.target.value.toUpperCase())
                setError('')
              }}
              className="text-center font-mono text-lg tracking-widest h-12"
              style={{ borderRadius: '10px' }}
              autoComplete="off"
              autoFocus
              maxLength={12}
            />

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              style={{ background: '#4ECDC4' }}
              disabled={!code.trim() || loading}
            >
              {loading ? 'Controleren...' : 'Inloggen'}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            Heb je een account?{' '}
            <Link href="/login" className="font-medium" style={{ color: '#4ECDC4' }}>
              Inloggen met e-mail
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Terug naar inloggen
          </Link>
        </div>
      </div>
    </div>
  )
}
