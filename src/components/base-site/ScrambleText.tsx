'use client'

import { useCallback, useEffect, useRef } from 'react'
import styles from './base-site.module.css'

/**
 * Scramble-label uit het ontwerpsysteem van movementbasedtherapy.nl
 * (docs/design-systeem.md, sectie 3). De letters flikkeren door willekeurige
 * tekens en klikken van links naar rechts vast: letter t van n staat stil zodra
 * de voortgang t/n passeert. Tekenset en duur zijn de waarden van de referentie.
 *
 * Twee triggers, net als daar: bij hover en één keer zodra het label in beeld
 * scrollt.
 *
 * De losse letters staan aria-hidden en het element draagt een aria-label,
 * zodat een screenreader "voor wie" leest en niet de willekeurige tekens.
 * Monospace is hier geen smaak maar noodzaak: bij een proportionele letter
 * danst de tekst per frame heen en weer.
 */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+/'
const DURATION = 520

export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number | null>(null)
  const settleRef = useRef<number | null>(null)
  const chars = text.split('')

  const run = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const spans = Array.from(host.querySelectorAll<HTMLSpanElement>(`.${styles.ltr}`))
    if (spans.length !== chars.length) return
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (settleRef.current !== null) clearTimeout(settleRef.current)

    const settle = () => {
      chars.forEach((ch, i) => { spans[i].textContent = ch })
    }

    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min((now - start) / DURATION, 1)
      chars.forEach((ch, i) => {
        // Leestekens, spaties en pijlen blijven staan: een scramblende pijl
        // in "Vraag toegang →" oogt kapot.
        if (!/[A-Za-z0-9]/.test(ch)) return
        spans[i].textContent = p >= i / chars.length
          ? ch
          : CHARS[(Math.random() * CHARS.length) | 0]
      })
      rafRef.current = p < 1 ? requestAnimationFrame(step) : null
    }
    rafRef.current = requestAnimationFrame(step)

    // Vangnet: requestAnimationFrame staat stil in een achtergrondtab. Zonder
    // dit blijft een half gescramblede label als onzin staan tot iemand er met
    // de muis overheen gaat. Een timer loopt daar wel gewoon door.
    settleRef.current = window.setTimeout(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      settle()
    }, DURATION + 400)
  }, [chars])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (typeof IntersectionObserver === 'undefined') return

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          run()
          io.unobserve(entry.target)
        }
      },
      { threshold: 0.5 }
    )
    io.observe(host)
    return () => {
      io.disconnect()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (settleRef.current !== null) clearTimeout(settleRef.current)
    }
  }, [run])

  return (
    <span ref={hostRef} className={className} aria-label={text} onMouseEnter={run}>
      {chars.map((ch, i) => (
        <span key={`${ch}-${i}`} className={styles.ltr} aria-hidden="true">
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}
