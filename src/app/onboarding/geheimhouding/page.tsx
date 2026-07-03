'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { GHV_VERSION } from '@/lib/ghv-constants'
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

/**
 * In-app acceptatie van de geheimhoudingsverklaring door therapeuten.
 * Gespiegeld aan /onboarding/dpa (patiënten). De gate zit in require-role.ts:
 * een THERAPIST zonder geaccepteerde huidige versie komt niet voorbij deze
 * pagina. Het getekende papieren exemplaar in het personeelsdossier blijft
 * het primaire juridische stuk; dit is kennisname plus technische afdwinging.
 */
export default function OnboardingGeheimhoudingPage() {
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [hasReadAll, setHasReadAll] = useState(false)

  const supabase = createClient()
  const { data: status, isLoading } = trpc.ghv.getStatus.useQuery(undefined, { retry: false })

  const accept = trpc.ghv.accept.useMutation({
    onSuccess: async () => {
      toast.success('Geheimhoudingsverklaring geaccepteerd.')
      const next = await resolvePostLoginRedirect(supabase)
      router.push(next)
      router.refresh()
    },
    onError: (err) => {
      toast.error(err.message || 'Accepteren mislukt. Probeer opnieuw.')
    },
  })

  // Reeds geaccepteerd: direct doorsturen.
  useEffect(() => {
    if (status?.accepted) {
      resolvePostLoginRedirect(supabase).then((next) => router.replace(next))
    }
  }, [status?.accepted, supabase, router])

  // Zelfde scroll-tot-einde-detectie als de DPA-pagina: observer pas koppelen
  // wanneer de inhoud gerenderd is, anders blijft de knop permanent disabled.
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
          <Kicker>Verplichte stap · Versie {GHV_VERSION}</Kicker>
          <Display size="md">
            GEHEIMHOUDINGS-
            <br />
            VERKLARING
          </Display>
          <MetaLabel style={{ marginTop: 8, textTransform: 'none', fontWeight: 500 }}>
            Je krijgt in dit platform toegang tot patiëntgegevens. Daarvoor geldt een
            geheimhoudingsplicht. Lees de samenvatting hieronder en accepteer om door te gaan.
          </MetaLabel>
        </div>

        <Tile>
          <div className="flex flex-col gap-3" style={{ color: P.ink, fontSize: 14, lineHeight: 1.6 }}>
            <p>
              <strong>Geheimhouding:</strong> alles wat je in het kader van je werk bij
              Movement Based Therapy over patiënten en sporters te weten komt
              (gezondheidsgegevens, dossierinhoud, behandelinformatie) is strikt
              vertrouwelijk, ook na afloop van je dienstverband of opdracht, zonder
              einddatum.
            </p>
            <p>
              <strong>Wettelijk kader:</strong> voor BIG-geregistreerde zorgverleners geldt
              dit aanvullend op het beroepsgeheim (art. 88 Wet BIG en de WGBO); voor
              niet-BIG-medewerkers is de geheimhouding contractueel en gebaseerd op de
              AVG (verwerking onder gezag van de verwerkingsverantwoordelijke).
            </p>
            <p>
              <strong>Gedragsregels:</strong> je gebruikt dossier-toegang alleen binnen een
              actieve behandelrelatie of toegewezen rol; je logt altijd in met je eigen
              account en deelt nooit inloggegevens of MFA-codes; je kopieert of exporteert
              geen patiëntgegevens buiten het platform; en je meldt een (vermoed) datalek
              of misbruik van toegang binnen 24 uur aan Jurre Kok.
            </p>
            <p>
              <strong>Sancties:</strong> schending kan leiden tot beëindiging van de
              arbeids- of opdrachtrelatie, aansprakelijkstelling, voor BIG-geregistreerden
              tucht- of strafrechtelijke vervolging, en een direct opeisbare boete van
              € 5.000 per overtreding.
            </p>
            <p>
              Deze in-app-acceptatie geldt als bewijs van kennisname en aanvaarding. De
              volledige verklaring onderteken je daarnaast op papier; die wordt bewaard in
              het personeelsdossier van de praktijk.
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
            IK GA AKKOORD MET DE GEHEIMHOUDINGSVERKLARING
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
