'use client'

import { useEffect } from 'react'

const RAIL_SECTIONS = ['top', 'rollen', 'sporters', 'model', 'praktijk', 'herkomst', 'beta']

/**
 * Twee scroll-effecten, allebei puur decoratief:
 *
 * 1. Secties komen omhoog zodra ze in beeld komen. De pagina staat standaard
 *    in de zichtbare eindstand; pas als dit component draait wordt
 *    `data-reveal` gezet en verschijnt de begintoestand. Zonder JavaScript,
 *    of als de observer nooit afgaat, blijft alles dus gewoon zichtbaar.
 *    De timer eronder is de vangnetmaatregel: die forceert na 2,2 seconde de
 *    eindstand zonder transitie.
 * 2. De verticale as links markeert in welke sectie je zit.
 */
export function Effects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.gv2')
    if (!root) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const items = Array.from(root.querySelectorAll<HTMLElement>('.rv'))
    const cleanups: Array<() => void> = []

    if (!reduce && 'IntersectionObserver' in window && items.length) {
      root.setAttribute('data-reveal', 'on')

      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              e.target.classList.add('in')
              io.unobserve(e.target)
            }
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
      )
      items.forEach((n) => io.observe(n))
      cleanups.push(() => io.disconnect())

      const failsafe = window.setTimeout(() => {
        root.setAttribute('data-reveal', 'off')
        items.forEach((n) => n.classList.add('in'))
      }, 2200)
      cleanups.push(() => window.clearTimeout(failsafe))
    }

    const railItems = Array.from(root.querySelectorAll<HTMLElement>('.rail li'))
    if (railItems.length && 'IntersectionObserver' in window) {
      const byId = new Map(railItems.map((li) => [li.dataset.rail, li]))
      const spy = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const li = byId.get(e.target.id)
            if (!li || !e.isIntersecting) continue
            railItems.forEach((x) => x.removeAttribute('aria-current'))
            li.setAttribute('aria-current', 'true')
          }
        },
        { rootMargin: '-45% 0px -45% 0px' },
      )
      RAIL_SECTIONS.forEach((id) => {
        const el = document.getElementById(id)
        if (el) spy.observe(el)
      })
      cleanups.push(() => spy.disconnect())
    }

    return () => cleanups.forEach((fn) => fn())
  }, [])

  return null
}
