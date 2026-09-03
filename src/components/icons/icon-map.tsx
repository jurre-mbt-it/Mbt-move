/**
 * Mapping van data-keys naar custom fitness iconen
 * Gebruik: const Icon = WORKOUT_ICON_MAP['STRENGTH']; <Icon size={20} />
 */
import type { LucideIcon } from 'lucide-react'
import {
  IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore,
  IconSquat, IconLunge, IconHinge, IconPushHorizontal, IconPushVertical,
  IconPullHorizontal, IconPullVertical, IconHipThrust, IconCalfRaise,
  IconCoreMovement, IconRotation, IconIsolationUpper, IconIsolationLower,
  IconCarry, IconFullBody,
  IconRunning, IconCycling, IconRowing, IconSwimming, IconCrosstrainer,
  IconWalking, IconSkiErg, IconAssaultBike, IconWattbike, IconStairclimber,
  IconHiking, IconStrengthActivity, IconHiit, IconYoga, IconOtherCardio,
  IconRest, IconMovement, IconExercise, IconAfterExertion, IconAlways,
  IconMoon, IconStrength as IconSoreness, IconLightning, IconSun, IconMobility as IconStress,
  IconMoodVeryLow, IconMoodLow, IconMoodNeutral, IconMoodGood, IconMoodGreat,
} from './lucide-icons'

// ── Workout types ───────────────────────────────────────────────────────────

export const WORKOUT_ICON_MAP: Record<string, LucideIcon> = {
  STRENGTH: IconStrength,
  MOBILITY: IconMobility,
  PLYOMETRICS: IconPlyometrics,
  CARDIO: IconCardio,
  CORE: IconCore,
}

// ── Movement patterns ───────────────────────────────────────────────────────

export const MOVEMENT_ICON_MAP: Record<string, LucideIcon> = {
  SQUAT: IconSquat,
  LUNGE: IconLunge,
  HINGE: IconHinge,
  PUSH_HORIZONTAL: IconPushHorizontal,
  PUSH_VERTICAL: IconPushVertical,
  PULL_HORIZONTAL: IconPullHorizontal,
  PULL_VERTICAL: IconPullVertical,
  HIP_THRUST: IconHipThrust,
  CALF_RAISE: IconCalfRaise,
  CORE: IconCoreMovement,
  ROTATION: IconRotation,
  ISOLATION_UPPER: IconIsolationUpper,
  ISOLATION_LOWER: IconIsolationLower,
  CARRY: IconCarry,
  FULL_BODY: IconFullBody,
}

// ── Cardio activities ───────────────────────────────────────────────────────

export const CARDIO_ICON_MAP: Record<string, LucideIcon> = {
  RUNNING: IconRunning,
  CYCLING: IconCycling,
  ROWING: IconRowing,
  SWIMMING: IconSwimming,
  CROSSTRAINER: IconCrosstrainer,
  WALKING: IconWalking,
  HIKING: IconHiking,
  SKIERG: IconSkiErg,
  ASSAULT_BIKE: IconAssaultBike,
  WATTBIKE: IconWattbike,
  STAIRCLIMBER: IconStairclimber,
  STRENGTH: IconStrengthActivity,
  HIIT: IconHiit,
  YOGA: IconYoga,
  OTHER: IconOtherCardio,
}

// ── Pain contexts ───────────────────────────────────────────────────────────

export const PAIN_CONTEXT_ICON_MAP: Record<string, LucideIcon> = {
  rest: IconRest,
  movement: IconMovement,
  exercise: IconExercise,
  after: IconAfterExertion,
  always: IconAlways,
}

// ── Wellness check-items ────────────────────────────────────────────────────

export const WELLNESS_ICON_MAP: Record<string, LucideIcon> = {
  sleep: IconMoon,
  soreness: IconSoreness,
  fatigue: IconLightning,
  mood: IconSun,
  stress: IconStress,
}

// ── Stemming-schaal (1 = slecht … 5 = top), index 0-based ───────────────────

export const MOOD_SCALE: LucideIcon[] = [
  IconMoodVeryLow,
  IconMoodLow,
  IconMoodNeutral,
  IconMoodGood,
  IconMoodGreat,
]

// ── Helper: render icon by key + map ────────────────────────────────────────

export function FitnessIcon({
  map,
  value,
  size = 24,
  className,
}: {
  map: Record<string, LucideIcon>
  value: string
  size?: number
  className?: string
}) {
  const Icon = map[value]
  if (!Icon) return null
  return <Icon size={size} className={className} />
}
