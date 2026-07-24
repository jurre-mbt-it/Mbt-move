'use client'

/**
 * Recharts-deel van de vitals-tegel — eigen bestand zodat recharts via
 * next/dynamic buiten de initiële bundle blijft (zie VitalsCard.tsx).
 */
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts'

export function VitalsSparkline({
  data,
  stroke,
  domain,
}: {
  data: Array<{ i: number; v: number }>
  stroke: string
  domain: [string, string]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <YAxis hide domain={domain} />
        <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive animationDuration={500} />
      </LineChart>
    </ResponsiveContainer>
  )
}
