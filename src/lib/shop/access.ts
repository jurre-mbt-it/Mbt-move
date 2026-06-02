import 'server-only'
import { notFound } from 'next/navigation'
import { getServerUser } from '@/lib/auth/require-role'

/**
 * Of de publieke shop voor iedereen open staat. Tot de launch laten we deze
 * env-flag uit; dan is de storefront alleen zichtbaar voor een ingelogde admin
 * (Jurre). Zet `SHOP_PUBLIC=true` (env) om de shop publiek te maken.
 */
export function isShopPublic(): boolean {
  return process.env.SHOP_PUBLIC === 'true'
}

/**
 * Toegangspoort voor de (shop) routegroep.
 *  - SHOP_PUBLIC=true         → iedereen mag erin (ook anoniem). isPreview=false.
 *  - anders, ingelogde ADMIN  → mag erin als preview. isPreview=true.
 *  - anders                   → notFound() (404 — verraadt niet dat de pagina bestaat).
 *
 * Server-only; gebruik in (shop)/layout.tsx.
 */
export async function gateShopPreview(): Promise<{ isPreview: boolean }> {
  if (isShopPublic()) return { isPreview: false }
  const user = await getServerUser()
  if (!user || user.role !== 'ADMIN') notFound()
  return { isPreview: true }
}
