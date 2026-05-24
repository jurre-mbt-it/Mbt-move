'use client'

import { use } from 'react'
import { ExternalLink } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import {
  DarkHeader,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import {
  BODY_REGION_LABEL,
  CONSTRUCT_COLOR,
  CONSTRUCT_LABEL,
  PHASE_LABEL,
  pubmedUrl,
  type ClinicalTestBodyRegion,
  type ClinicalTestConstruct,
} from '@/lib/clinical-tests-meta'

export default function ClinicalTestDetailPage({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  const { key } = use(params)
  const { data: test, isLoading } = trpc.clinicalTests.byKey.useQuery({ key })

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg }}>
        <DarkHeader backHref="/therapist/tests" title="LADEN…" />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
          ))}
        </div>
      </div>
    )
  }

  if (!test) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <DarkHeader backHref="/therapist/tests" title="TEST NIET GEVONDEN" />
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Tile>
            <p style={{ color: P.inkMuted, fontSize: 13 }}>
              Deze test bestaat niet in de library.
            </p>
          </Tile>
        </div>
      </div>
    )
  }

  const color = CONSTRUCT_COLOR[test.construct as ClinicalTestConstruct]

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <DarkHeader backHref="/therapist/tests" title="TEST" />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Hero */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="athletic-mono"
              style={{
                background: `${color}22`,
                color,
                fontSize: 10,
                letterSpacing: '0.14em',
                padding: '3px 10px',
                borderRadius: 999,
                fontWeight: 800,
                textTransform: 'uppercase',
              }}
            >
              {CONSTRUCT_LABEL[test.construct as ClinicalTestConstruct]}
            </span>
            {test.bodyRegion.map(r => (
              <span
                key={r}
                className="athletic-mono"
                style={{
                  background: P.surfaceHi,
                  color: P.inkMuted,
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {BODY_REGION_LABEL[r as ClinicalTestBodyRegion]}
              </span>
            ))}
            {test.tags.map(t => (
              <span
                key={t}
                className="athletic-mono"
                style={{
                  background: P.surfaceLow,
                  color: P.inkDim,
                  fontSize: 9,
                  letterSpacing: '0.12em',
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <Kicker>{test.shortGoal}</Kicker>
          <Display size="md">{test.name.toUpperCase()}</Display>
          {test.alternativeNames.length > 0 && (
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.06em' }}
            >
              OOK BEKEND ALS · {test.alternativeNames.join(' · ').toUpperCase()}
            </p>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile label="LoE (Oxford)" value={String(test.loE)} tint={P.lime} />
          <StatTile
            label="Fases"
            value={test.phases.length > 0 ? test.phases.join(', ') : '—'}
            tint={P.ice}
          />
          <StatTile
            label="Tijd (min)"
            value={test.estimatedTimeMin != null ? String(test.estimatedTimeMin) : '—'}
            tint={P.gold}
          />
          <StatTile
            label="Bronnen"
            value={String(test.sourcePmids.length)}
            tint={P.purple}
          />
        </div>

        {/* Execution */}
        <Tile>
          <div className="space-y-2">
            <MetaLabel>Uitvoering</MetaLabel>
            <p style={{ color: P.ink, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {test.execution}
            </p>
          </div>
        </Tile>

        {/* Benchmark */}
        <Tile accentBar={color}>
          <div className="space-y-2">
            <MetaLabel>Cut-off / benchmark</MetaLabel>
            <p style={{ color: P.ink, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {test.benchmark}
            </p>
          </div>
        </Tile>

        {/* Applicable to */}
        {test.applicableTo.length > 0 && (
          <Tile>
            <div className="space-y-2">
              <MetaLabel>Toepasbaar bij</MetaLabel>
              <div className="flex flex-wrap gap-1.5">
                {test.applicableTo.map(a => (
                  <span
                    key={a}
                    className="athletic-mono"
                    style={{
                      background: P.surfaceHi,
                      color: P.ink,
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 6,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </Tile>
        )}

        {/* Phases detail */}
        {test.phases.length > 0 && (
          <Tile>
            <div className="space-y-3">
              <MetaLabel>Fase-context</MetaLabel>
              <ul className="space-y-1.5">
                {test.phases.map(p => (
                  <li
                    key={p}
                    style={{
                      color: P.ink,
                      fontSize: 13,
                      paddingLeft: 12,
                      borderLeft: `2px solid ${P.brand}`,
                    }}
                  >
                    <span
                      className="athletic-mono"
                      style={{
                        color: P.brand,
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: '0.1em',
                        marginRight: 8,
                      }}
                    >
                      FASE {p}
                    </span>
                    {PHASE_LABEL[p] ?? ''}
                  </li>
                ))}
              </ul>
            </div>
          </Tile>
        )}

        {/* Material required */}
        {test.materialRequired.length > 0 && (
          <Tile>
            <div className="space-y-2">
              <MetaLabel>Materiaal</MetaLabel>
              <p style={{ color: P.ink, fontSize: 13 }}>
                {test.materialRequired.join(', ')}
              </p>
            </div>
          </Tile>
        )}

        {/* PubMed sources */}
        {test.sourcePmids.length > 0 && (
          <Tile>
            <div className="space-y-2">
              <MetaLabel>PubMed bronnen</MetaLabel>
              <ul className="space-y-1">
                {test.sourcePmids.map(pmid => (
                  <li key={pmid}>
                    <a
                      href={pubmedUrl(pmid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="athletic-mono athletic-tap inline-flex items-center gap-1.5"
                      style={{
                        color: P.brand,
                        fontSize: 12,
                        letterSpacing: '0.06em',
                      }}
                    >
                      PMID {pmid}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Tile>
        )}
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  tint,
}: {
  label: string
  value: string
  tint: string
}) {
  return (
    <div
      className="rounded-2xl flex flex-col gap-1.5"
      style={{ backgroundColor: P.surface, padding: 14 }}
    >
      <MetaLabel>{label.toUpperCase()}</MetaLabel>
      <span
        className="athletic-display"
        style={{ color: tint, fontSize: 24, lineHeight: '28px', letterSpacing: '-0.02em' }}
      >
        {value}
      </span>
    </div>
  )
}
