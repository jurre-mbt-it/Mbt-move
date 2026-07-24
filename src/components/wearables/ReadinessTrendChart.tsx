'use client'

/**
 * Recharts-deel van de readiness-tegel — eigen bestand zodat recharts via
 * next/dynamic buiten de initiële bundle blijft (zie ReadinessCard.tsx).
 */
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts'

export function ReadinessTrendChart({
  trend,
  color,
}: {
  trend: Array<{ date: string; score: number }>
  color: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={trend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="readinessTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[0, 100]} />
        <Area
          type="monotone" dataKey="score" stroke={color} strokeWidth={2}
          fill="url(#readinessTrend)" isAnimationActive animationDuration={600}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
