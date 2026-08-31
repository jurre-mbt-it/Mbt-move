'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Scrollvoortgang van een plakscene: 0 als de wrapper de bovenkant van het
 * venster raakt, 1 als hij eruit scrollt. Zie docs/sensiq-dna.md §2 voor
 * waarom dit het dragende mechanisme van de pagina is.
 *
 * Bij prefers-reduced-motion komt `still: true` terug en blijft progress 0;
 * de CSS zet het plakken dan al uit, de scenes tonen hun eindstand.
 */
export function useSceneProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [progress, setProgress] = useState(0)
  const [still, setStill] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Via rAF, want synchroon setState in een effect geeft cascaderende renders.
      const id = requestAnimationFrame(() => setStill(true))
      return () => cancelAnimationFrame(id)
    }
    let raf: number | null = null
    const measure = () => {
      raf = null
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const travel = rect.height - window.innerHeight
      if (travel <= 0) return
      setProgress(Math.min(Math.max(-rect.top / travel, 0), 1))
    }
    const onScroll = () => {
      // rAF staat stil in een verborgen tab (zelfde valkuil als bij de
      // scramble op de praktijksite): dan zou de scene bevriezen op de stand
      // waarop je de tab verliet. Meet dan direct, zonder throttle.
      if (document.hidden) {
        measure()
        return
      }
      if (raf === null) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  return { ref, progress, still }
}

/** Vertaal voortgang naar stap-index plus voortgang binnen die stap. */
export function stepOf(progress: number, still: boolean, count: number) {
  const scaled = Math.min(progress * count, count - 0.0001)
  const index = still ? 0 : Math.floor(scaled)
  const within = still ? 1 : scaled - index
  return { index, within }
}
