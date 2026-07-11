'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { DPA_VERSION } from '@/lib/dpa-constants'
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect'
import {
  DarkButton,
  DarkScreen,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function OnboardingDpaPage() {
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [hasReadAll, setHasReadAll] = useState(false)

  const supabase = createClient()
  const { data: status, isLoading } = trpc.dpa.getStatus.useQuery(undefined, { retry: false })

  const accept = trpc.dpa.accept.useMutation({
    onSuccess: async () => {
      toast.success('Verwerkingsovereenkomst geaccepteerd.')
      const next = await resolvePostLoginRedirect(supabase)
      router.push(next)
      router.refresh()
    },
    onError: (err) => {
      toast.error(err.message || 'Accepteren mislukt. Probeer opnieuw.')
    },
  })

  // Wanneer reeds geaccepteerd: direct doorsturen.
  useEffect(() => {
    if (status?.accepted) {
      resolvePostLoginRedirect(supabase).then((next) => router.replace(next))
    }
  }, [status?.accepted, supabase, router])

  // Detecteer of de hele tekst gescrolld is.
  // Let op: pas koppelen wanneer de inhoud écht gerenderd is (niet tijdens
  // het laad-scherm), anders is bottomRef nog null en wordt de observer
  // nooit gekoppeld → knop blijft permanent disabled.
  useEffect(() => {
    if (isLoading) return
    const sentinel = bottomRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setHasReadAll(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isLoading])

  if (isLoading) {
    return (
      <DarkScreen>
        <div className="flex items-center justify-center min-h-screen">
          <MetaLabel>LADEN…</MetaLabel>
        </div>
      </DarkScreen>
    )
  }

  return (
    <DarkScreen>
      <div className="max-w-2xl w-full mx-auto px-4 pt-10 pb-10 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Verplichte stap · Versie {DPA_VERSION}</Kicker>
          <Display size="md">
            VERWERKINGS-
            <br />
            OVEREENKOMST
          </Display>
          <MetaLabel style={{ marginTop: 8, textTransform: 'none', fontWeight: 500 }}>
            Voor het gebruik van MBT Gym is een verwerkingsovereenkomst (AVG/GDPR) verplicht.
            Lees de samenvatting hieronder en accepteer om door te gaan.
          </MetaLabel>
        </div>

        <Tile>
          <div className="flex flex-col gap-3" style={{ color: P.ink, fontSize: 14, lineHeight: 1.6 }}>
            <p>
              <strong>Verwerkingsverantwoordelijke:</strong> Movement Based Therapy
              (Jacob Bontiusplaats 40, 1018LL Amsterdam).
            </p>
            <p>
              <strong>Welke gegevens:</strong> naam, e-mail, geboortedatum, diagnose en
              klachten, trainingsdata (oefeningen, sets, gewicht), pijn- en RPE-scores,
              PROMs, sessie-aantekeningen.
            </p>
            <p>
              <strong>Doel:</strong> fysiotherapeutische behandeling, voortgangsmonitoring,
              communicatie met je behandelend therapeut, en wettelijke verplichtingen
              (WGBO).
            </p>
            <p>
              <strong>Bewaartermijn:</strong> 20 jaar (medisch dossier conform WGBO).
            </p>
            <p>
              <strong>Jouw rechten:</strong> inzage, correctie, verwijdering, dataportabiliteit,
              en intrekken van toestemming. Klacht? Bel ons of de Autoriteit Persoonsgegevens.
            </p>
            <p>
              <strong>Beveiliging:</strong> versleutelde opslag, toegangscontrole op rol,
              tweetraps-verificatie voor zorgverleners.
            </p>
            <p>
              <strong>Sporthorloge (optioneel):</strong> als je zelf een Apple Watch of
              Strava koppelt, verwerken we ook slaap, hartslag, trainingen en dagelijkse
              activiteit. Dit gebeurt alleen na jouw toestemming per gegevenssoort op je
              eigen toestel, is nooit verplicht voor je behandeling, en je kunt de
              koppeling altijd weer verbreken.
            </p>
            <p>
              De volledige tekst kun je later raadplegen onder je privacy-instellingen.
            </p>
            <div ref={bottomRef} />
          </div>
        </Tile>

        {!hasReadAll && (
          <MetaLabel style={{ color: P.inkDim, textTransform: 'none', fontWeight: 500 }}>
            Scroll naar het einde van de samenvatting om door te kunnen.
          </MetaLabel>
        )}

        <div className="flex flex-col gap-2">
          <DarkButton
            type="button"
            variant="primary"
            size="lg"
            disabled={!hasReadAll || accept.isPending}
            loading={accept.isPending}
            onClick={() => accept.mutate()}
          >
            IK GA AKKOORD MET DE VERWERKINGSOVEREENKOMST
          </DarkButton>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/login')
            }}
            className="athletic-mono self-center"
            style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.14em', marginTop: 8 }}
          >
            NIET AKKOORD · UITLOGGEN
          </button>
        </div>
      </div>
    </DarkScreen>
  )
}
