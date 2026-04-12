/**
 * Mapping van data-keys naar custom fitness iconen
 * Gebruik: const Icon = WORKOUT_ICON_MAP['STRENGTH']; <Icon size={20} />
 */
import type { ComponentType } from 'react'
import type { IconProps } from './FitnessIcons'
import {
  IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore,
  IconSquat, IconLunge, IconHinge, IconPushHorizontal, IconPushVertical,
  IconPullHorizontal, IconPullVertical, IconHipThrust, IconCalfRaise,
  IconCoreMovement, IconRotation, IconIsolationUpper, IconIsolationLower,
  IconCarry, IconFullBody,
  IconRunning, IconCycling, IconRowing, IconSwimming, IconCrosstrainer,
  IconWalking, IconSkiErg, IconAssaultBike, IconWattbike, IconStairclimber,
  IconOtherCardio,
  IconRest, IconMovement, IconExercise, IconAfterExertion, IconAlways,
} from './FitnessIcons'

// ── Workout types ───────────────────────────────────────────────────────────

export const WORKOUT_ICON_MAP: Record<string, ComponentType<IconProps>> = {
  STRENGTH: IconStrength,
  MOBILITY: IconMobility,
  PLYOMETRICS: IconPlyometrics,
  CARDIO: IconCardio,
  CORE: IconCore,
}

// ── Movement patterns ───────────────────────────────────────────────────────

export const MOVEMENT_ICON_MAP: Record<string, ComponentType<IconProps>> = {
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

export const CARDIO_ICON_MAP: Record<string, ComponentType<IconProps>> = {
  RUNNING: IconRunning,
  CYCLING: IconCycling,
  ROWING: IconRowing,
  SWIMMING: IconSwimming,
  CROSSTRAINER: IconCrosstrainer,
  WALKING: IconWalking,
  SKIERG: IconSkiErg,
  ASSAULT_BIKE: IconAssaultBike,
  WATTBIKE: IconWattbike,
  STAIRCLIMBER: IconStairclimber,
  OTHER: IconOtherCardio,
}

// ── Pain contexts ───────────────────────────────────────────────────────────

export const PAIN_CONTEXT_ICON_MAP: Record<string, ComponentType<IconProps>> = {
  rest: IconRest,
  movement: IconMovement,
  exercise: IconExercise,
  after: IconAfterExertion,
  always: IconAlways,
}

// ── Helper: render icon by key + map ────────────────────────────────────────

export function FitnessIcon({
  map,
  value,
  size = 24,
  className,
}: {
  map: Record<string, ComponentType<IconProps>>
  value: string
  size?: number
  className?: string
}) {
  const Icon = map[value]
  if (!Icon) return null
  return <Icon size={size} className={className} />
}
