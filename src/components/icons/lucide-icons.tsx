/**
 * App-iconen = lucide-react, zodat alle content-iconen dezelfde monoline-stijl
 * hebben als het navigatiemenu (dat ook lucide gebruikt).
 *
 * De bestaande `IconX`-namen blijven behouden als alias op een lucide-icoon,
 * zodat geen enkele consumer of icon-map hoeft te wijzigen. Waar lucide geen
 * specifiek fitness-icoon heeft (gym-bewegingspatronen, niche-cardio) valt het
 * terug op een passend generiek icoon (Dumbbell / Activity).
 *
 * NB: `FitnessIcons.tsx` (3-tonen) blijft bestaan voor de website-sprite
 * (`scripts/gen-website-icon-sprite.cjs`) en wordt hier bewust niet gebruikt.
 */
export {
  // ── General / UI ──────────────────────────────────────────────────────────
  Hand as IconWave,
  PartyPopper as IconCelebration,
  Flag as IconFinishFlag,
  TriangleAlert as IconWarning,
  Ban as IconStop,
  Lightbulb as IconLightbulb,
  ClipboardList as IconClipboard,
  FileText as IconNote,
  Leaf as IconLeaf,
  Moon as IconSleep,
  Moon as IconMoon,
  Lock as IconLock,
  Check as IconCheck,
  Sun as IconSun,
  Zap as IconLightning,
  Wind as IconWind,
  Heart as IconHeart,
  Sparkles as IconSparkle,
  CalendarDays as IconCalendar,
  Folder as IconFolder,
  Settings as IconGear,
  Scale as IconScale,
  Umbrella as IconBeach,
  Mail as IconMail,

  // ── Mood faces (1 = slecht … 5 = top) ────────────────────────────────────
  Angry as IconMoodVeryLow,
  Frown as IconMoodLow,
  Meh as IconMoodNeutral,
  Smile as IconMoodGood,
  Laugh as IconMoodGreat,

  // ── Workout types ─────────────────────────────────────────────────────────
  Dumbbell as IconStrength,
  PersonStanding as IconMobility,
  Zap as IconPlyometrics,
  HeartPulse as IconCardio,
  Target as IconCore,

  // ── Movement patterns (generiek waar lucide geen match heeft) ────────────
  Dumbbell as IconSquat,
  Dumbbell as IconLunge,
  Dumbbell as IconHinge,
  Dumbbell as IconPushHorizontal,
  Dumbbell as IconPushVertical,
  Dumbbell as IconPullHorizontal,
  Dumbbell as IconPullVertical,
  Dumbbell as IconHipThrust,
  Dumbbell as IconCalfRaise,
  Target as IconCoreMovement,
  RotateCw as IconRotation,
  Dumbbell as IconIsolationUpper,
  Dumbbell as IconIsolationLower,
  Dumbbell as IconCarry,
  Activity as IconFullBody,

  // ── Cardio activiteiten ───────────────────────────────────────────────────
  Footprints as IconRunning,
  Bike as IconCycling,
  Sailboat as IconRowing,
  Waves as IconSwimming,
  Activity as IconCrosstrainer,
  Footprints as IconWalking,
  Activity as IconSkiErg,
  Bike as IconAssaultBike,
  Bike as IconWattbike,
  Activity as IconStairclimber,
  Activity as IconOtherCardio,

  // ── Pijn-contexten ────────────────────────────────────────────────────────
  Armchair as IconRest,
  Footprints as IconMovement,
  Dumbbell as IconExercise,
  BedDouble as IconAfterExertion,
  Clock as IconAlways,
} from 'lucide-react'

export type IconProps = { size?: number; className?: string; color?: string }
