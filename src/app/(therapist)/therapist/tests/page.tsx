'use client'

import { useMemo, useState } from 'react'
import { Stethoscope } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import {
  DarkInput,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import {
  BODY_REGIONS,
  BODY_REGION_LABEL,
  CONSTRUCTS,
  CONSTRUCT_COLOR,
  CONSTRUCT_LABEL,
  PHASE_LABEL,
  type ClinicalTestBodyRegion,
  type ClinicalTestConstruct,
} from '@/lib/clinical-tests-meta'

export default function TestsLibraryPage() {
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState<ClinicalTestBodyRegion | 'ALL'>('ALL')
  const [construct, setConstruct] = useState<ClinicalTestConstruct | 'ALL'>('ALL')
  const [phase, setPhase] = useState<number | 'ALL'>('ALL')

  const { data: rawTests, isLoading } = trpc.clinicalTests.list.useQuery(
    {
      bodyRegion: region !== 'ALL' ? [region] : undefined,
      construct: construct !== 'ALL' ? construct : undefined,
      phase: phase !== 'ALL' ? phase : undefined,
      search: search.trim() || undefined,
    },
    { staleTime: 60_000 },
  )
  type TestRow = {
    id: string
    key: string
    name: string
    alternativeNames: string[]
    bodyRegion: ClinicalTestBodyRegion[]
    tags: string[]
    construct: ClinicalTestConstruct
    shortGoal: string
    phases: number[]
    loE: number
    estimatedTimeMin: number | null
  }
  const tests = useMemo<TestRow[]>(() => (rawTests ?? []) as TestRow[], [rawTests])

  const counts = useMemo(() => {
    return tests.reduce<Record<string, number>>((acc, t) => {
      for (const r of t.bodyRegion) acc[r] = (acc[r] ?? 0) + 1
      return acc
    }, {})
  }, [tests])

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <div className="flex flex-col gap-1">
          <Kicker>Bibliotheek</Kicker>
          <Display size="md">TESTS</Display>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            {isLoading ? 'Laden…' : `${tests.length} klinische tests beschikbaar`}
          </MetaLabel>
        </div>

        {/* Search */}
        <DarkInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Zoek op naam, eponym of doel…"
        />

        {/* Body region filter */}
        <div className="space-y-1.5">
          <MetaLabel>Body region</MetaLabel>
          <div className="flex gap-2 flex-wrap">
            <FilterChip
              active={region === 'ALL'}
              onClick={() => setRegion('ALL')}
              label="Alle"
            />
            {BODY_REGIONS.map(r => (
              <FilterChip
                key={r}
                active={region === r}
                onClick={() => setRegion(r)}
                label={`${BODY_REGION_LABEL[r]}${counts[r] ? ` · ${counts[r]}` : ''}`}
              />
            ))}
          </div>
        </div>

        {/* Construct filter */}
        <div className="space-y-1.5">
          <MetaLabel>Construct</MetaLabel>
          <div className="flex gap-2 flex-wrap">
            <FilterChip
              active={construct === 'ALL'}
              onClick={() => setConstruct('ALL')}
              label="Alle"
            />
            {CONSTRUCTS.map(c => (
              <FilterChip
                key={c}
                active={construct === c}
                onClick={() => setConstruct(c)}
                label={CONSTRUCT_LABEL[c]}
                color={CONSTRUCT_COLOR[c]}
              />
            ))}
          </div>
        </div>

        {/* Phase filter */}
        <div className="space-y-1.5">
          <MetaLabel>Fase</MetaLabel>
          <div className="flex gap-2 flex-wrap">
            <FilterChip
              active={phase === 'ALL'}
              onClick={() => setPhase('ALL')}
              label="Alle"
            />
            {[0, 1, 2, 3, 4, 5].map(n => (
              <FilterChip
                key={n}
                active={phase === n}
                onClick={() => setPhase(n)}
                label={n === 0 ? `${PHASE_LABEL[n]}` : `Fase ${n} · ${PHASE_LABEL[n]}`}
              />
            ))}
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
            ))}
          </div>
        ) : tests.length === 0 ? (
          <Tile>
            <div className="py-12 flex flex-col items-center gap-2 text-center">
              <Stethoscope className="w-6 h-6" style={{ color: P.inkDim }} />
              <p style={{ color: P.inkMuted, fontSize: 13 }}>
                Geen tests gevonden met deze filters
              </p>
            </div>
          </Tile>
        ) : (
          <div className="space-y-3">
            {tests.map(test => (
              <TestCard key={test.id} test={test} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="athletic-tap athletic-mono px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
      style={
        active
          ? {
              background: color ?? P.brand,
              color: P.bg,
              border: `1px solid ${color ?? P.brand}`,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }
          : {
              background: P.surfaceHi,
              color: P.inkMuted,
              border: `1px solid ${P.lineStrong}`,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }
      }
    >
      {label}
    </button>
  )
}

function TestCard({
  test,
}: {
  test: {
    key: string
    name: string
    alternativeNames: string[]
    bodyRegion: ClinicalTestBodyRegion[]
    tags: string[]
    construct: ClinicalTestConstruct
    shortGoal: string
    phases: number[]
    loE: number
    estimatedTimeMin: number | null
  }
}) {
  const color = CONSTRUCT_COLOR[test.construct]
  const utils = trpc.useUtils()
  return (
    <Tile
      href={`/therapist/tests/${test.key}`}
      accentBar={color}
      prefetch={() => utils.clinicalTests.byKey.prefetch({ key: test.key })}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="athletic-mono"
              style={{
                background: `${color}22`,
                color,
                fontSize: 10,
                letterSpacing: '0.12em',
                padding: '2px 8px',
                borderRadius: 999,
                fontWeight: 800,
                textTransform: 'uppercase',
              }}
            >
              {CONSTRUCT_LABEL[test.construct]}
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
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {BODY_REGION_LABEL[r]}
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
                  letterSpacing: '0.1em',
                  padding: '2px 6px',
                  borderRadius: 999,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <h3
            className="mt-2"
            style={{
              color: P.ink,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              lineHeight: 1.3,
            }}
          >
            {test.name}
          </h3>
          {test.alternativeNames.length > 0 && (
            <p
              className="athletic-mono"
              style={{ color: P.inkDim, fontSize: 10, marginTop: 2, letterSpacing: '0.04em' }}
            >
              ook: {test.alternativeNames.join(' · ')}
            </p>
          )}
          <p
            style={{ color: P.inkMuted, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}
          >
            {test.shortGoal}
          </p>
          <div
            className="athletic-mono flex items-center gap-3 mt-2 flex-wrap"
            style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.08em' }}
          >
            <span>
              {test.phases.length === 0
                ? 'Screening'
                : test.phases.includes(0)
                  ? `Pre-OK · ${test.phases.filter(p => p > 0).join(',') || '—'}`
                  : `Fase ${test.phases.join(',')}`}
            </span>
            <span>LoE {test.loE}</span>
            {test.estimatedTimeMin != null && <span>{test.estimatedTimeMin} min</span>}
          </div>
        </div>
        <span style={{ color: P.inkMuted, fontSize: 18 }} aria-hidden>
          →
        </span>
      </div>
    </Tile>
  )
}

