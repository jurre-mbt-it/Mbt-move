import { notFound } from 'next/navigation'
import { Preview } from './Preview'

/**
 * Ontwerp-voorvertoning van de planner-bloklijst: de echte componenten
 * (dagcel-rijen, zijpaneel-rijen, de "+ Oefening"-pop-up) op voorbeelddata,
 * zonder database. Alleen in development bereikbaar.
 */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Preview />
}
