'use client'

import { useEffect, useRef } from 'react'
import styles from './base-site.module.css'

/**
 * De belastingcurve uit ontwerprichting B: één lijn over twaalf weken die
 * zichzelf tekent zodra hij in beeld komt. De vorm is illustratief, niet de
 * data van een echte patiënt.
 */
const CURVE =
  'M0,252 C60,244 90,232 150,236 C210,240 240,268 300,262 C360,256 390,196 450,186 ' +
  'C510,176 540,158 600,140 C660,122 690,126 750,100 C810,74 840,62 900,44'

export function LoadCurve() {
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const length = path.getTotalLength()
    path.style.strokeDasharray = String(length)
    path.style.strokeDashoffset = String(length)

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          path.style.transition = 'stroke-dashoffset 2s cubic-bezier(0.25, 0.8, 0.3, 1)'
          path.style.strokeDashoffset = '0'
          io.unobserve(entry.target)
        }
      },
      { threshold: 0.3 }
    )
    io.observe(path)
    return () => io.disconnect()
  }, [])

  return (
    <div className={styles.curveWrap}>
      <div className={styles.curveChart}>
        <span className={`${styles.curveTag} ${styles.tagDip}`}>
          Terugval week 4 &middot; <em>griep</em>
        </span>
        <span className={`${styles.curveTag} ${styles.tagNow}`}>
          Vandaag &middot; <em>ruimte om te pushen</em>
        </span>
        <svg
          viewBox="0 0 900 300"
          preserveAspectRatio="none"
          role="img"
          aria-label="Voorbeeld van een belastingcurve over twaalf weken, met een terugval in week vier en een stijgende lijn daarna."
          style={{ height: 'clamp(180px, 26vw, 300px)' }}
        >
          <defs>
            <linearGradient id="base-curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E87A55" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#E87A55" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g stroke="rgba(212,232,230,0.07)" strokeWidth="1">
            <line x1="0" y1="75" x2="900" y2="75" />
            <line x1="0" y1="150" x2="900" y2="150" />
            <line x1="0" y1="225" x2="900" y2="225" />
          </g>
          <path d={`${CURVE} L900,300 L0,300 Z`} fill="url(#base-curve-fill)" />
          <path ref={pathRef} className={styles.curvePath} d={CURVE} />
          <circle cx="300" cy="262" r="5" fill="#0E2729" stroke="#E87A55" strokeWidth="2.5" />
          <circle cx="880" cy="49" r="6" fill="#F5B942" />
        </svg>
      </div>
      <div className={styles.curveAxis}>
        <span>Week 1</span><span>3</span><span>5</span><span>7</span><span>9</span><span>11</span><span>Nu</span>
      </div>
    </div>
  )
}
