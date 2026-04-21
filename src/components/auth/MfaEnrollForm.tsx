'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

interface FactorData {
  id: string
  totp: {
    qr_code: string
    secret: string
    uri: string
  }
}

export function MfaEnrollForm() {
  const router = useRouter()
  const [factorData, setFactorData] = useState<FactorData | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function enrollMfa() {
      try {
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'MBT Gym Authenticator',
        })

        if (error) {
          setError(error.message)
          return
        }

        setFactorData(data as unknown as FactorData)
      } catch {
        setError('Failed to initialize MFA enrollment.')
      } finally {
        setEnrolling(false)
      }
    }

    enrollMfa()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorData) return

    setLoading(true)
    setError(null)

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factorData.id,
      })

      if (challengeError) {
        setError(challengeError.message)
        return
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factorData.id,
        challengeId: challengeData.id,
        code: verifyCode,
      })

      if (verifyError) {
        setError(verifyError.message)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Verification failed. Please check your code and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (enrolling) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Setting up MFA...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md shadow-lg" style={{ borderRadius: '12px' }}>
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Enable 2-Factor Auth</CardTitle>
        <CardDescription>
          Scan the QR code with your authenticator app, then enter the verification code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {factorData && (
          <div className="flex justify-center">
            <Image
              src={factorData.totp.qr_code}
              alt="MFA QR Code"
              width={200}
              height={200}
              className="border rounded-lg p-2"
            />
          </div>
        )}

        {factorData && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground text-center">Manual entry code:</p>
            <code className="block text-center text-sm font-mono bg-muted px-3 py-2 rounded break-all">
              {factorData.totp.secret}
            </code>
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Verification Code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              required
              disabled={loading}
              className="text-center text-lg tracking-widest"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full"
            style={{ background: '#BEF264' }}
            disabled={loading || verifyCode.length !== 6}
          >
            {loading ? 'Verifying…' : 'Enable 2FA'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
