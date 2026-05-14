/**
 * Release notes voor MBT-Gym.
 *
 * - Entries staan in nieuwste-eerst-volgorde.
 * - De `id` is wat we in localStorage opslaan onder `LAST_SEEN_RELEASE_KEY`;
 *   matched dat niet met `releaseNotes[0].id`, dan toont de "wat is nieuw"
 *   popup de nieuwe entry.
 * - Bullets gebruiken markdown-vrij plain text; rendering is in
 *   `/components/system/WhatsNewModal.tsx` + `/therapist/release-notes`.
 */

export interface ReleaseNote {
  id: string          // stable identifier (YYYY-MM-DD-slug)
  date: string        // ISO date, gebruikt voor sorteren / weergave
  title: string
  highlight?: string  // korte 1-zin samenvatting boven de lijst
  items: string[]
}

export const LAST_SEEN_RELEASE_KEY = 'mbt-last-seen-release'

export const releaseNotes: ReleaseNote[] = [
  {
    id: '2026-05-11-live-behandeling-uitbreiding',
    date: '2026-05-11',
    title: 'Live behandeling uitgebreid + sessie achteraf bewerken',
    highlight: 'Meer controle tijdens en na de behandeling: per-set gewichten, extra parameters, supersets, en correcties achteraf.',
    items: [
      'Starttijd van de live behandeling kun je nu aanpassen — handig als je later bent begonnen dan dat je het scherm opende.',
      'Geen hardcoded 3×10 meer: bij vrije workout en quick-add start je met lege velden, bij Volg programma worden de echte programma-parameters (sets, reps, supersets, extra parameters) overgenomen.',
      'Gewicht splitst zich automatisch in één invoerveld per set, zodat je per set een ander gewicht kunt loggen.',
      'Per oefening kun je extra parameters toevoegen: Tempo, RPE, Pauze, Afstand, Hartslag, Moeite, Band kleur — dezelfde set als in de schema-bouwer.',
      'Supersets via A/B/C-labels: koppel oefeningen tijdens de behandeling en zie ze visueel gegroepeerd.',
      'Sessies bewerken na afronden: in het patiëntdossier zit nu een BEWERK-knop op elke gelogde sessie — corrigeer datum, tijd, duur, pijn/RPE, of vergeten parameters.',
      'Release notes pagina: bereikbaar via de sidebar. Bij elke nieuwe release zie je hier wat er is veranderd.',
    ],
  },
]

export function latestRelease(): ReleaseNote | null {
  return releaseNotes[0] ?? null
}
