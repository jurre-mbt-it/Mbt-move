'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import styles from './base-site.module.css'

/**
 * Laat een blok binnenkomen zodra het in beeld scrollt.
 *
 * Het verbergen gebeurt pas ná de mount en zonder React-state: de server rendert
 * de tekst gewoon zichtbaar. Zonder JavaScript, met een oude browser of bij
 * `prefers-reduced-motion` staat er dus nog steeds een leesbare pagina in plaats
 * van een scherm vol onzichtbare blokken.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    el.classList.add(styles.reveal)
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add(styles.revealIn)
          io.unobserve(entry.target)
        }
      },
      { threshold: 0.12 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
