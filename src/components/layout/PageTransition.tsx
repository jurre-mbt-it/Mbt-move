'use client'

import { usePathname } from 'next/navigation'

// Builder/form-schermen maken bij de éérste autosave het record server-side aan
// en wisselen de URL stil van `.../new` naar `.../{id}/edit` (via
// history.replaceState). Zonder ingreep zou `key={pathname}` de subtree dan
// remounten — dat gaf de zwarte AppLoader-flash én gooide de net-toegevoegde
// lokale state weg. Door deze create→edit-paren op één stabiele key te mappen
// blijft de subtree staan en verdwijnt de flash.
const STABLE_GROUPS: Array<{ test: RegExp; key: string }> = [
  { test: /^\/therapist\/programs\/(new|[^/]+\/edit)$/, key: 'therapist-program-builder' },
  { test: /^\/therapist\/exercises\/(new|[^/]+\/edit)$/, key: 'therapist-exercise-form' },
  { test: /^\/therapist\/week-planner\/(new|[^/]+\/edit)$/, key: 'therapist-week-planner' },
  { test: /^\/athlete\/exercises\/(new|[^/]+)$/, key: 'athlete-exercise-form' },
]

function transitionKey(pathname: string): string {
  for (const g of STABLE_GROUPS) {
    if (g.test.test(pathname)) return g.key
  }
  return pathname
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div
      key={transitionKey(pathname)}
      className="animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      {children}
    </div>
  )
}
