'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronLeft, ShieldCheck, CheckCircle2, AlertTriangle, FileText, ExternalLink } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'

export default function PrivacySettingsPage() {
  const router = useRouter()
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)

  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.research.getConsentStatus.useQuery()

  const setConsent = trpc.research.setConsent.useMutation({
    onSuccess: (result) => {
      utils.research.getConsentStatus.invalidate()
      if (result.consentGiven) {
        toast.success('Toestemming gegeven. Bedankt voor je bijdrage!')
      } else {
        toast.success('Toestemming ingetrokken. Je data is verwijderd.')
      }
    },
    onError: () => toast.error('Er is iets misgegaan. Probeer opnieuw.'),
  })

  function handleToggle(checked: boolean) {
    if (!checked) {
      setShowWithdrawDialog(true)
    } else {
      setConsent.mutate({ consentGiven: true })
    }
  }

  function confirmWithdraw() {
    setShowWithdrawDialog(false)
    setConsent.mutate({ consentGiven: false })
  }

  const consentGiven = data?.consentGiven ?? false
  const consentDate = data?.consentGivenAt
    ? new Date(data.consentGivenAt).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-6" style={{ background: '#1A3A3A' }}>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-zinc-400 text-sm mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Terug
        </button>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#4ECDC420' }}
          >
            <ShieldCheck className="w-5 h-5" style={{ color: '#4ECDC4' }} />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Privacy & onderzoek</h1>
            <p className="text-zinc-400 text-sm">Beheer je gegevensdeling</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 pb-6 space-y-4">
        {/* Consent toggle card */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="font-semibold text-sm">Geanonimiseerde data delen</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sta Movement Based Therapy toe om je trainingsdata anoniem te gebruiken voor onderzoek.
                </p>
                {!isLoading && (
                  <div className="mt-2 flex items-center gap-2">
                    {consentGiven ? (
                      <>
                        <Badge
                          className="text-xs px-2 py-0.5 font-medium"
                          style={{ background: '#f0fdfa', color: '#0f766e', border: 'none' }}
                        >
                          Toestemming gegeven
                        </Badge>
                        {consentDate && (
                          <span className="text-xs text-muted-foreground">op {consentDate}</span>
                        )}
                      </>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs px-2 py-0.5 font-medium text-zinc-500"
                      >
                        Geen toestemming
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <Switch
                checked={consentGiven}
                onCheckedChange={handleToggle}
                disabled={isLoading || setConsent.isPending}
              />
            </div>
          </CardContent>
        </Card>

        {/* What's collected */}
        <Card style={{ borderRadius: '14px' }}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Wat wordt er verzameld?</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2.5">
            {[
              { text: 'Trainingsgegevens (oefeningen, sets, herhalingen)', included: true },
              { text: 'Demografisch (leeftijd, diagnose categorie)', included: true },
              { text: 'Sessie-informatie (duur, pijnniveau, RPE)', included: true },
              { text: 'Je naam of e-mailadres', included: false },
              { text: 'Contactgegevens of persoonlijke informatie', included: false },
              { text: 'Identificeerbare gegevens', included: false },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center mt-0.5 shrink-0 text-xs font-bold"
                  style={
                    item.included
                      ? { background: '#f0fdfa', color: '#0f766e' }
                      : { background: '#fef2f2', color: '#dc2626' }
                  }
                >
                  {item.included ? '✓' : '✕'}
                </div>
                <span className={item.included ? 'text-zinc-700' : 'text-zinc-400 line-through'}>
                  {item.text}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* GDPR info */}
        <Card style={{ borderRadius: '14px' }}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Je rechten (AVG/GDPR)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {[
              'Je kunt toestemming op elk moment intrekken',
              'Bij intrekken worden ALLE anonieme records direct verwijderd',
              'De koppeling tussen jou en je anonieme ID wordt ook gewist',
              'Data is nooit herleidbaar naar jou als persoon',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-zinc-600">
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: '#4ECDC4' }}
                />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* DPA link */}
        <Link href="/patient/legal/dpa">
          <Card style={{ borderRadius: '14px' }} className="hover:shadow-sm transition-shadow">
            <CardContent className="px-4 py-4 flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: '#eff6ff' }}
              >
                <FileText className="w-5 h-5" style={{ color: '#3b82f6' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Verwerkingsovereenkomst</p>
                <p className="text-xs text-muted-foreground">Bekijk hoe wij uw persoonsgegevens verwerken (AVG)</p>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />
            </CardContent>
          </Card>
        </Link>

        {/* Withdraw button (only shown when consent is given) */}
        {consentGiven && (
          <Button
            variant="outline"
            className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setShowWithdrawDialog(true)}
            disabled={setConsent.isPending}
          >
            <AlertTriangle className="w-4 h-4" />
            Toestemming intrekken en data verwijderen
          </Button>
        )}
      </div>

      {/* Confirm withdraw dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent style={{ borderRadius: '16px' }}>
          <DialogHeader>
            <DialogTitle>Toestemming intrekken?</DialogTitle>
            <DialogDescription>
              Al je geanonimiseerde trainingsdata wordt direct en permanent verwijderd. Dit kan niet
              ongedaan worden gemaakt. Je trainingen en voortgang in de app blijven gewoon
              beschikbaar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWithdrawDialog(false)}>
              Annuleren
            </Button>
            <Button
              onClick={confirmWithdraw}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Ja, verwijder mijn data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
