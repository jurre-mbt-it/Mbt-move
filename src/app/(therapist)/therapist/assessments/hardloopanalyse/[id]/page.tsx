/**
 * Hardloopanalyse — editor.
 * Vast standaardformulier: achteraanzicht-scores (0-100), zijaanzicht-hoeken,
 * loopmetrics, AI-concept voor opmerkingen + vervolg, en open PDF.
 */
'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { IconSparkle } from '@/components/icons'
import { DarkButton, DarkInput, DarkSelect, DarkTextarea, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { METRICS } from '@/lib/running-analysis/catalog'
import {
  rearZone,
  sideStatus,
  REAR_ZONE_LABEL,
  SIDE_STATUS_LABEL,
  ZONE_COLOR,
  formatNumber,
} from '@/lib/running-analysis/compute'
import type { RunningAnalysisItem } from '@prisma/client'

const numOrNull = (s: string): number | null => {
  if (s.trim() === '') return null
  const n = Number(s.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}
const str = (n: number | null | undefined) => (n == null ? '' : String(n))

export default function HardloopanalyseEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const utils = trpc.useUtils()

  const { data: analysis, isLoading } = trpc.runningAnalysis.get.useQuery({ id })
  const refetch = () => utils.runningAnalysis.get.invalidate({ id })

  const [meta, setMeta] = useState({
    performedAt: '',
    goal: '',
    location: '',
    cadence: '',
    strideLength: '',
    stepLength: '',
    groundContact: '',
    flightTime: '',
    dutyFactor: '',
    therapistComments: '',
    nextMoment: '',
  })
  // Opmerking per loopmetric (key = METRICS[].key) — zodat je ook bij de
  // metrics per test kunt duiden, niet alleen onderaan.
  const [metricComments, setMetricComments] = useState<Record<string, string>>({})
  const [advice, setAdvice] = useState<Array<{ title: string; body: string }>>([])
  const [loadedId, setLoadedId] = useState<string | null>(null)

  useEffect(() => {
    if (!analysis || loadedId === analysis.id) return
    setMeta({
      performedAt: new Date(analysis.performedAt).toISOString().slice(0, 10),
      goal: analysis.goal ?? '',
      location: analysis.location ?? '',
      cadence: str(analysis.cadence),
      strideLength: str(analysis.strideLength),
      stepLength: str(analysis.stepLength),
      groundContact: str(analysis.groundContact),
      flightTime: str(analysis.flightTime),
      dutyFactor: str(analysis.dutyFactor),
      therapistComments: analysis.therapistComments ?? '',
      nextMoment: analysis.nextMoment ?? '',
    })
    setMetricComments(analysis.metricComments ?? {})
    setAdvice(analysis.advice.map((a) => ({ title: a.title, body: a.body })))
    setLoadedId(analysis.id)
  }, [analysis, loadedId])

  const updateMeta = trpc.runningAnalysis.updateMeta.useMutation({
    onSuccess: () => toast.success('Opgeslagen'),
    onError: (e) => toast.error(e.message),
  })
  const setAdviceM = trpc.runningAnalysis.setAdvice.useMutation()
  const aiDraft = trpc.runningAnalysis.aiDraft.useMutation({
    onSuccess: (d) => {
      setMeta((m) => ({ ...m, therapistComments: d.comments, nextMoment: d.nextMoment }))
      setAdvice(d.advice)
      toast.success('AI-concept ingevuld — controleer en sla op')
    },
    onError: (e) => toast.error(e.message),
  })
  const del = trpc.runningAnalysis.delete.useMutation({
    onSuccess: () => { toast.success('Analyse verwijderd'); router.push('/therapist/assessments/hardloopanalyse') },
    onError: (e) => toast.error(e.message),
  })

  const saveMeta = (status?: 'DRAFT' | 'FINAL') => {
    updateMeta.mutate({
      id,
      performedAt: meta.performedAt || undefined,
      goal: meta.goal || null,
      location: meta.location || null,
      cadence: numOrNull(meta.cadence),
      strideLength: numOrNull(meta.strideLength),
      stepLength: numOrNull(meta.stepLength),
      groundContact: numOrNull(meta.groundContact),
      flightTime: numOrNull(meta.flightTime),
      dutyFactor: numOrNull(meta.dutyFactor),
      therapistComments: meta.therapistComments || null,
      nextMoment: meta.nextMoment || null,
      // Lege opmerkingen niet bewaren; null = alle metric-opmerkingen wissen.
      metricComments: (() => {
        const filled = Object.fromEntries(
          Object.entries(metricComments).filter(([, v]) => v.trim()),
        )
        return Object.keys(filled).length > 0 ? filled : null
      })(),
      ...(status ? { status } : {}),
    })
    setAdviceM.mutate({ analysisId: id, advice: advice.filter((a) => a.title.trim() || a.body.trim()) })
  }

  if (isLoading || !analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>LADEN…</span>
      </div>
    )
  }

  const patientName = analysis.patient.name ?? analysis.patient.email
  const rearItems = analysis.items.filter((i) => i.section === 'REAR')
  const sideItems = analysis.items.filter((i) => i.section === 'SIDE')

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-32 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link href="/therapist/assessments/hardloopanalyse" className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
              ← HARDLOOPANALYSES
            </Link>
            <Kicker>Hardloopanalyse · {patientName}</Kicker>
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
              {analysis.status === 'FINAL' ? 'definitief' : 'concept'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <DarkButton variant="ghost" size="sm" onClick={() => window.open(`/print/hardloopanalyse/${id}`, '_blank', 'noopener')}>Open PDF</DarkButton>
            <DarkButton variant="primary" size="sm" onClick={() => saveMeta()}>Opslaan</DarkButton>
          </div>
        </div>

        {/* Kopgegevens */}
        <Tile>
          <MetaLabel>Kopgegevens</MetaLabel>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Labeled label="Analysedatum"><DarkInput type="date" value={meta.performedAt} onChange={(e) => setMeta({ ...meta, performedAt: e.target.value })} /></Labeled>
            <Labeled label="Locatie"><DarkInput value={meta.location} onChange={(e) => setMeta({ ...meta, location: e.target.value })} placeholder="Houthavens" /></Labeled>
            <Labeled label="Doel" full><DarkInput value={meta.goal} onChange={(e) => setMeta({ ...meta, goal: e.target.value })} placeholder="Blessurevrij 10 km" /></Labeled>
          </div>
        </Tile>

        {/* Achteraanzicht */}
        <Tile>
          <MetaLabel>01 · Achteraanzicht — score 0–100</MetaLabel>
          <div className="space-y-2 mt-2">
            {rearItems.map((it) => <RearRow key={it.id} item={it} onChanged={refetch} />)}
          </div>
        </Tile>

        {/* Zijaanzicht */}
        <Tile>
          <MetaLabel>02 · Zijaanzicht — hoek in °</MetaLabel>
          <div className="space-y-2 mt-2">
            {sideItems.map((it) => <SideRow key={it.id} item={it} onChanged={refetch} />)}
          </div>
        </Tile>

        {/* Loopmetrics — waarde + opmerking per metric */}
        <Tile>
          <MetaLabel>03 · Loopmetrics</MetaLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {METRICS.map((m) => (
              <div key={m.key} className="flex gap-2 items-start">
                <div style={{ flex: '0 0 96px' }}>
                  <MetaLabel>{m.label} ({m.unit})</MetaLabel>
                  <div className="mt-1">
                    <DarkInput
                      type="number"
                      value={meta[m.key]}
                      onChange={(e) => setMeta({ ...meta, [m.key]: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <MetaLabel>Opmerking</MetaLabel>
                  <div className="mt-1">
                    <DarkInput
                      value={metricComments[m.key] ?? ''}
                      onChange={(e) => setMetricComments((c) => ({ ...c, [m.key]: e.target.value }))}
                      placeholder="bv. te laag t.o.v. cadans-doel"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Tile>

        {/* Slottekst */}
        <Tile>
          <div className="flex items-center justify-between gap-2">
            <MetaLabel>Opmerkingen therapeut & vervolg</MetaLabel>
            <DarkButton variant="ghost" size="sm" disabled={aiDraft.isPending} onClick={() => aiDraft.mutate({ id })}>
              {aiDraft.isPending ? 'AI schrijft…' : <span className="inline-flex items-center gap-1.5"><IconSparkle size={14} /> AI-concept</span>}
            </DarkButton>
          </div>
          <div className="mt-3 space-y-3">
            <Labeled label="Opmerkingen therapeut" full>
              <DarkTextarea rows={6} value={meta.therapistComments} onChange={(e) => setMeta({ ...meta, therapistComments: e.target.value })} />
            </Labeled>
            <div>
              <MetaLabel>Vervolg</MetaLabel>
              <div className="space-y-2 mt-2">
                {advice.map((a, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <DarkInput value={a.title} placeholder="Aanhef (vet), bv Cadansdrills" onChange={(e) => setAdvice(advice.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                      <DarkTextarea rows={2} value={a.body} placeholder="Toelichting…" onChange={(e) => setAdvice(advice.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                    </div>
                    <DarkButton variant="ghost" size="sm" onClick={() => setAdvice(advice.filter((_, j) => j !== i))}>✕</DarkButton>
                  </div>
                ))}
                <DarkButton variant="ghost" size="sm" onClick={() => setAdvice([...advice, { title: '', body: '' }])}>+ Vervolg-punt</DarkButton>
              </div>
            </div>
            <Labeled label="Volgend analysemoment" full>
              <DarkInput value={meta.nextMoment} onChange={(e) => setMeta({ ...meta, nextMoment: e.target.value })} placeholder="Over 6 weken · medio juli 2026" />
            </Labeled>
          </div>
        </Tile>

        {/* Acties */}
        <Tile>
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex gap-2 flex-wrap">
              <DarkButton variant="primary" size="sm" onClick={() => saveMeta()}>Opslaan</DarkButton>
              <DarkButton size="sm" onClick={() => saveMeta(analysis.status === 'FINAL' ? 'DRAFT' : 'FINAL')}>
                {analysis.status === 'FINAL' ? 'Terug naar concept' : 'Markeer definitief'}
              </DarkButton>
            </div>
            <DarkButton variant="ghost" size="sm" onClick={() => { if (window.confirm('Deze analyse verwijderen?')) del.mutate({ id }) }}>Verwijderen</DarkButton>
          </div>
        </Tile>
      </div>
    </div>
  )
}

function Labeled({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <MetaLabel>{label}</MetaLabel>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function RearRow({ item, onChanged }: { item: RunningAnalysisItem; onChanged: () => void }) {
  const [value, setValue] = useState(str(item.value))
  const [comment, setComment] = useState(item.comment ?? '')
  const update = trpc.runningAnalysis.updateItem.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) })
  const save = () => update.mutate({ id: item.id, value: numOrNull(value), comment: comment || null })
  const zone = rearZone(numOrNull(value))
  return (
    <div className="flex gap-2 items-center" style={{ borderLeft: `3px solid ${zone ? ZONE_COLOR[zone] : P.line}`, paddingLeft: 8 }}>
      <div style={{ flex: '0 0 30%' }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: P.ink }}>{item.label}</p>
        {zone && <p className="athletic-mono" style={{ fontSize: 8, color: ZONE_COLOR[zone], letterSpacing: '0.1em' }}>{REAR_ZONE_LABEL[zone]}</p>}
      </div>
      <div style={{ width: 80 }}>
        <DarkInput type="number" value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} placeholder="0–100" />
      </div>
      <div className="flex-1">
        <DarkInput value={comment} onChange={(e) => setComment(e.target.value)} onBlur={save} placeholder="omschrijving" />
      </div>
    </div>
  )
}

function SideRow({ item, onChanged }: { item: RunningAnalysisItem; onChanged: () => void }) {
  const [value, setValue] = useState(str(item.value))
  const [comment, setComment] = useState(item.comment ?? '')
  const update = trpc.runningAnalysis.updateItem.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) })
  const save = () => update.mutate({ id: item.id, value: numOrNull(value), comment: comment || null })
  const range = { idealMin: item.idealMin ?? 0, idealMax: item.idealMax ?? 0, axisMin: item.axisMin ?? 0, axisMax: item.axisMax ?? 100 }
  const zone = sideStatus(numOrNull(value), range)
  return (
    <div style={{ borderLeft: `3px solid ${zone ? ZONE_COLOR[zone] : P.line}`, paddingLeft: 8 }}>
      <div className="flex gap-2 items-center">
        <div style={{ flex: '0 0 30%' }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: P.ink }}>{item.label}</p>
          <p className="athletic-mono" style={{ fontSize: 8, color: P.inkMuted, letterSpacing: '0.08em' }}>
            ideaal {formatNumber(item.idealMin)}{item.unit} tot {formatNumber(item.idealMax)}{item.unit}
            {zone ? ` · ${SIDE_STATUS_LABEL[zone]}` : ''}
          </p>
        </div>
        <div style={{ width: 80 }}>
          <DarkInput type="number" value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} placeholder={item.unit ?? '°'} />
        </div>
        <div className="flex-1">
          <DarkInput value={comment} onChange={(e) => setComment(e.target.value)} onBlur={save} placeholder="opmerking" />
        </div>
      </div>
    </div>
  )
}
