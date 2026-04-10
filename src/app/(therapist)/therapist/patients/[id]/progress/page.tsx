'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ArrowLeft, Download, TrendingUp, TrendingDown, Activity,
  CheckCircle2, XCircle, Minus, Loader2,
} from 'lucide-react'

// ─── MBT brand ─────────────────────────────────────────────────────────────
const G = '#3ECF6A'   // MBT green
const DARK = '#1A3A3A'

// ─── Mock patient ────────────────────────────────────────────────────────────
const PATIENT = { name: 'Thomas de Vries', program: 'Knie Revalidatie', therapist: 'Fysiotherapie Centrum Amsterdam' }

// ─── Adherence calendar (56 days) ────────────────────────────────────────────
const TODAY = new Date('2026-04-09')
const CALENDAR_DAYS = Array.from({ length: 56 }, (_, i) => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - 55 + i)
  const dow = d.getDay() // 0=Sun
  const isTraining = [1, 2, 4, 5].includes(dow) // Mon Tue Thu Fri
  if (!isTraining) return { date: d, status: 'rest' as const }
  const isCompleted = (i * 13 + 7) % 9 !== 0 // ≈78%
  return { date: d, status: isCompleted ? 'completed' as const : 'missed' as const }
})

const trainingDays = CALENDAR_DAYS.filter(d => d.status !== 'rest')
const completedDays = CALENDAR_DAYS.filter(d => d.status === 'completed')
const adherencePct = Math.round((completedDays.length / trainingDays.length) * 100)

// ─── Exercise mock data (8 weeks) ────────────────────────────────────────────
const WEEKS = ['W1','W2','W3','W4','W5','W6','W7','W8']

const EXERCISES = {
  squat: {
    name: 'Squat',
    color: G,
    muscleScores: { Quadriceps: 5, Hamstrings: 3, Glutes: 4, Kuiten: 1 } as Record<string,number>,
    videoUrl: 'https://mbtmove.nl/exercises/squat',
    sets: 3, reps: 10,
    cues: ['Knieën volgen de tenen', 'Heupen terug en omlaag', 'Borst omhoog houden', 'Volledige range of motion'],
    data: WEEKS.map((week, i) => ({
      week,
      gewicht: 40 + i * 5,
      volume: 3 * 10 * (40 + i * 5),
      rpe: parseFloat((6 + Math.sin(i * 0.9) * 0.5).toFixed(1)),
      gevoel: Math.min(5, Math.max(1, parseFloat((2.8 + i * 0.15 + Math.sin(i) * 0.2).toFixed(1)))),
    })),
  },
  legPress: {
    name: 'Leg Press',
    color: '#60a5fa',
    muscleScores: { Quadriceps: 5, Hamstrings: 2, Glutes: 3, Kuiten: 2 } as Record<string,number>,
    videoUrl: 'https://mbtmove.nl/exercises/leg-press',
    sets: 3, reps: 12,
    cues: ['Voeten schouderbreedte op plaat', 'Knieën niet op slot vergrendelen', '90° buiging in het diepste punt'],
    data: WEEKS.map((week, i) => ({
      week,
      gewicht: 60 + i * 7,
      volume: 3 * 12 * (60 + i * 7),
      rpe: parseFloat((6.5 + Math.cos(i * 0.7) * 0.4).toFixed(1)),
      gevoel: Math.min(5, Math.max(1, parseFloat((3 + i * 0.12 + Math.cos(i) * 0.15).toFixed(1)))),
    })),
  },
  hipAbductor: {
    name: 'Hip Abductor',
    color: '#f59e0b',
    muscleScores: { 'Hip Add.': 5, Glutes: 3 } as Record<string,number>,
    videoUrl: 'https://mbtmove.nl/exercises/hip-abductor',
    sets: 3, reps: 15,
    cues: ['Stabiele romp, geen compensatie', 'Gecontroleerde beweging terug', 'Voet flexie bij abductie'],
    data: WEEKS.map((week, i) => ({
      week,
      gewicht: 15 + i * 2,
      volume: 3 * 15 * (15 + i * 2),
      rpe: parseFloat((5.5 + Math.sin(i * 1.1) * 0.3).toFixed(1)),
      gevoel: Math.min(5, Math.max(1, parseFloat((3.5 + i * 0.1 + Math.sin(i * 0.5) * 0.1).toFixed(1)))),
    })),
  },
  calfRaises: {
    name: 'Calf Raises',
    color: '#a78bfa',
    muscleScores: { Kuiten: 5 } as Record<string,number>,
    videoUrl: 'https://mbtmove.nl/exercises/calf-raises',
    sets: 3, reps: 20,
    cues: ['Volledig omhoog op de teentoppen', 'Langzaam neerwaarts (3 sec)', 'Eén been voor meer uitdaging'],
    data: WEEKS.map((week, i) => ({
      week,
      gewicht: 20 + i * 3,
      volume: 3 * 20 * (20 + i * 3),
      rpe: parseFloat((5 + Math.cos(i * 0.8) * 0.4).toFixed(1)),
      gevoel: Math.min(5, Math.max(1, parseFloat((4 + i * 0.05 + Math.cos(i) * 0.1).toFixed(1)))),
    })),
  },
}

// ─── Muscle group volumes ─────────────────────────────────────────────────────
const MUSCLES = ['Quadriceps','Hamstrings','Glutes','Kuiten','Hip Add.']

function calcMuscleVol(weekIdx: number, muscle: string) {
  return Object.values(EXERCISES).reduce((tot, ex) => {
    const score = ex.muscleScores[muscle] ?? 0
    if (!score) return tot
    const d = ex.data[weekIdx]
    return tot + d.volume * (score / 5)
  }, 0)
}

const MUSCLE_WEEKLY = WEEKS.map((week, i) => {
  const row: Record<string, number | string> = { week }
  MUSCLES.forEach(m => { row[m] = Math.round(calcMuscleVol(i, m)) })
  return row
})

const MUSCLE_COMPARISON = MUSCLES.map(m => {
  const v1 = [0,1,2,3].reduce((s, i) => s + calcMuscleVol(i, m), 0)
  const v2 = [4,5,6,7].reduce((s, i) => s + calcMuscleVol(i, m), 0)
  const change = Math.round(((v2 - v1) / v1) * 100)
  return { name: m, 'W1–4': Math.round(v1), 'W5–8': Math.round(v2), change }
})

// ─── Radar data ───────────────────────────────────────────────────────────────
const RADAR_DATA = [
  { muscle: 'Quadriceps', score: 85, doel: 80 },
  { muscle: 'Hamstrings', score: 62, doel: 75 },
  { muscle: 'Glutes',     score: 70, doel: 75 },
  { muscle: 'Kuiten',     score: 75, doel: 70 },
  { muscle: 'Hip Add.',   score: 58, doel: 70 },
  { muscle: 'Core',       score: 65, doel: 70 },
]

// ─── Feeling scores ───────────────────────────────────────────────────────────
const FEELING_DATA = Array.from({ length: 24 }, (_, i) => ({
  sessie: `S${i + 1}`,
  gevoel: Math.min(5, Math.max(1, parseFloat((2.5 + i * 0.1 + Math.sin(i * 0.7) * 0.3).toFixed(1)))),
  trend: parseFloat((2.5 + i * 0.1).toFixed(1)),
}))

// ─── PROM placeholder ─────────────────────────────────────────────────────────
const PROM_DATA = [
  { moment: 'Meting 1\n(W1)', koos_adl: 45, koos_sport: 32, whoq: 52 },
  { moment: 'Meting 2\n(W3)', koos_adl: 58, koos_sport: 45, whoq: 60 },
  { moment: 'Meting 3\n(W5)', koos_adl: 67, koos_sport: 55, whoq: 65 },
  { moment: 'Meting 4\n(W8)', koos_adl: 72, koos_sport: 63, whoq: 68 },
]

// ─── Pain NRS ─────────────────────────────────────────────────────────────────
const PAIN_LOCATION = WEEKS.map((week, i) => ({
  week,
  Knie:  Math.max(0, parseFloat((6.5 - i * 0.5 + Math.sin(i) * 0.2).toFixed(1))),
  Rug:   Math.max(0, parseFloat((3.5 - i * 0.2 + Math.cos(i) * 0.2).toFixed(1))),
}))

const PAIN_EXERCISE = WEEKS.map((week, i) => ({
  week,
  Squat:         Math.max(0, parseFloat((5   - i * 0.4  + Math.sin(i) * 0.2).toFixed(1))),
  'Leg Press':   Math.max(0, parseFloat((4   - i * 0.35 + Math.cos(i * 0.8) * 0.15).toFixed(1))),
  'Hip Abd.':    Math.max(0, parseFloat((2.5 - i * 0.2  + Math.sin(i * 0.6) * 0.1).toFixed(1))),
  'Calf Raises': Math.max(0, parseFloat((1.5 - i * 0.1  + Math.cos(i) * 0.1).toFixed(1))),
}))

// ─── Summary stats ────────────────────────────────────────────────────────────
const bestMuscle = [...MUSCLE_COMPARISON].sort((a, b) => b.change - a.change)[0]
const initialNRS = PAIN_LOCATION[0].Knie
const currentNRS = PAIN_LOCATION[PAIN_LOCATION.length - 1].Knie
const avgVolChange = Math.round(MUSCLE_COMPARISON.reduce((s, m) => s + m.change, 0) / MUSCLE_COMPARISON.length)

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="bg-white rounded-xl p-4 border" style={{ borderColor: '#e2e8f0' }}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-bold" style={{ color: DARK }}>{value}</span>
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up'      && <TrendingUp  className="w-3.5 h-3.5" style={{ color: G }} />}
          {trend === 'down'    && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
          {trend === 'neutral' && <Minus        className="w-3.5 h-3.5 text-zinc-400" />}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">{children}</h2>
  )
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card style={{ borderRadius: '12px' }} className={className}>
      <CardContent className="p-5">
        <p className="text-sm font-semibold mb-4">{title}</p>
        {children}
      </CardContent>
    </Card>
  )
}

// Adherence heatmap calendar
function AdherenceHeatmap() {
  const firstDate = CALENDAR_DAYS[0].date
  const firstDow = firstDate.getDay()
  const mondayOffset = firstDow === 0 ? 6 : firstDow - 1

  const padded: (typeof CALENDAR_DAYS[0] | null)[] = [
    ...Array(mondayOffset).fill(null),
    ...CALENDAR_DAYS,
  ]
  const rem = padded.length % 7
  if (rem > 0) for (let i = 0; i < 7 - rem; i++) padded.push(null)

  const weekRows: (typeof CALENDAR_DAYS[0] | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weekRows.push(padded.slice(i, i + 7))

  const dayLabels = ['Ma','Di','Wo','Do','Vr','Za','Zo']

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {dayLabels.map(d => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium">{d}</div>
        ))}
      </div>
      {weekRows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-7 gap-1.5 mb-1.5">
          {row.map((day, di) => {
            if (!day) return <div key={di} className="aspect-square rounded-md" />
            const cfg = {
              completed: { bg: '#dcfce7', border: G,       title: 'Voltooid' },
              missed:    { bg: '#fee2e2', border: '#f87171', title: 'Gemist' },
              rest:      { bg: '#f8fafc', border: '#e2e8f0', title: 'Rustdag' },
            }[day.status]
            return (
              <div
                key={di}
                className="aspect-square rounded-md border-2 cursor-default"
                style={{ background: cfg.bg, borderColor: cfg.border }}
                title={`${day.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}: ${cfg.title}`}
              />
            )
          })}
        </div>
      ))}
      <div className="flex items-center gap-4 mt-3">
        {[
          { color: '#dcfce7', border: G,       label: 'Voltooid' },
          { color: '#fee2e2', border: '#f87171', label: 'Gemist' },
          { color: '#f8fafc', border: '#e2e8f0', label: 'Rustdag' },
        ].map(({ color, border, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded border-2" style={{ background: color, borderColor: border }} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Exercise line chart (4-metric)
function ExerciseChart({ ex }: { ex: (typeof EXERCISES)[keyof typeof EXERCISES] }) {
  return (
    <ChartCard title={ex.name}>
      <div className="grid grid-cols-2 gap-4">
        {/* Gewicht */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Gewicht (kg)</p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={ex.data} margin={{ top: 2, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="gewicht" stroke={ex.color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Volume */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Volume (sets × reps × kg)</p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={ex.data} margin={{ top: 2, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="volume" stroke={G} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* RPE */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">RPE (1–10)</p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={ex.data} margin={{ top: 2, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis domain={[4, 10]} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="rpe" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Gevoel */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Gevoel (1–5)</p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={ex.data} margin={{ top: 2, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="gevoel" stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PatientProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [exporting, setExporting] = useState(false)

  async function handleExportPdf() {
    setExporting(true)
    try {
      const QRCode = (await import('qrcode')).default
      const { pdf } = await import('@react-pdf/renderer')
      const { PatientPdfDocument } = await import('@/components/therapist/PatientPdfDoc')

      const qrCodes: Record<string, string> = {}
      for (const [key, ex] of Object.entries(EXERCISES)) {
        qrCodes[key] = await QRCode.toDataURL(ex.videoUrl, { width: 100, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      }

      const blob = await pdf(
        PatientPdfDocument({ patient: PATIENT, exercises: EXERCISES, qrCodes })
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `programma-thomas-de-vries.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF export fout:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/therapist/patients/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Terug naar patiënt
          </Link>
          <h1 className="text-xl font-bold" style={{ color: DARK }}>Progressie — {PATIENT.name}</h1>
          <p className="text-sm text-muted-foreground">{PATIENT.program} · 8 weken data</p>
        </div>
        <Button
          onClick={handleExportPdf}
          disabled={exporting}
          className="gap-2 text-white shrink-0"
          style={{ background: G }}
        >
          {exporting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporteren...</>
            : <><Download className="w-4 h-4" /> PDF exporteren</>
          }
        </Button>
      </div>

      {/* Summary banner */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${DARK} 0%, #0f2a2a 100%)` }}
      >
        <p className="text-xs uppercase tracking-widest font-semibold opacity-60 mb-3">Samenvatting</p>
        <p className="text-lg font-semibold leading-relaxed">
          Patiënt heeft <span style={{ color: G }}>{adherencePct}% adherentie</span>, gemiddeld volume{' '}
          <span style={{ color: G }}>+{avgVolChange}%</span> over 4 weken, NRS gedaald van{' '}
          <span style={{ color: '#f87171' }}>{initialNRS.toFixed(1)}</span> naar{' '}
          <span style={{ color: G }}>{currentNRS.toFixed(1)}</span>, spiergroep{' '}
          <span style={{ color: G }}>{bestMuscle.name} +{bestMuscle.change}%</span>.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Adherentie"    value={`${adherencePct}%`}            sub={`${completedDays.length}/${trainingDays.length} sessies`} trend="up" />
        <StatChip label="Gem. volume ↑" value={`+${avgVolChange}%`}           sub="vs eerste 4 weken"   trend="up" />
        <StatChip label="NRS knie"      value={`${currentNRS.toFixed(1)}`}    sub={`was ${initialNRS.toFixed(1)}`}  trend="down" />
        <StatChip label="Beste spier"   value={`+${bestMuscle.change}%`}      sub={bestMuscle.name}     trend="up" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="adherentie">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="adherentie">Adherentie</TabsTrigger>
          <TabsTrigger value="oefeningen">Oefeningen</TabsTrigger>
          <TabsTrigger value="spiergroepen">Spiergroepen</TabsTrigger>
          <TabsTrigger value="gevoel-pijn">Gevoel & Pijn</TabsTrigger>
          <TabsTrigger value="proms">PROMs</TabsTrigger>
        </TabsList>

        {/* ── TAB: Adherentie ── */}
        <TabsContent value="adherentie" className="space-y-4 mt-4">
          <SectionTitle>Adherentie heatmap — 8 weken</SectionTitle>
          <ChartCard title="Kalenderoverzicht">
            <AdherenceHeatmap />
          </ChartCard>

          <div className="grid grid-cols-3 gap-3">
            <Card style={{ borderRadius: '12px' }}>
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 shrink-0" style={{ color: G }} />
                <div>
                  <p className="text-2xl font-bold">{completedDays.length}</p>
                  <p className="text-xs text-muted-foreground">Voltooide sessies</p>
                </div>
              </CardContent>
            </Card>
            <Card style={{ borderRadius: '12px' }}>
              <CardContent className="p-4 flex items-center gap-3">
                <XCircle className="w-8 h-8 shrink-0 text-red-400" />
                <div>
                  <p className="text-2xl font-bold">{trainingDays.length - completedDays.length}</p>
                  <p className="text-xs text-muted-foreground">Gemiste sessies</p>
                </div>
              </CardContent>
            </Card>
            <Card style={{ borderRadius: '12px' }}>
              <CardContent className="p-4 flex items-center gap-3">
                <Activity className="w-8 h-8 shrink-0" style={{ color: G }} />
                <div>
                  <p className="text-2xl font-bold">{adherencePct}%</p>
                  <p className="text-xs text-muted-foreground">Adherentie totaal</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB: Oefeningen ── */}
        <TabsContent value="oefeningen" className="space-y-4 mt-4">
          <SectionTitle>Volume-load per oefening</SectionTitle>
          {Object.values(EXERCISES).map(ex => (
            <ExerciseChart key={ex.name} ex={ex} />
          ))}
        </TabsContent>

        {/* ── TAB: Spiergroepen ── */}
        <TabsContent value="spiergroepen" className="space-y-4 mt-4">
          <SectionTitle>Gewogen spiergroep-volume (sets × reps × gewicht × score/5)</SectionTitle>

          {/* Bar chart: W1–4 vs W5–8 */}
          <ChartCard title="Volumevergelijking per spiergroep — W1–4 vs W5–8">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={MUSCLE_COMPARISON} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value, name) => [value.toLocaleString('nl-NL'), name === 'W1–4' ? 'Week 1–4' : 'Week 5–8']}
                />
                <Legend formatter={n => n === 'W1–4' ? 'Week 1–4' : 'Week 5–8'} />
                <Bar dataKey="W1–4" fill="#94a3b8" radius={[4,4,0,0]} />
                <Bar dataKey="W5–8" fill={G}       radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* % change labels */}
            <div className="flex flex-wrap gap-2 mt-3">
              {MUSCLE_COMPARISON.map(m => (
                <span
                  key={m.name}
                  className="text-xs px-2 py-1 rounded-full font-semibold"
                  style={{ background: m.change > 0 ? '#dcfce7' : '#fee2e2', color: m.change > 0 ? '#166534' : '#991b1b' }}
                >
                  {m.name} {m.change > 0 ? '+' : ''}{m.change}%
                </span>
              ))}
            </div>
          </ChartCard>

          {/* Weekly trend bars */}
          <ChartCard title="Spiergroep-volume per week (trend)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={MUSCLE_WEEKLY} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend />
                {MUSCLES.map((m, mi) => (
                  <Bar
                    key={m} dataKey={m} stackId="a"
                    fill={[G, '#60a5fa', '#f59e0b', '#a78bfa', '#f87171'][mi]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Radar chart */}
          <ChartCard title="Spiergroep balans — huidig vs doel">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={RADAR_DATA} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="muscle" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar name="Huidig" dataKey="score" fill={G} fillOpacity={0.25} stroke={G} strokeWidth={2} />
                <Radar name="Doel"   dataKey="doel"  fill="transparent" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" />
                <Legend />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">
              Score = relatief volume-aandeel t.o.v. doelstelling (0–100). Hamstrings en Hip Abd. lopen nog achter op het doel.
            </p>
          </ChartCard>
        </TabsContent>

        {/* ── TAB: Gevoel & Pijn ── */}
        <TabsContent value="gevoel-pijn" className="space-y-4 mt-4">
          <SectionTitle>Gevoel & pijn trends</SectionTitle>

          {/* Feeling score per session */}
          <ChartCard title="Gevoel per sessie (1 = slecht, 5 = uitstekend)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={FEELING_DATA} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="sessie" tick={{ fontSize: 10 }} interval={2} />
                <YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="gevoel" name="Gevoel" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="trend"  name="Trend"  stroke={G}       strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Feeling per exercise */}
          <div className="grid grid-cols-2 gap-4">
            {Object.values(EXERCISES).map(ex => (
              <ChartCard key={ex.name} title={`Gevoel — ${ex.name}`}>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={ex.data} margin={{ top: 2, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis domain={[1, 5]} ticks={[1,3,5]} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line type="monotone" dataKey="gevoel" stroke={ex.color} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            ))}
          </div>

          {/* Pain NRS per location */}
          <ChartCard title="Pijn NRS per locatie (0 = geen, 10 = maximaal)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={PAIN_LOCATION} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 10]} ticks={[0,2,4,6,8,10]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="Knie" stroke="#f87171" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Rug"  stroke="#f59e0b" strokeWidth={2}   dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Pain NRS per exercise */}
          <ChartCard title="Pijn NRS per oefening">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={PAIN_EXERCISE} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 8]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="Squat"        stroke="#f87171" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Leg Press"    stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Hip Abd."     stroke="#60a5fa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Calf Raises"  stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        {/* ── TAB: PROMs ── */}
        <TabsContent value="proms" className="space-y-4 mt-4">
          <SectionTitle>PROM score verloop</SectionTitle>

          <div
            className="rounded-xl p-4 border flex items-start gap-3"
            style={{ borderColor: '#fbbf24', background: '#fffbeb' }}
          >
            <span className="text-lg">📋</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Placeholder — PROMs komen in Fase 9</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Onderstaande data is illustratief. Zodra de PROM-module actief is worden hier echte meetmomenten getoond
                (KOOS ADL, KOOS Sport, WHOQOL-BREF, PSK).
              </p>
            </div>
          </div>

          <ChartCard title="KOOS score verloop (0–100, hoger = beter)">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={PROM_DATA} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="moment" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="koos_adl"   name="KOOS ADL"   stroke={G}       strokeWidth={2.5} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="koos_sport" name="KOOS Sport" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="whoq"       name="WHOQOL"     stroke="#a78bfa" strokeWidth={2}   dot={{ r: 4 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'KOOS ADL',   start: 45, end: 72, color: G },
              { label: 'KOOS Sport', start: 32, end: 63, color: '#60a5fa' },
              { label: 'WHOQOL',     start: 52, end: 68, color: '#a78bfa' },
            ].map(({ label, start, end, color }) => (
              <Card key={label} style={{ borderRadius: '12px' }}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold" style={{ color }}>{end}</span>
                    <span className="text-sm text-muted-foreground">/ 100</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">was {start} → +{end - start} punten</p>
                  <div className="mt-2 h-1.5 rounded-full bg-zinc-100">
                    <div className="h-full rounded-full" style={{ width: `${end}%`, background: color }} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
