import { notFound } from 'next/navigation'
import { Preview } from './Preview'

/**
 * Ontwerp-voorvertoning van de zoekbare kiezer binnen een dialoog, zonder
 * database. Nagebouwd naar aanleiding van de melding dat een patiëntnaam in
 * "Nieuw testrapport" niet aan te klikken was. Alleen in development.
 */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Preview />
}
