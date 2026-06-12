import { notFound } from 'next/navigation'
import { WearablesPreview } from './Preview'

// Dev-only verificatiepagina voor de wearable-dashboards. 404 in productie.
export const dynamic = 'force-dynamic'

export default function DevWearablesPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <WearablesPreview />
}
