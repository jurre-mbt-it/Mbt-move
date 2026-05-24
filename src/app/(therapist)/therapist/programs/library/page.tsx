import { redirect } from 'next/navigation'

/**
 * Legacy route — Schema-bibliotheek is samengevoegd met /therapist/programs
 * onder tabs. Externe links blijven werken via deze server-side redirect.
 */
export default function LegacyLibraryRedirect() {
  redirect('/therapist/programs?tab=templates')
}
