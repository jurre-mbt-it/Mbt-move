import { notFound } from 'next/navigation'
import { BaseLanding } from '@/components/base-site/BaseLanding'

// TIJDELIJK: alleen om de publieke pagina te bekijken terwijl je ingelogd bent.
// Verwijderen voor de merge. Tot die tijd 404 in productie, zoals /dev/wearables.
export const dynamic = 'force-dynamic'

export default function SitePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <BaseLanding />
}
