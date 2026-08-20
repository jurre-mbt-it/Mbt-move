'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import styles from './base-site.module.css'

/**
 * Laat een blok binnenkomen zodra het in beeld scrollt.
 *
 * Twee dingen bewust zo, allebei uit docs/design-systeem.md van de praktijksite:
 *
 * 1. Het verbergen gebeurt pas ná de mount en zonder React-state. De server
 *    rendert de tekst zichtbaar, dus zonder JavaScript of bij
 *    prefers-reduced-motion staat er nog steeds een leesbare pagina.
 * 2. Er zit een vangnet op. IntersectionObserver levert asynchroon en kan
 *    blokken overslaan bij snel scrollen of een sprong naar een anker. Een blok
 *    dat op opacity:0 blijft hangen is het ergste wat een site kan doen, dus
 *    haalt een timer alles alsnog tevoorschijn.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    el.classList.add(styles.reveal)
    const show = () => el.classList.add(styles.revealIn)

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          show()
          io.unobserve(entry.target)
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)

    const safety = window.setTimeout(show, 2500)
    return () => {
      io.disconnect()
      window.clearTimeout(safety)
    }
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
