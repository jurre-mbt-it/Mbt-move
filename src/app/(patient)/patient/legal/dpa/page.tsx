'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { DPA_VERSION } from '@/lib/dpa-constants'
import {
  DarkButton,
  DarkHeader,
  DarkScreen,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

const EFFECTIVE_DATE = '1 april 2025'
const CONTROLLER = 'Movement Based Therapy B.V.'
const CONTROLLER_ADDRESS = 'Herengracht 182, 1016 BR Amsterdam'
const CONTROLLER_KVK = '12345678'
const CONTROLLER_EMAIL = 'privacy@mbt-move.nl'
const AP_URL = 'https://www.autoriteitpersoonsgegevens.nl'

export default function DpaPage() {
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [hasScrolled, setHasScrolled] = useState(false)

  const { data: status, isLoading } = trpc.dpa.getStatus.useQuery(undefined, { retry: false })
  const accept = trpc.dpa.accept.useMutation({
    onSuccess: () => {
      toast.success('Verwerkingsovereenkomst geaccepteerd.')
      router.push('/patient/dashboard')
    },
  })

  useEffect(() => {
    const sentinel = bottomRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setHasScrolled(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  function handlePrint() {
    window.print()
  }

  const alreadyAccepted = status?.accepted
  const acceptedDate = status?.acceptedAt
    ? new Date(status.acceptedAt).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <DarkScreen>
      <DarkHeader
        title="DPA"
        backHref="/patient/settings/privacy"
        right={
          <button
            type="button"
            onClick={handlePrint}
            className="athletic-tap athletic-mono"
            style={{
              color: P.inkMuted,
              fontSize: 11,
              letterSpacing: '0.12em',
              fontWeight: 900,
            }}
          >
            PDF ↓
          </button>
        }
      />

      <div className="max-w-2xl w-full mx-auto px-4 pt-4 pb-8 flex flex-col gap-4">
        {/* Hero */}
        <div className="flex flex-col gap-1 print:hidden">
          <Kicker>Versie {DPA_VERSION} · {EFFECTIVE_DATE}</Kicker>
          <Display size="md">
            VERWERKINGS-
            <br />
            OVEREENKOMST
          </Display>
        </div>

        {alreadyAccepted && (
          <Tile accentBar={P.lime}>
            <div className="flex items-center gap-2">
              <span
                className="athletic-mono"
                style={{ color: P.lime, fontSize: 16, fontWeight: 900 }}
                aria-hidden
              >
                ✓
              </span>
              <span
                className="athletic-mono"
                style={{
                  color: P.lime,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                }}
              >
                GEACCEPTEERD OP {acceptedDate?.toUpperCase()}
              </span>
            </div>
          </Tile>
        )}

        {/* Print header (only visible in print) */}
        <div className="hidden print:block">
          <p className="font-bold text-lg">Verwerkingsovereenkomst</p>
          <p className="text-xs" style={{ color: P.inkMuted }}>
            Versie {DPA_VERSION} · Ingangsdatum {EFFECTIVE_DATE}
          </p>
          <p className="text-xs" style={{ color: P.inkMuted }}>
            {CONTROLLER} · {CONTROLLER_ADDRESS}
          </p>
          <hr className="mt-3" />
        </div>

        <Section title="1. Verwerkingsverantwoordelijke">
          <p>
            De verwerkingsverantwoordelijke in de zin van de Algemene Verordening Gegevensbescherming
            (AVG / GDPR) is:
          </p>
          <div
            className="mt-2 p-3 rounded-xl"
            style={{ backgroundColor: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
          >
            <p style={{ color: P.ink, fontWeight: 700 }}>{CONTROLLER}</p>
            <p style={{ color: P.inkMuted, fontSize: 13 }}>{CONTROLLER_ADDRESS}</p>
            <p style={{ color: P.inkMuted, fontSize: 13 }}>KVK: {CONTROLLER_KVK}</p>
            <p style={{ color: P.inkMuted, fontSize: 13 }}>E-mail: {CONTROLLER_EMAIL}</p>
          </div>
        </Section>

        <Section title="2. Verwerkte persoonsgegevens">
          <p>
            In het kader van uw fysiotherapeutische behandeling verwerken wij de volgende
            categorieën persoonsgegevens:
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 list-none">
            {[
              'Naam en e-mailadres',
              'Geboortedatum en leeftijd',
              'Diagnose en klachteninformatie',
              'Trainingsdata (oefeningen, sets, herhalingen, gewicht)',
              'Pijnscores en RPE-scores (0–10)',
              'PROMs (Patient-Reported Outcome Measures)',
              'Sessieduur en sessie-aantekeningen',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2" style={{ color: P.ink }}>
                <span
                  className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: P.lime }}
                />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="3. Doel van de verwerking">
          <p>Uw gegevens worden uitsluitend verwerkt voor de volgende doeleinden:</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {[
              'Het verlenen van fysiotherapeutische behandeling en begeleiding',
              'Monitoring van uw voortgang en herstel',
              'Communicatie tussen u en uw behandelend therapeut',
              'Wettelijke verplichtingen voortvloeiend uit de WGBO',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2" style={{ color: P.ink }}>
                <span
                  className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: P.lime }}
                />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="4. Rechtsgrond">
          <p>De verwerking is gebaseerd op de volgende rechtsgronden (art. 6 AVG):</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            <li className="flex items-start gap-2" style={{ color: P.ink }}>
              <span
                className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: P.lime }}
              />
              <span>
                <strong>Overeenkomst</strong> — uitvoering van de behandelovereenkomst (art. 6 lid 1
                sub b AVG)
              </span>
            </li>
            <li className="flex items-start gap-2" style={{ color: P.ink }}>
              <span
                className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: P.lime }}
              />
              <span>
                <strong>Wettelijke verplichting</strong> — bewaarplicht op grond van de WGBO (art. 6
                lid 1 sub c AVG)
              </span>
            </li>
            <li className="flex items-start gap-2" style={{ color: P.ink }}>
              <span
                className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: P.lime }}
              />
              <span>
                <strong>Gerechtvaardigde belangen</strong> — behandelkwaliteit en veiligheid (art. 6
                lid 1 sub f AVG)
              </span>
            </li>
          </ul>
        </Section>

        <Section title="5. Bewaartermijn">
          <p>
            Op grond van de Wet op de Geneeskundige Behandelingsovereenkomst (WGBO) bewaren wij uw
            dossier gedurende <strong>15 jaar</strong> na het einde van de behandelrelatie, of
            zoveel langer als nodig is voor een goede zorgverlening.
          </p>
          <p className="mt-2" style={{ color: P.inkMuted }}>
            Na het verstrijken van de bewaartermijn worden uw gegevens veilig vernietigd.
          </p>
        </Section>

        <Section title="6. Uw rechten (AVG)">
          <p>Op grond van de AVG heeft u de volgende rechten:</p>
          <div className="mt-2 flex flex-col gap-2">
            {[
              {
                right: 'Recht op inzage (art. 15)',
                desc: 'U heeft het recht uw persoonsgegevens in te zien.',
              },
              {
                right: 'Recht op rectificatie (art. 16)',
                desc: 'Onjuiste gegevens kunt u laten corrigeren.',
              },
              {
                right: 'Recht op verwijdering (art. 17)',
                desc: 'Na afloop van de bewaartermijn kunt u verwijdering verzoeken.',
              },
              {
                right: 'Recht op dataportabiliteit (art. 20)',
                desc: 'U kunt uw gegevens in een machine-leesbaar formaat opvragen.',
              },
              {
                right: 'Recht op beperking (art. 18)',
                desc: 'U kunt verzoeken de verwerking te beperken.',
              },
              {
                right: 'Klachtrecht (art. 77)',
                desc: `U kunt een klacht indienen bij de Autoriteit Persoonsgegevens (${AP_URL}).`,
              },
            ].map(({ right, desc }) => (
              <div
                key={right}
                className="p-3 rounded-xl"
                style={{ backgroundColor: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
              >
                <p
                  className="athletic-mono"
                  style={{
                    color: P.ink,
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: '0.06em',
                  }}
                >
                  {right.toUpperCase()}
                </p>
                <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>{desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-2" style={{ color: P.inkMuted }}>
            Verzoeken kunt u richten aan{' '}
            <a
              href={`mailto:${CONTROLLER_EMAIL}`}
              className="underline"
              style={{ color: P.lime }}
            >
              {CONTROLLER_EMAIL}
            </a>
            . Wij reageren binnen 30 dagen.
          </p>
        </Section>

        <Section title="7. Subverwerkers">
          <p>
            Wij maken gebruik van de volgende subverwerkers. Met elke subverwerker is een
            verwerkersovereenkomst gesloten:
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <SubprocessorCard
              name="Supabase Inc."
              purpose="Hosting van database en authenticatie"
              location="EU — Frankfurt (AWS eu-central-1)"
              safeguard="Standard Contractual Clauses (SCC)"
            />
            <SubprocessorCard
              name="Resend Inc."
              purpose="Transactionele e-mailverwerking"
              location="VS — SCC van toepassing"
              safeguard="Standard Contractual Clauses (SCC)"
            />
          </div>
        </Section>

        <Section title="8. Beveiliging">
          <p>
            Wij treffen passende technische en organisatorische maatregelen om uw persoonsgegevens
            te beschermen, waaronder:
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {[
              'Versleutelde verbindingen (TLS/HTTPS)',
              'Row-Level Security op databaseniveau',
              'Multi-factor authenticatie voor behandelaars',
              'Minimale toegangsrechten (least privilege)',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2" style={{ color: P.ink }}>
                <span
                  className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: P.lime }}
                />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="9. Datalekprocedure">
          <p>
            Bij een vermoeden van een datalek kunt u ons direct bereiken via{' '}
            <a
              href={`mailto:${CONTROLLER_EMAIL}`}
              className="underline"
              style={{ color: P.lime }}
            >
              {CONTROLLER_EMAIL}
            </a>
            . Wij zijn verplicht datalekken die een risico vormen voor uw rechten en vrijheden
            binnen 72 uur te melden bij de Autoriteit Persoonsgegevens.
          </p>
        </Section>

        <Section title="10. Wijzigingen">
          <p>
            Wij kunnen deze verwerkingsovereenkomst van tijd tot tijd aanpassen. Bij wezenlijke
            wijzigingen informeren wij u via de applicatie en vragen wij uw hernieuwde akkoord.
          </p>
        </Section>

        <Tile accentBar={P.lime}>
          <p style={{ color: P.inkMuted, fontSize: 11, lineHeight: '16px' }}>
            <strong style={{ color: P.ink }}>Versie:</strong> {DPA_VERSION} &nbsp;|&nbsp;
            <strong style={{ color: P.ink }}>Ingangsdatum:</strong> {EFFECTIVE_DATE} &nbsp;|&nbsp;
            <strong style={{ color: P.ink }}>Verwerkingsverantwoordelijke:</strong> {CONTROLLER}
          </p>
        </Tile>

        {/* Bottom sentinel for scroll detection */}
        <div ref={bottomRef} />

        {/* Accept button — only shown if not yet accepted */}
        {!isLoading && !alreadyAccepted && (
          <div className="sticky bottom-4 print:hidden">
            <DarkButton
              size="lg"
              className="w-full"
              style={{
                width: '100%',
                backgroundColor: hasScrolled ? P.lime : P.surfaceHi,
                color: hasScrolled ? P.bg : P.inkMuted,
                transition: 'background 0.3s',
              }}
              disabled={!hasScrolled || accept.isPending}
              onClick={() => accept.mutate()}
            >
              {!hasScrolled
                ? 'SCROLL OM TE ACCEPTEREN'
                : accept.isPending
                  ? 'OPSLAAN…'
                  : 'ACCEPTEREN'}
            </DarkButton>
          </div>
        )}

        {alreadyAccepted && (
          <Tile accentBar={P.lime} className="print:hidden">
            <div className="flex items-center gap-2">
              <span
                className="athletic-mono"
                style={{ color: P.lime, fontSize: 16, fontWeight: 900 }}
                aria-hidden
              >
                ✓
              </span>
              <span style={{ color: P.inkMuted, fontSize: 13 }}>
                Geaccepteerd op {acceptedDate} (versie {status?.acceptedVersion})
              </span>
            </div>
          </Tile>
        )}
      </div>
    </DarkScreen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Tile>
      <div className="flex flex-col gap-2">
        <MetaLabel>{title}</MetaLabel>
        <div style={{ color: P.ink, fontSize: 13, lineHeight: '19px' }} className="flex flex-col gap-2">
          {children}
        </div>
      </div>
    </Tile>
  )
}

function SubprocessorCard({
  name,
  purpose,
  location,
  safeguard,
}: {
  name: string
  purpose: string
  location: string
  safeguard: string
}) {
  return (
    <div
      className="p-3 rounded-xl"
      style={{ backgroundColor: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
    >
      <p
        className="athletic-mono"
        style={{
          color: P.ink,
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '0.06em',
        }}
      >
        {name.toUpperCase()}
      </p>
      <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>{purpose}</p>
      <div className="flex flex-wrap gap-2 mt-2">
        <span
          className="athletic-mono px-2 py-0.5 rounded"
          style={{
            color: P.inkMuted,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            border: `1px solid ${P.lineStrong}`,
          }}
        >
          {location}
        </span>
        <span
          className="athletic-mono px-2 py-0.5 rounded"
          style={{
            color: P.inkMuted,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            border: `1px solid ${P.lineStrong}`,
          }}
        >
          {safeguard}
        </span>
      </div>
    </div>
  )
}
