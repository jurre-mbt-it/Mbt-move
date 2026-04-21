'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Download, CheckCircle2, FileText } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { DPA_VERSION } from '@/lib/dpa-constants'

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

  // Detect when user scrolled to the bottom sentinel
  useEffect(() => {
    const sentinel = bottomRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setHasScrolled(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
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
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5 print:hidden" style={{ background: '#1C2425' }}>
        <Link href="/patient/settings/privacy" className="inline-flex items-center gap-1 text-[#7B8889] text-sm mb-4">
          <ChevronLeft className="w-4 h-4" /> Terug
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-xl font-bold">Verwerkingsovereenkomst</h1>
            <p className="text-[#7B8889] text-xs mt-1">Versie {DPA_VERSION} · {EFFECTIVE_DATE}</p>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-[#7B8889] text-sm mt-1 shrink-0"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
        </div>

        {alreadyAccepted && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#BEF26420' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#BEF264' }} />
            <span className="text-xs text-zinc-300">Geaccepteerd op {acceptedDate}</span>
          </div>
        )}
      </div>

      {/* Document */}
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 text-sm leading-relaxed">

        {/* Print header (only visible in print) */}
        <div className="hidden print:block mb-6">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5" />
            <span className="font-bold text-lg">Verwerkingsovereenkomst</span>
          </div>
          <p className="text-xs text-[#7B8889]">Versie {DPA_VERSION} · Ingangsdatum {EFFECTIVE_DATE}</p>
          <p className="text-xs text-[#7B8889]">{CONTROLLER} · {CONTROLLER_ADDRESS}</p>
          <hr className="mt-3" />
        </div>

        <Section title="1. Verwerkingsverantwoordelijke">
          <p>
            De verwerkingsverantwoordelijke in de zin van de Algemene Verordening Gegevensbescherming
            (AVG / GDPR) is:
          </p>
          <div className="mt-2 p-3 rounded-xl border bg-[#141A1B] space-y-0.5">
            <p className="font-semibold">{CONTROLLER}</p>
            <p className="text-[#7B8889]">{CONTROLLER_ADDRESS}</p>
            <p className="text-[#7B8889]">KVK: {CONTROLLER_KVK}</p>
            <p className="text-[#7B8889]">E-mail: {CONTROLLER_EMAIL}</p>
          </div>
        </Section>

        <Section title="2. Verwerkte persoonsgegevens">
          <p>
            In het kader van uw fysiotherapeutische behandeling verwerken wij de volgende
            categorieën persoonsgegevens:
          </p>
          <ul className="mt-2 space-y-1.5 list-none">
            {[
              'Naam en e-mailadres',
              'Geboortedatum en leeftijd',
              'Diagnose en klachteninformatie',
              'Trainingsdata (oefeningen, sets, herhalingen, gewicht)',
              'Pijnscores en RPE-scores (0–10)',
              'PROMs (Patient-Reported Outcome Measures)',
              'Sessieduur en sessie-aantekeningen',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[#F5F7F6]">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#BEF264' }} />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="3. Doel van de verwerking">
          <p>
            Uw gegevens worden uitsluitend verwerkt voor de volgende doeleinden:
          </p>
          <ul className="mt-2 space-y-1.5">
            {[
              'Het verlenen van fysiotherapeutische behandeling en begeleiding',
              'Monitoring van uw voortgang en herstel',
              'Communicatie tussen u en uw behandelend therapeut',
              'Wettelijke verplichtingen voortvloeiend uit de WGBO',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[#F5F7F6]">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#BEF264' }} />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="4. Rechtsgrond">
          <p>
            De verwerking is gebaseerd op de volgende rechtsgronden (art. 6 AVG):
          </p>
          <ul className="mt-2 space-y-1.5">
            <li className="flex items-start gap-2 text-[#F5F7F6]">
              <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#BEF264' }} />
              <span><strong>Overeenkomst</strong> — uitvoering van de behandelovereenkomst (art. 6 lid 1 sub b AVG)</span>
            </li>
            <li className="flex items-start gap-2 text-[#F5F7F6]">
              <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#BEF264' }} />
              <span><strong>Wettelijke verplichting</strong> — bewaarplicht op grond van de WGBO (art. 6 lid 1 sub c AVG)</span>
            </li>
            <li className="flex items-start gap-2 text-[#F5F7F6]">
              <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#BEF264' }} />
              <span><strong>Gerechtvaardigde belangen</strong> — behandelkwaliteit en veiligheid (art. 6 lid 1 sub f AVG)</span>
            </li>
          </ul>
        </Section>

        <Section title="5. Bewaartermijn">
          <p>
            Op grond van de Wet op de Geneeskundige Behandelingsovereenkomst (WGBO) bewaren wij
            uw dossier gedurende <strong>15 jaar</strong> na het einde van de behandelrelatie,
            of zoveel langer als nodig is voor een goede zorgverlening.
          </p>
          <p className="mt-2 text-[#7B8889]">
            Na het verstrijken van de bewaartermijn worden uw gegevens veilig vernietigd.
          </p>
        </Section>

        <Section title="6. Uw rechten (AVG)">
          <p>Op grond van de AVG heeft u de volgende rechten:</p>
          <div className="mt-2 space-y-2">
            {[
              { right: 'Recht op inzage (art. 15)', desc: 'U heeft het recht uw persoonsgegevens in te zien.' },
              { right: 'Recht op rectificatie (art. 16)', desc: 'Onjuiste gegevens kunt u laten corrigeren.' },
              { right: 'Recht op verwijdering (art. 17)', desc: 'Na afloop van de bewaartermijn kunt u verwijdering verzoeken.' },
              { right: 'Recht op dataportabiliteit (art. 20)', desc: 'U kunt uw gegevens in een machine-leesbaar formaat opvragen.' },
              { right: 'Recht op beperking (art. 18)', desc: 'U kunt verzoeken de verwerking te beperken.' },
              { right: 'Klachtrecht (art. 77)', desc: `U kunt een klacht indienen bij de Autoriteit Persoonsgegevens (${AP_URL}).` },
            ].map(({ right, desc }) => (
              <div key={right} className="p-3 rounded-xl border bg-[#141A1B]">
                <p className="font-semibold text-xs">{right}</p>
                <p className="text-[#7B8889] text-xs mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[#7B8889]">
            Verzoeken kunt u richten aan <a href={`mailto:${CONTROLLER_EMAIL}`} className="underline">{CONTROLLER_EMAIL}</a>.
            Wij reageren binnen 30 dagen.
          </p>
        </Section>

        <Section title="7. Subverwerkers">
          <p>
            Wij maken gebruik van de volgende subverwerkers. Met elke subverwerker is een
            verwerkersovereenkomst gesloten:
          </p>
          <div className="mt-2 space-y-2">
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
          <ul className="mt-2 space-y-1.5">
            {[
              'Versleutelde verbindingen (TLS/HTTPS)',
              'Row-Level Security op databaseniveau',
              'Multi-factor authenticatie voor behandelaars',
              'Minimale toegangsrechten (least privilege)',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[#F5F7F6]">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#BEF264' }} />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="9. Datalekprocedure">
          <p>
            Bij een vermoeden van een datalek kunt u ons direct bereiken via{' '}
            <a href={`mailto:${CONTROLLER_EMAIL}`} className="underline">{CONTROLLER_EMAIL}</a>.
            Wij zijn verplicht datalekken die een risico vormen voor uw rechten en vrijheden binnen
            72 uur te melden bij de Autoriteit Persoonsgegevens.
          </p>
        </Section>

        <Section title="10. Wijzigingen">
          <p>
            Wij kunnen deze verwerkingsovereenkomst van tijd tot tijd aanpassen. Bij wezenlijke
            wijzigingen informeren wij u via de applicatie en vragen wij uw hernieuwde akkoord.
          </p>
        </Section>

        <div className="p-4 rounded-xl border" style={{ background: 'rgba(190,242,100,0.10)', borderColor: '#bbf7d0' }}>
          <p className="text-xs text-[#7B8889]">
            <strong>Versie:</strong> {DPA_VERSION} &nbsp;|&nbsp;
            <strong>Ingangsdatum:</strong> {EFFECTIVE_DATE} &nbsp;|&nbsp;
            <strong>Verwerkingsverantwoordelijke:</strong> {CONTROLLER}
          </p>
        </div>

        {/* Bottom sentinel for scroll detection */}
        <div ref={bottomRef} />

        {/* Accept button — only shown if not yet accepted */}
        {!isLoading && !alreadyAccepted && (
          <div className="sticky bottom-4 print:hidden">
            <Button
              className="w-full text-white font-semibold shadow-lg"
              style={{
                height: 52,
                background: hasScrolled ? '#BEF264' : '#a1a1aa',
                transition: 'background 0.3s',
              }}
              disabled={!hasScrolled || accept.isPending}
              onClick={() => accept.mutate()}
            >
              {!hasScrolled
                ? 'Scroll naar beneden om te accepteren'
                : accept.isPending
                  ? 'Opslaan…'
                  : 'Verwerkingsovereenkomst accepteren'}
            </Button>
          </div>
        )}

        {alreadyAccepted && (
          <div className="flex items-center gap-2 p-3 rounded-xl print:hidden" style={{ background: 'rgba(190,242,100,0.10)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#BEF264' }} />
            <span className="text-sm text-[#7B8889]">
              Geaccepteerd op {acceptedDate} (versie {status?.acceptedVersion})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-bold text-base" style={{ color: '#1C2425' }}>{title}</h2>
      <div className="text-[#F5F7F6] space-y-2">{children}</div>
    </section>
  )
}

function SubprocessorCard({
  name, purpose, location, safeguard,
}: {
  name: string; purpose: string; location: string; safeguard: string
}) {
  return (
    <div className="p-3 rounded-xl border bg-[#141A1B] space-y-0.5">
      <p className="font-semibold text-xs">{name}</p>
      <p className="text-[#7B8889] text-xs">{purpose}</p>
      <div className="flex flex-wrap gap-2 mt-1">
        <Badge variant="outline" className="text-xs px-1.5 py-0">{location}</Badge>
        <Badge variant="outline" className="text-xs px-1.5 py-0">{safeguard}</Badge>
      </div>
    </div>
  )
}
