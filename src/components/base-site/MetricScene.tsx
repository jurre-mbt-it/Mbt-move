'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './base-site.module.css'
import { ScrambleText } from './ScrambleText'

/**
 * Vastgezette scene met de telefoon, naar het model van de ring-sectie op
 * sensiq.co: het blok blijft aan de bovenkant plakken, bovenin lopen drie
 * segmenten vol, en terwijl je scrollt schuift het scherm in de telefoon door
 * terwijl de tekst ernaast per stap wisselt.
 *
 * Wat er in de telefoon staat is de Gezondheid-pagina van de iOS-app, nagebouwd
 * met dezelfde onderdelen, kleuren en labels: de drie dagdoelen als
 * concentrische halve bogen (beweging amber, training groen, slaap cyaan), de
 * belastingkaart met de kracht/cardio-split, en de tegels HRV, rust-hartslag,
 * ademhaling, VO2max en stress.
 *
 * NB: dit is een natekening, geen schermafdruk. De goedgekeurde spec vraagt om
 * echte, gesaniteerde schermen; zolang die er niet zijn staat dit hier.
 *
 * Bij prefers-reduced-motion vervalt het plakken en staat stap 1 stil.
 */
type Step = {
  label: string
  title: string
  note: string
  /** Hoe ver het scherm in de telefoon is doorgeschoven, in pixels. */
  offset: number
}

const STEPS: Step[] = [
  {
    label: 'Dagdoelen',
    title: 'Beweging, training en slaap in één blik',
    note: 'De watch synct vanzelf. Je patiënt ziet meteen of de dag gehaald is, en jij ziet hetzelfde beeld terug in het dossier.',
    offset: 0,
  },
  {
    label: 'Belasting',
    title: 'Kracht en cardio apart, en bij elkaar opgeteld',
    note: 'De app splitst de belasting naar kracht en cardio en zet er de vorm van de afgelopen weken naast. Een piek valt op voordat iemand hem voelt.',
    offset: 300,
  },
  {
    label: 'Hart en herstel',
    title: 'De cijfers waar herstel op leunt',
    note: 'HRV, rusthartslag, ademhaling en stress van vannacht. Samen bepalen ze de herstelscore waarmee de dag begint.',
    offset: 620,
  },
]

/** Kleuren van de app zelf (mbt-gym-mobile, components/charts-v2.tsx). */
const CV = {
  amber: '#f2b33d',
  green: '#4ecb71',
  cyan: '#56b8d0',
  ink: '#e8f1ef',
  ink2: '#a9c2be',
  mut: '#7f9c98',
  cardTop: '#17312f',
  cardBot: '#112423',
  track: 'rgba(255,255,255,0.08)',
}

const RINGS = [
  { label: 'BEWEGING', pct: 0.82, color: CV.amber, value: '512 KCAL' },
  { label: 'TRAINING', pct: 0.64, color: CV.green, value: '38 MIN' },
  { label: 'SLAAP', pct: 0.9, color: CV.cyan, value: '7,2 UUR' },
]

function Arcs({ progress }: { progress: number }) {
  const stroke = 11
  const gap = 15
  const outer = 104
  const cx = 150
  const cy = 118
  return (
    <svg viewBox="0 0 300 132" className={styles.arcs} aria-hidden="true">
      {RINGS.map((r, i) => {
        const rad = outer - i * (stroke + gap)
        const len = Math.PI * rad
        const d = `M ${cx - rad} ${cy} A ${rad} ${rad} 0 0 1 ${cx + rad} ${cy}`
        return (
          <g key={r.label}>
            <path d={d} fill="none" stroke={CV.track} strokeWidth={stroke} strokeLinecap="round" />
            <path
              d={d}
              fill="none"
              stroke={r.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={len - len * r.pct * progress}
            />
          </g>
        )
      })}
    </svg>
  )
}

export function MetricScene() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [still, setStill] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // De mediaquery in de CSS zet het plakken al uit; hier alleen de inhoud
      // op de eindstand. Via rAF, want synchroon setState in een effect geeft
      // cascaderende renders.
      const id = requestAnimationFrame(() => setStill(true))
      return () => cancelAnimationFrame(id)
    }
    let raf: number | null = null
    const measure = () => {
      raf = null
      const el = wrapRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const travel = rect.height - window.innerHeight
      if (travel <= 0) return
      setProgress(Math.min(Math.max(-rect.top / travel, 0), 1))
    }
    const onScroll = () => {
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

  const scaled = Math.min(progress * STEPS.length, STEPS.length - 0.0001)
  const index = still ? 0 : Math.floor(scaled)
  const within = still ? 1 : scaled - index
  const step = STEPS[index]

  // Het scherm schuift vloeiend door tussen de vaste posities van de stappen.
  const next = STEPS[Math.min(index + 1, STEPS.length - 1)]
  const shift = step.offset + (next.offset - step.offset) * within
  // De bogen tekenen zich uit in de eerste stap en blijven daarna staan.
  const arcProgress = still ? 1 : Math.min(progress * 4, 1)

  return (
    <div ref={wrapRef} className={`${styles.sec} ${styles.secDark} ${styles.scene}`}>
      <div className={styles.scenePin}>
        <div className={styles.shell}>
          <div className={styles.sceneProgress} aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.label} className={styles.sceneBar}>
                <i style={{ transform: `scaleX(${i < index ? 1 : i === index ? within : 0})` }} />
              </span>
            ))}
          </div>

          <div className={styles.sceneBody}>
            <div className={styles.sceneCopy}>
              <p className={styles.eyebrow}>
                <ScrambleText key={step.label} text={step.label} />
              </p>
              <h2 className={`${styles.head} ${styles.headSmall}`}>{step.title}</h2>
              <p className={styles.lede}>{step.note}</p>
              <p className={styles.sceneFoot}>Gezondheid in de BASE-app</p>
            </div>

            <div className={styles.phoneWrap}>
              <div className={styles.phone}>
                <span className={styles.phoneNotch} aria-hidden="true" />
                <div className={styles.phoneScreen}>
                  <div className={styles.phoneScroll} style={{ transform: `translateY(${-shift}px)` }}>
                    <div className={styles.appHead}>
                      <span className={styles.appTitle}>Gezondheid</span>
                      <span className={styles.appMeta}>Ververst 08:08</span>
                    </div>

                    <div className={styles.appCard}>
                      <span className={styles.appLabel}>Dagdoelen</span>
                      <Arcs progress={arcProgress} />
                      <div className={styles.appCentre}>
                        <span className={styles.appBig}>{Math.round(79 * arcProgress)}<small>%</small></span>
                        <span className={styles.appMeta}>Gemiddeld vandaag</span>
                      </div>
                      <div className={styles.appLegend}>
                        {RINGS.map((r) => (
                          <span key={r.label} className={styles.appLegendItem}>
                            <i style={{ background: r.color }} />
                            {r.label} <b>{r.value}</b>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className={styles.appCard}>
                      <div className={styles.appCardTop}>
                        <span className={styles.appLabel}>Belasting</span>
                        <span className={styles.appBadge}>In opbouw</span>
                      </div>
                      <div className={styles.appRow}>
                        <span>Kracht</span>
                        <i className={styles.appBarTrack}><b style={{ width: '72%', background: CV.amber }} /></i>
                        <span className={styles.appNum}>214</span>
                      </div>
                      <div className={styles.appRow}>
                        <span>Cardio</span>
                        <i className={styles.appBarTrack}><b style={{ width: '46%', background: CV.cyan }} /></i>
                        <span className={styles.appNum}>128</span>
                      </div>
                      <span className={styles.appMeta}>Week +12 procent, consistente opbouw</span>
                    </div>

                    <div className={styles.appGrid}>
                      <div className={styles.appTile}>
                        <span className={styles.appLabel}>HRV</span>
                        <span className={styles.appTileVal} style={{ color: CV.cyan }}>64<small>ms</small></span>
                      </div>
                      <div className={styles.appTile}>
                        <span className={styles.appLabel}>Rust-HR</span>
                        <span className={styles.appTileVal} style={{ color: CV.green }}>52<small>bpm</small></span>
                      </div>
                      <div className={styles.appTile}>
                        <span className={styles.appLabel}>Ademhaling</span>
                        <span className={styles.appTileVal}>13,4<small>/min</small></span>
                      </div>
                      <div className={styles.appTile}>
                        <span className={styles.appLabel}>VO&#8322;max</span>
                        <span className={styles.appTileVal} style={{ color: CV.cyan }}>48</span>
                      </div>
                      <div className={styles.appTile}>
                        <span className={styles.appLabel}>Stress</span>
                        <span className={styles.appTileVal} style={{ color: CV.green }}>24<small>laag</small></span>
                      </div>
                      <div className={styles.appTile}>
                        <span className={styles.appLabel}>Slaap</span>
                        <span className={styles.appTileVal}>7<small>u 12</small></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
