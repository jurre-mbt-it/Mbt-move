'use client'

/**
 * Recharts-deel van de oefening-voortgang-sheet — eigen bestand zodat
 * recharts via next/dynamic buiten de initiële bundle blijft (zie
 * ExerciseProgressSheet.tsx).
 */
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { P } from '@/components/dark-ui'

const mono =
  'var(--font-mono-athletic)'

export function ExerciseProgressChart({
  points,
  has1Rm,
}: {
  points: Array<{ label: string; kg: number | null; rm: number | null }>
  has1Rm: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="rgba(212,232,230,0.05)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--p-ink-muted)', fontSize: 9, fontFamily: mono }}
          axisLine={{ stroke: 'rgba(212,232,230,0.12)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: 'var(--p-ink-muted)', fontSize: 9, fontFamily: mono }}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{
            background: P.surfaceHi,
            border: `1px solid ${P.lineStrong}`,
            borderRadius: 10,
            fontSize: 12,
            color: P.ink,
          }}
          labelStyle={{ color: P.inkMuted, fontFamily: mono, fontSize: 10 }}
          formatter={(value, name) => [
            `${String(value ?? '—').replace('.', ',')} kg`,
            name === 'kg' ? 'Zwaarste set' : 'Geschatte 1RM',
          ]}
        />
        <Line
          type="monotone"
          dataKey="kg"
          stroke={P.brand}
          strokeWidth={2}
          dot={{ r: 2.5, fill: P.brand, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        {has1Rm && (
          <Line
            type="monotone"
            dataKey="rm"
            stroke={P.ice}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
