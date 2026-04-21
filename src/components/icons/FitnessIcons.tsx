/**
 * Custom flat fitness icons — minimalistisch, donkergrijs stijl
 * Geïnspireerd op dumbbell reference icon
 */
import React from 'react'

export interface IconProps {
  size?: number
  className?: string
  color?: string
}

const D = '#4a5568'   // primary dark
const M = '#5a6577'   // mid tone
const L = '#7B8889'   // light accent

// ─── General / UI icons ─────────────────────────────────────────────────────

export function IconWave({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 12c1-3 2-5 4-7" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M11 5c1 2 2 5 1 8" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M14 4c0 3-1 6-2 9" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M17 6c-1 3-2 5-2 7" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M5 15c3 3 7 4 14 1" stroke={D} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconCelebration({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Confetti / celebration */}
      <path d="M4 20l4-16 4 12 4-8 4 12" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="5" r="1" fill={L} />
      <circle cx="18" cy="4" r="1" fill={M} />
      <circle cx="12" cy="3" r="1" fill={L} />
      <line x1="2" y1="8" x2="4" y2="7" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="8" x2="22" y2="7" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconFinishFlag({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Finish flag */}
      <path d="M5 3v18" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="3" width="14" height="10" rx="1" stroke={D} strokeWidth="1.5" />
      {/* Checkerboard pattern */}
      <rect x="5" y="3" width="4.67" height="5" fill={D} />
      <rect x="14.33" y="3" width="4.67" height="5" fill={D} />
      <rect x="9.67" y="8" width="4.67" height="5" fill={D} />
    </svg>
  )
}

export function IconWarning({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L2 20h20L12 2z" stroke={D} strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 9v5" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill={M} />
    </svg>
  )
}

export function IconStop({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke={D} strokeWidth="2" />
      <line x1="7" y1="7" x2="17" y2="17" stroke={D} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconLightbulb({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 18h6" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 20h4" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z" stroke={D} strokeWidth="2" />
      <path d="M12 6v4" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 8h4" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconClipboard({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="5" y="4" width="14" height="17" rx="2" stroke={D} strokeWidth="2" />
      <rect x="8" y="2" width="8" height="4" rx="1" stroke={M} strokeWidth="1.5" fill="white" />
      <line x1="8" y1="10" x2="16" y2="10" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="13" x2="14" y2="13" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="16" x2="12" y2="16" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconNote({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="3" width="16" height="18" rx="2" stroke={D} strokeWidth="2" />
      <line x1="8" y1="8" x2="16" y2="8" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="11" x2="16" y2="11" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="14" x2="12" y2="14" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconLeaf({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 20c0 0 2-8 8-12s8-4 8-4-2 8-8 12-8 4-8 4z" stroke={D} strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 20c4-4 8-8 16-16" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 16c2-2 4-4 6-5" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconSleep({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M17 4h4l-4 4h4" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8h3l-3 3h3" stroke={M} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Moon */}
      <path d="M5 18a7 7 0 0 1 0-12 7.5 7.5 0 0 0 0 12z" stroke={D} strokeWidth="2" />
    </svg>
  )
}

export function IconLock({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke={D} strokeWidth="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.5" fill={D} />
    </svg>
  )
}

export function IconCheck({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12l5 5L20 7" stroke={D} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Workout types ──────────────────────────────────────────────────────────

export function IconStrength({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Dumbbell */}
      <rect x="2" y="9" width="3" height="6" rx="1" fill={D} />
      <rect x="4" y="7.5" width="2" height="9" rx="1" fill={M} />
      <rect x="18" y="7.5" width="2" height="9" rx="1" fill={M} />
      <rect x="19" y="9" width="3" height="6" rx="1" fill={D} />
      <rect x="6" y="11" width="12" height="2" rx="0.5" fill={L} />
    </svg>
  )
}

export function IconMobility({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Yoga / stretch person */}
      <circle cx="12" cy="4.5" r="2" fill={D} />
      <path d="M12 7v5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12l-4 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12l4 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M7 8l5 2 5-2" stroke={M} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconPlyometrics({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Jumping person with bolt */}
      <circle cx="10" cy="3.5" r="2" fill={D} />
      <path d="M10 6v3l-3 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 9l3 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M7 7l3 1.5" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M13 7l-3 1.5" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Lightning bolt */}
      <path d="M18 8l-2 4h3l-2 4" stroke={L} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCardio({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Heart with pulse */}
      <path d="M12 20s-7-5.5-7-10a4.5 4.5 0 0 1 7-3.5A4.5 4.5 0 0 1 19 10c0 4.5-7 10-7 10z" fill={D} />
      <path d="M6 12h3l1.5-3 2 6 1.5-3h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCore({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Target / bull's eye */}
      <circle cx="12" cy="12" r="9" stroke={L} strokeWidth="2" />
      <circle cx="12" cy="12" r="5.5" stroke={M} strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill={D} />
    </svg>
  )
}

// ─── Movement patterns ──────────────────────────────────────────────────────

export function IconSquat({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="3.5" r="2" fill={D} />
      <path d="M12 6v3" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M8 7l4 2 4-2" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 9l-3 4h-1" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9l3 4h1" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 13v4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 13v4" stroke={D} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconLunge({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="3" r="2" fill={D} />
      <path d="M12 5v4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M9 6l3 2 3-2" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 9l-4 5v4" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9l4 4 1 5" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconHinge({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Deadlift / hip hinge */}
      <circle cx="14" cy="4" r="2" fill={D} />
      <path d="M14 6l-4 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11v6" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 17l-2 2" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 17l2 2" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 7l-2 1" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 7l-3 3" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Barbell on floor */}
      <rect x="4" y="19" width="16" height="2" rx="1" fill={L} />
    </svg>
  )
}

export function IconPushHorizontal({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Bench press silhouette */}
      <circle cx="12" cy="8" r="2" fill={D} />
      {/* Arms pushing up */}
      <path d="M8 10h8" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M6 10v3" stroke={D} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 10v3" stroke={D} strokeWidth="1.5" strokeLinecap="round" />
      {/* Bench */}
      <rect x="8" y="13" width="8" height="2" rx="1" fill={L} />
      <rect x="7" y="15" width="1.5" height="4" rx="0.5" fill={L} />
      <rect x="15.5" y="15" width="1.5" height="4" rx="0.5" fill={L} />
      {/* Barbell */}
      <rect x="3" y="9" width="3" height="2" rx="0.5" fill={D} />
      <rect x="18" y="9" width="3" height="2" rx="0.5" fill={D} />
    </svg>
  )
}

export function IconPushVertical({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Shoulder press */}
      <circle cx="12" cy="8" r="2" fill={D} />
      <path d="M12 10v5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 15l-3 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 15l3 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Arms up with weight */}
      <path d="M9 11l-1-6" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M15 11l1-6" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="3.5" width="3" height="2" rx="0.5" fill={D} />
      <rect x="16" y="3.5" width="3" height="2" rx="0.5" fill={D} />
    </svg>
  )
}

export function IconPullHorizontal({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Rowing motion */}
      <circle cx="12" cy="6" r="2" fill={D} />
      <path d="M12 8v4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12l-3 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12l3 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Arms pulling back */}
      <path d="M8 9l4 1" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 9l-4 1" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Horizontal bar being pulled */}
      <rect x="5" y="8" width="2.5" height="2" rx="0.5" fill={D} />
      <rect x="16.5" y="8" width="2.5" height="2" rx="0.5" fill={D} />
    </svg>
  )
}

export function IconPullVertical({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Pull-up */}
      <rect x="4" y="2" width="16" height="2" rx="1" fill={L} />
      <path d="M8 4v1" stroke={L} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 4v1" stroke={L} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="2" fill={D} />
      <path d="M9 5l3 1.5" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M15 5l-3 1.5" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 10v5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 15l-2 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 15l2 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconHipThrust({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Bridge position */}
      <circle cx="5" cy="11" r="2" fill={D} />
      <path d="M7 12l3 0" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 12l2-5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 7l3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M15 12l3 0" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M18 12v4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Floor */}
      <line x1="3" y1="18" x2="21" y2="18" stroke={L} strokeWidth="1.5" />
    </svg>
  )
}

export function IconCalfRaise({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Calf / foot */}
      <path d="M10 4v10" stroke={D} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 4v10" stroke={D} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="12" cy="3" rx="3.5" ry="1.5" fill={M} />
      {/* Foot raised */}
      <path d="M9 14c0 2 0 3 3 3s3-1 3-3" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Platform */}
      <rect x="6" y="19" width="12" height="2" rx="1" fill={L} />
      {/* Arrow up */}
      <path d="M19 10l0-5m0 0l-2 2m2-2l2 2" stroke={L} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCoreMovement({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Plank position */}
      <circle cx="5" cy="10" r="2" fill={D} />
      <path d="M7 11l12 2" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 13l-1 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M17 14l2 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Floor */}
      <line x1="3" y1="20" x2="21" y2="20" stroke={L} strokeWidth="1.5" />
    </svg>
  )
}

export function IconRotation({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Circular arrows */}
      <path d="M12 3a9 9 0 0 1 6.36 2.64" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M21 12a9 9 0 0 1-2.64 6.36" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 21a9 9 0 0 1-6.36-2.64" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M3 12a9 9 0 0 1 2.64-6.36" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Arrow heads */}
      <path d="M18 2l.36 3.64L15 6" stroke={D} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 22l-.36-3.64L9 18" stroke={D} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconIsolationUpper({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Bicep curl */}
      <circle cx="12" cy="5" r="2" fill={D} />
      <path d="M12 7v6" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13l-3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13l3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Right arm curling */}
      <path d="M14 9h2v-3" stroke={M} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Left arm down */}
      <path d="M10 9h-2v4" stroke={M} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dumbbell */}
      <rect x="15" y="4" width="2" height="3" rx="0.5" fill={D} />
    </svg>
  )
}

export function IconIsolationLower({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Leg extension — seated with leg extended */}
      <circle cx="8" cy="6" r="2" fill={D} />
      <path d="M8 8v4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M8 12h0l-2 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Extending leg */}
      <path d="M8 12l6 1 4-2" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Seat */}
      <rect x="4" y="12" width="6" height="2" rx="1" fill={L} />
      {/* Machine */}
      <rect x="3" y="14" width="2" height="5" rx="0.5" fill={L} />
    </svg>
  )
}

export function IconCarry({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Person carrying weights */}
      <circle cx="12" cy="3.5" r="2" fill={D} />
      <path d="M12 6v7" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13l-3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13l3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Arms holding down */}
      <path d="M9 8l-3 4" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M15 8l3 4" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Weights */}
      <rect x="3" y="11" width="3" height="4" rx="1" fill={D} />
      <rect x="18" y="11" width="3" height="4" rx="1" fill={D} />
    </svg>
  )
}

export function IconFullBody({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Explosive full body — burpee/clean */}
      <circle cx="12" cy="3" r="2" fill={D} />
      <path d="M12 5v5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 10l-4 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 10l4 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M8 7l4 1.5 4-1.5" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Speed lines */}
      <line x1="4" y1="4" x2="6" y2="4" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="7" x2="5" y2="7" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19" y1="4" x2="21" y2="4" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19" y1="7" x2="21" y2="7" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Cardio activities ──────────────────────────────────────────────────────

export function IconRunning({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="14" cy="4" r="2" fill={D} />
      <path d="M14 6l-2 4-3 1" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 10l2 4 3 2" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 10l-3 6-2 1" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 7l-2 1" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 7l-3 2" stroke={M} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconCycling({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Bicycle */}
      <circle cx="6" cy="16" r="4" stroke={D} strokeWidth="2" />
      <circle cx="18" cy="16" r="4" stroke={D} strokeWidth="2" />
      {/* Frame */}
      <path d="M6 16l4-7h4l4 7" stroke={M} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 9l2 7" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      {/* Handlebars */}
      <path d="M14 9l3-2" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      {/* Seat */}
      <rect x="9" y="7.5" width="3" height="1.5" rx="0.75" fill={D} />
    </svg>
  )
}

export function IconRowing({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8" cy="8" r="2" fill={D} />
      <path d="M8 10v3l4-1" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 13l-3 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Arms pulling */}
      <path d="M10 10l5-2" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Oar */}
      <path d="M15 8l5 3" stroke={L} strokeWidth="2" strokeLinecap="round" />
      {/* Water line */}
      <path d="M2 19c2-1 4 0 6-1s4 0 6-1 4 0 6-1" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconSwimming({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="6" cy="10" r="2" fill={D} />
      {/* Body horizontal */}
      <path d="M8 11l10 0" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Arms */}
      <path d="M8 11l-2-4" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11l2-4" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Legs */}
      <path d="M16 10l3 2" stroke={D} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 12l3-1" stroke={D} strokeWidth="1.5" strokeLinecap="round" />
      {/* Water */}
      <path d="M2 17c2-1 4 0 6-1s4 0 6-1 4 0 6-1" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconCrosstrainer({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Elliptical machine */}
      <circle cx="12" cy="4" r="2" fill={D} />
      <path d="M12 6v4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Arms on handles */}
      <path d="M9 8l-3-2" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M15 8l3-2" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Legs on pedals */}
      <path d="M12 10l-4 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 10l4 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Machine base */}
      <ellipse cx="12" cy="17" rx="6" ry="2" stroke={L} strokeWidth="1.5" />
    </svg>
  )
}

export function IconWalking({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="4" r="2" fill={D} />
      <path d="M12 6v5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11l-2 5-1 3" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11l2 4 2 4" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8l3 1 3-1" stroke={M} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconSkiErg({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="4" r="2" fill={D} />
      <path d="M12 6v5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11l-3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11l3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Ski poles pulling down */}
      <path d="M8 5l-4 10" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 5l4 10" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      {/* Machine base */}
      <rect x="9" y="18" width="6" height="2" rx="1" fill={L} />
    </svg>
  )
}

export function IconAssaultBike({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Fan bike — circle with blades */}
      <circle cx="12" cy="10" r="6" stroke={D} strokeWidth="2" />
      <circle cx="12" cy="10" r="1.5" fill={D} />
      {/* Fan blades */}
      <path d="M12 5v-1M12 16v1M7 10H6M18 10h1" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.5 6.5l-.7-.7M15.5 13.5l.7.7M8.5 13.5l-.7.7M15.5 6.5l.7-.7" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      {/* Seat */}
      <rect x="8" y="17" width="4" height="1.5" rx="0.5" fill={M} />
      {/* Stand */}
      <path d="M6 19h12" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconWattbike({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Stationary power bike */}
      <circle cx="8" cy="17" r="3" stroke={D} strokeWidth="2" />
      <circle cx="16" cy="17" r="3" stroke={D} strokeWidth="2" />
      {/* Frame */}
      <path d="M8 17l4-9h4" stroke={M} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8l4 9" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      {/* Handlebars */}
      <path d="M16 8l2-2h2" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      {/* Seat */}
      <rect x="10" y="6.5" width="4" height="1.5" rx="0.75" fill={D} />
      {/* Power meter indicator */}
      <circle cx="18" cy="5" r="1.5" stroke={L} strokeWidth="1" fill="none" />
    </svg>
  )
}

export function IconStairclimber({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Staircase pattern */}
      <path d="M4 18h4v-4h4v-4h4v-4h4" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Person climbing */}
      <circle cx="14" cy="5" r="1.5" fill={M} />
      <path d="M14 6.5v3" stroke={M} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 7.5l-2 0" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 7.5l2 0" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconOtherCardio({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Generic fitness — dumbbell + heart */}
      <rect x="2" y="10" width="3" height="4" rx="1" fill={D} />
      <rect x="4" y="9" width="2" height="6" rx="0.5" fill={M} />
      <rect x="18" y="9" width="2" height="6" rx="0.5" fill={M} />
      <rect x="19" y="10" width="3" height="4" rx="1" fill={D} />
      <rect x="6" y="11.5" width="12" height="1.5" rx="0.5" fill={L} />
      {/* Small heart */}
      <path d="M12 7s-2-2-3.5-.5S9 9 12 11.5c3-2.5 4-3 2.5-4.5S12 7 12 7z" fill={L} />
    </svg>
  )
}

// ─── Pain contexts ──────────────────────────────────────────────────────────

export function IconRest({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Person sitting/resting on couch */}
      <circle cx="10" cy="6" r="2" fill={D} />
      <path d="M10 8v4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 12l-2 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 12l3 3h3" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Couch */}
      <path d="M4 14h16v4H4z" stroke={L} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 14v-3" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 14v-3" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconMovement({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Same as walking icon */}
      <circle cx="12" cy="4" r="2" fill={D} />
      <path d="M12 6v5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11l-2 5-1 3" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11l2 4 2 4" stroke={D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8l3 1 3-1" stroke={M} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconExercise({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Person exercising with weight — like the reference dumbbell icon */}
      <circle cx="12" cy="4" r="2" fill={D} />
      <path d="M12 6v5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11l-3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11l3 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Arms lifting barbell overhead */}
      <path d="M8 8l4-2 4 2" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="4.5" width="2.5" height="2" rx="0.5" fill={D} />
      <rect x="16.5" y="4.5" width="2.5" height="2" rx="0.5" fill={D} />
      <rect x="7.5" y="5" width="9" height="1" rx="0.5" fill={L} />
    </svg>
  )
}

export function IconAfterExertion({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Tired/resting person — bent over */}
      <circle cx="10" cy="6" r="2" fill={D} />
      <path d="M10 8l-1 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M9 13l-2 5" stroke={D} strokeWidth="2" strokeLinecap="round" />
      <path d="M9 13l3 4" stroke={D} strokeWidth="2" strokeLinecap="round" />
      {/* Hands on knees */}
      <path d="M12 8l3 3" stroke={M} strokeWidth="2" strokeLinecap="round" />
      <path d="M8 8l-3 3" stroke={M} strokeWidth="2" strokeLinecap="round" />
      {/* Sweat drops */}
      <circle cx="16" cy="5" r="0.8" fill={L} />
      <circle cx="18" cy="7" r="0.8" fill={L} />
      <circle cx="17" cy="3" r="0.8" fill={L} />
    </svg>
  )
}

export function IconAlways({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Clock — always/constant */}
      <circle cx="12" cy="12" r="9" stroke={D} strokeWidth="2" />
      <path d="M12 6v6l4 3" stroke={M} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Small marks */}
      <circle cx="12" cy="3.5" r="0.8" fill={L} />
      <circle cx="20.5" cy="12" r="0.8" fill={L} />
      <circle cx="12" cy="20.5" r="0.8" fill={L} />
      <circle cx="3.5" cy="12" r="0.8" fill={L} />
    </svg>
  )
}
