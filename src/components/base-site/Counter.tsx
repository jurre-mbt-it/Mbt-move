'use client'

import { useEffect, useRef } from 'react'

/**
 * Telt op zodra het cijfer in beeld komt (ontwerpsysteem sectie 3). Het
 * achtervoegsel loopt niet mee, dat staat los in de markup.
 */
export function Counter({ to, duration = 1400 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const settle = () => { el.textContent = String(to) }
    if (typeof IntersectionObserver === 'undefined') { settle(); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { settle(); return }

    let raf: number | null = null
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          io.unobserve(entry.target)
          const start = performance.now()
          const step = (now: number) => {
            const p = Math.min((now - start) / duration, 1)
            // out-expo, dezelfde curve als de rest van de beweging
            const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
            el.textContent = String(Math.round(to * eased))
            raf = p < 1 ? requestAnimationFrame(step) : null
          }
          raf = requestAnimationFrame(step)
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [to, duration])

  // Server rendert de eindwaarde: zonder JavaScript staat er gewoon het getal.
  return <span ref={ref}>{to}</span>
}
