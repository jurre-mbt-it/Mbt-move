import type { Metadata } from 'next'
import { PrivacyStatement } from '@/components/base-site/PrivacyStatement'

/**
 * Privacyverklaring van BASE op getbase.coach/privacy. Publiek, ook bereikbaar
 * als je ingelogd bent (geen redirect naar het dashboard, anders kun je hem
 * vanuit de app-instellingen niet openen). De tekst zelf staat in
 * PrivacyStatement.tsx; daar staat ook hoe je hem bijhoudt.
 */
export const metadata: Metadata = {
  title: 'Privacyverklaring',
  description:
    'Welke gegevens BASE verwerkt, waarom, wie ze ziet en wat je zelf in de app regelt. De privacyverklaring van het platform van Movement Based Therapy.',
}

export default function PrivacyPage() {
  return <PrivacyStatement />
}
