/**
 * Athletic-dark shared components — web-variant van `mbt-gym/components/dark-ui.tsx`.
 * Zelfde API en look zodat het ontwerp 1-op-1 overkomt tussen iOS en web.
 *
 * Gebruik: wrap elk scherm in <DarkScreen> en combineer met Kicker/Display/Tile/...
 * Componenten zijn client-side waar nodig (interacties), server-safe voor de rest.
 */
'use client'

import * as React from 'react'
import Link from 'next/link'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

// Palette constants — synchroon met globals.css `:root --p-*` en `constants/theme.ts` in mbt-gym
export const P = {
  bg: '#0A0E0F',
  surface: '#141A1B',
  surfaceHi: '#1C2425',
  surfaceLow: '#0F1415',
  line: 'rgba(255,255,255,0.06)',
  lineStrong: 'rgba(255,255,255,0.12)',
  ink: '#F5F7F6',
  inkMuted: '#7B8889',
  inkDim: '#4A5454',
  lime: '#BEF264',
  limeDark: '#65A30D',
  limeMid: '#D4EC6C',
  limeDeep: '#84CC16',
  danger: '#F87171',
  dangerDark: '#991B1B',
  gold: '#F4C261',
  goldWarm: '#F39644',
  orange: '#F97316',
  ice: '#93C5FD',
  purple: '#C084FC',
} as const

// ─── Screen wrapper ──────────────────────────────────────────────────────────

export function DarkScreen({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn('athletic-dark min-h-dvh flex flex-col', className)}
      style={{ backgroundColor: P.bg, color: P.ink, ...style }}
    >
      {children}
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function DarkHeader({
  title,
  sub,
  backHref,
  onBack,
  right,
  className,
}: {
  title?: string
  sub?: string
  backHref?: string
  onBack?: () => void
  right?: React.ReactNode
  className?: string
}) {
  const backContent = (
    <span className="athletic-mono text-[11px]" style={{ color: P.inkMuted, letterSpacing: '0.16em' }}>
      ← TERUG
    </span>
  )

  return (
    <header
      className={cn('flex items-center justify-between gap-2 px-4 py-2 min-h-12', className)}
    >
      <div className="min-w-[72px] flex items-center">
        {backHref ? (
          <Link href={backHref} className="athletic-tap">
            {backContent}
          </Link>
        ) : onBack ? (
          <button type="button" onClick={onBack} className="athletic-tap">
            {backContent}
          </button>
        ) : null}
      </div>
      {title && (
        <div className="flex-1 flex flex-col items-center">
          <span
            className="athletic-mono text-[12px]"
            style={{ color: P.ink, letterSpacing: '0.15em', fontWeight: 800 }}
          >
            {title.toUpperCase()}
          </span>
          {sub && (
            <span
              className="athletic-mono text-[10px] mt-0.5"
              style={{ color: P.inkMuted, letterSpacing: '0.12em' }}
            >
              {sub}
            </span>
          )}
        </div>
      )}
      <div className="min-w-[72px] flex items-center justify-end">{right}</div>
    </header>
  )
}

// ─── Kicker / Display / MetaLabel ────────────────────────────────────────────

export function Kicker({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span className={cn('athletic-kicker block', className)} style={style}>
      {children}
    </span>
  )
}

export function MetaLabel({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span className={cn('athletic-meta block', className)} style={style}>
      {children}
    </span>
  )
}

type DisplaySize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'
const DISPLAY_SIZES: Record<DisplaySize, React.CSSProperties> = {
  sm: { fontSize: 24, lineHeight: '28px', letterSpacing: '-0.02em', paddingTop: 1 },
  md: { fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 },
  lg: { fontSize: 48, lineHeight: '56px', letterSpacing: '-0.035em', paddingTop: 2 },
  xl: { fontSize: 72, lineHeight: '82px', letterSpacing: '-0.04em', paddingTop: 4 },
  '2xl': { fontSize: 120, lineHeight: '134px', letterSpacing: '-0.045em', paddingTop: 6 },
}

export function Display({
  children,
  size = 'xl',
  color,
  className,
  style,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  size?: DisplaySize
  color?: string
  className?: string
  style?: React.CSSProperties
  as?: React.ElementType
}) {
  return (
    <Tag
      className={cn('athletic-display', className)}
      style={{ ...DISPLAY_SIZES[size], color: color ?? P.ink, ...style }}
    >
      {children}
    </Tag>
  )
}

// ─── Tiles ───────────────────────────────────────────────────────────────────

export function Tile({
  children,
  className,
  style,
  onClick,
  href,
  accentBar,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  href?: string
  accentBar?: string
}) {
  const Wrapper: React.ElementType = href ? Link : onClick ? 'button' : 'div'
  const wrapperProps: Record<string, unknown> = href
    ? { href }
    : onClick
      ? { type: 'button', onClick }
      : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'relative block overflow-hidden rounded-2xl text-left w-full',
        (href || onClick) && 'athletic-tap cursor-pointer',
        className,
      )}
      style={{
        backgroundColor: P.surface,
        padding: 16,
        paddingLeft: accentBar ? 20 : 16,
        ...style,
      }}
    >
      {accentBar && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: accentBar,
          }}
        />
      )}
      {children}
    </Wrapper>
  )
}

export function ActionTile({
  label,
  sub,
  onClick,
  href,
  bar,
  disabled,
  className,
}: {
  label: string
  sub?: string
  onClick?: () => void
  href?: string
  bar?: string
  disabled?: boolean
  className?: string
}) {
  const barColor = bar ?? P.inkDim
  const Wrapper: React.ElementType = href ? Link : 'button'
  const wrapperProps: Record<string, unknown> = href
    ? { href }
    : { type: 'button', onClick, disabled }

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'athletic-tap w-full flex items-center gap-3 rounded-xl text-left',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
      style={{
        backgroundColor: P.surface,
        padding: '18px 18px',
        marginBottom: 6,
      }}
    >
      <span
        aria-hidden
        style={{ width: 3, height: 36, borderRadius: 1.5, backgroundColor: barColor }}
      />
      <span className="flex-1 min-w-0">
        <span
          className="block truncate"
          style={{
            color: P.ink,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            className="athletic-mono block truncate"
            style={{
              color: P.inkMuted,
              fontSize: 12,
              letterSpacing: '0.03em',
              marginTop: 3,
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            {sub}
          </span>
        )}
      </span>
      <span style={{ color: P.inkMuted, fontSize: 18 }} aria-hidden>
        →
      </span>
    </Wrapper>
  )
}

export function MetricTile({
  label,
  value,
  unit,
  sub,
  tint = P.ink,
  className,
  style,
  href,
  onClick,
}: {
  label: string
  value: React.ReactNode
  unit?: string
  sub?: string
  tint?: string
  className?: string
  style?: React.CSSProperties
  href?: string
  onClick?: () => void
}) {
  const interactive = Boolean(href || onClick)
  const Wrapper: React.ElementType = href ? Link : onClick ? 'button' : 'div'
  const wrapperProps: Record<string, unknown> = href
    ? { href }
    : onClick
      ? { type: 'button', onClick }
      : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'rounded-2xl flex flex-col gap-2 text-left w-full',
        interactive && 'athletic-tap cursor-pointer',
        className,
      )}
      style={{ backgroundColor: P.surface, padding: 16, ...style }}
    >
      <MetaLabel>{label.toUpperCase()}</MetaLabel>
      <div className="flex items-baseline gap-1">
        <span
          className="athletic-display"
          style={{ color: tint, fontSize: 40, lineHeight: '44px', letterSpacing: '-0.035em' }}
        >
          {value}
        </span>
        {unit && <MetaLabel style={{ marginLeft: 4 }}>{unit}</MetaLabel>}
      </div>
      {sub && (
        <span style={{ color: P.inkMuted, fontSize: 12 }}>{sub}</span>
      )}
    </Wrapper>
  )
}

// ─── Buttons ────────────────────────────────────────────────────────────────

type DarkButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function DarkButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  loading,
  type = 'button',
  href,
  className,
  style,
  size = 'md',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: DarkButtonVariant
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
  href?: string
  className?: string
  style?: React.CSSProperties
  size?: 'sm' | 'md' | 'lg'
}) {
  const bg =
    variant === 'primary'
      ? P.lime
      : variant === 'danger'
        ? P.danger
        : variant === 'ghost'
          ? 'transparent'
          : P.surface
  const fg =
    variant === 'primary' ? P.bg : variant === 'danger' ? P.bg : P.ink
  const border = variant === 'secondary' || variant === 'ghost' ? P.lineStrong : 'transparent'
  const pad =
    size === 'sm'
      ? '10px 14px'
      : size === 'lg'
        ? '18px 24px'
        : '14px 20px'
  const fontSize = size === 'sm' ? 13 : 15

  const baseClass = cn(
    'athletic-tap inline-flex items-center justify-center rounded-xl font-extrabold',
    (disabled || loading) && 'opacity-50 pointer-events-none',
    className,
  )
  const baseStyle: React.CSSProperties = {
    backgroundColor: bg,
    color: fg,
    border: `1px solid ${border}`,
    padding: pad,
    fontSize,
    letterSpacing: '0.04em',
    minHeight: size === 'sm' ? 38 : size === 'lg' ? 56 : 48,
    ...style,
  }

  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={baseClass} style={baseStyle}>
        {loading ? '…' : children}
      </Link>
    )
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={baseClass}
      style={baseStyle}
    >
      {loading ? '…' : children}
    </button>
  )
}

// ─── Pulsing dot ────────────────────────────────────────────────────────────

export function PulsingDot({
  color = P.lime,
  size = 8,
  className,
  style,
}: {
  color?: string
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      className={cn('athletic-pulse inline-block align-middle', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        ...style,
      }}
    />
  )
}

// ─── Recovery bar (gesegmenteerd, rood→amber→lime) ──────────────────────────

function interpolateRecoveryColor(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  if (clamped <= 50) {
    const t = clamped / 50
    const r = Math.round(248 + (244 - 248) * t)
    const g = Math.round(113 + (194 - 113) * t)
    const b = Math.round(113 + (97 - 113) * t)
    return `rgb(${r},${g},${b})`
  }
  const t = (clamped - 50) / 50
  const r = Math.round(244 + (190 - 244) * t)
  const g = Math.round(194 + (242 - 194) * t)
  const b = Math.round(97 + (100 - 97) * t)
  return `rgb(${r},${g},${b})`
}

export function RecoveryBar({
  label,
  percent,
  caption,
  segments = 10,
  className,
}: {
  label: string
  percent: number
  caption?: string
  segments?: number
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, percent))
  const fillColor = interpolateRecoveryColor(pct)
  const filled = Math.round((pct / 100) * segments)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between">
        <MetaLabel>{label}</MetaLabel>
        <span
          className="athletic-mono"
          style={{ color: fillColor, fontSize: 13, fontWeight: 900 }}
        >
          {Math.round(pct)}%
        </span>
      </div>
      <div className="flex gap-[3px] h-1.5">
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className="flex-1 h-full rounded-[1.5px]"
            style={{
              backgroundColor: i < filled ? fillColor : P.surfaceHi,
            }}
          />
        ))}
      </div>
      {caption && (
        <span
          className="athletic-mono"
          style={{
            color: P.inkDim,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginTop: 2,
          }}
        >
          {caption}
        </span>
      )}
    </div>
  )
}

// ─── Week progress (7 bars, gold = vandaag pulsing) ─────────────────────────

export function WeekProgress({
  days,
  todayIndex,
  className,
}: {
  days: Array<'done' | 'today' | 'rest' | 'missed'>
  todayIndex?: number
  className?: string
}) {
  return (
    <div className={cn('flex gap-1', className)}>
      {days.map((state, i) => {
        const isToday = state === 'today' || i === todayIndex
        const color =
          state === 'done' ? P.lime : isToday ? P.gold : state === 'missed' ? P.danger : P.inkDim
        return (
          <span
            key={i}
            className={cn('flex-1 h-2 rounded-sm', isToday && 'athletic-pulse')}
            style={{ backgroundColor: color }}
          />
        )
      })}
    </div>
  )
}

// ─── Inputs (dark-styled form fields) ───────────────────────────────────────

export const DarkInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function DarkInput({ className, style, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        'w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors',
        'focus:border-[color:var(--p-lime)]',
        className,
      )}
      style={{
        backgroundColor: P.surfaceHi,
        border: `1px solid ${P.lineStrong}`,
        color: P.ink,
        ...style,
      }}
    />
  )
})

export const DarkTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function DarkTextarea({ className, style, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cn(
        'w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors',
        'focus:border-[color:var(--p-lime)]',
        className,
      )}
      style={{
        backgroundColor: P.surfaceHi,
        border: `1px solid ${P.lineStrong}`,
        color: P.ink,
        minHeight: 100,
        resize: 'vertical',
        ...style,
      }}
    />
  )
})

export const DarkSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function DarkSelect({ className, style, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      {...props}
      className={cn(
        'w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors',
        'focus:border-[color:var(--p-lime)]',
        className,
      )}
      style={{
        backgroundColor: P.surfaceHi,
        border: `1px solid ${P.lineStrong}`,
        color: P.ink,
        ...style,
      }}
    >
      {children}
    </select>
  )
})

// ─── Category kleuren (gekoppeld aan oefening-type, HR-zones, etc.) ────────

export const CATEGORY_COLORS = {
  STRENGTH: P.lime,
  MOBILITY: P.ice,
  PLYO: P.gold,
  CARDIO: P.danger,
  STABILITY: P.purple,
  // HR zones
  Z1: P.ice,
  Z2: P.lime,
  Z3: P.gold,
  Z4: P.orange,
  Z5: P.danger,
} as const

// ─── Dialog (radix-based, dark-themed) ──────────────────────────────────────

export const DarkDialog = DialogPrimitive.Root
export const DarkDialogTrigger = DialogPrimitive.Trigger
export const DarkDialogPortal = DialogPrimitive.Portal
export const DarkDialogClose = DialogPrimitive.Close

export const DarkDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DarkDialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      {...props}
    />
  )
})

export const DarkDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showClose?: boolean
  }
>(function DarkDialogContent(
  { className, children, showClose = true, style, ...props },
  ref,
) {
  return (
    <DarkDialogPortal>
      <DarkDialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'athletic-dark fixed left-[50%] top-[50%] z-50 w-[calc(100%-24px)] max-w-lg translate-x-[-50%] translate-y-[-50%]',
          'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        style={{
          backgroundColor: P.surface,
          border: `1px solid ${P.lineStrong}`,
          color: P.ink,
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)',
          ...style,
        }}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className="athletic-tap absolute right-4 top-4 flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 28,
              height: 28,
              color: P.inkMuted,
              background: P.surfaceHi,
              border: `1px solid ${P.line}`,
            }}
            aria-label="Sluiten"
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1, fontWeight: 700 }}>×</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DarkDialogPortal>
  )
})

export function DarkDialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 pr-8', className)}
      style={{ marginBottom: 16 }}
      {...props}
    >
      {children}
    </div>
  )
}

export function DarkDialogFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2 gap-2', className)}
      style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${P.line}` }}
      {...props}
    >
      {children}
    </div>
  )
}

export const DarkDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DarkDialogTitle({ className, style, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('athletic-display', className)}
      style={{
        color: P.ink,
        fontSize: 22,
        fontWeight: 900,
        letterSpacing: '-0.02em',
        lineHeight: '26px',
        textTransform: 'uppercase',
        ...style,
      }}
      {...props}
    />
  )
})

export const DarkDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DarkDialogDescription({ className, style, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={className}
      style={{ color: P.inkMuted, fontSize: 13, lineHeight: '19px', ...style }}
      {...props}
    />
  )
})

// ─── Tabs (radix-based, dark-themed) ────────────────────────────────────────

export const DarkTabs = TabsPrimitive.Root

export const DarkTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function DarkTabsList({ className, style, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex items-center justify-start gap-1 overflow-x-auto rounded-xl p-1',
        className,
      )}
      style={{
        backgroundColor: P.surface,
        border: `1px solid ${P.line}`,
        ...style,
      }}
      {...props}
    />
  )
})

export const DarkTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function DarkTabsTrigger({ className, style, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'athletic-mono athletic-tap dark-tab inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      style={{
        fontSize: 11,
        letterSpacing: '0.14em',
        fontWeight: 900,
        textTransform: 'uppercase',
        ...style,
      }}
      {...props}
    />
  )
})

/** Side-effect: kleurt de DarkTabsTrigger via data-state — één keer injecteren. */
if (typeof document !== 'undefined' && !document.getElementById('dark-ui-styles')) {
  const el = document.createElement('style')
  el.id = 'dark-ui-styles'
  el.textContent = `
    .dark-tab[data-state="inactive"] { color: ${P.inkMuted}; background: transparent; }
    .dark-tab[data-state="inactive"]:hover { color: ${P.ink}; background: ${P.surfaceHi}; }
    .dark-tab[data-state="active"] { color: ${P.bg}; background: ${P.lime}; }
  `
  document.head.appendChild(el)
}

export const DarkTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function DarkTabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn('mt-3 focus-visible:outline-none', className)}
      {...props}
    />
  )
})

// ─── Chart helpers (recharts-agnostic theming) ──────────────────────────────

export const DARK_CHART_COLORS = {
  primary: P.lime,
  secondary: P.ice,
  warning: P.gold,
  danger: P.danger,
  accent: P.purple,
  grid: P.line,
  gridStrong: P.lineStrong,
  axis: P.inkDim,
  label: P.inkMuted,
  tooltipBg: P.surfaceHi,
  tooltipBorder: P.lineStrong,
  tooltipText: P.ink,
} as const

/**
 * Tokens die je kunt doorgeven aan recharts primitives.
 * Gebruik: `<CartesianGrid {...DARK_CHART_STYLES.grid} />` of los per prop.
 */
export const DARK_CHART_STYLES = {
  grid: {
    stroke: DARK_CHART_COLORS.grid,
    strokeDasharray: '3 3',
    vertical: false,
  },
  axis: {
    stroke: DARK_CHART_COLORS.axis,
    tick: { fill: DARK_CHART_COLORS.label, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: DARK_CHART_COLORS.grid },
  },
  tooltip: {
    contentStyle: {
      backgroundColor: DARK_CHART_COLORS.tooltipBg,
      border: `1px solid ${DARK_CHART_COLORS.tooltipBorder}`,
      borderRadius: 12,
      color: DARK_CHART_COLORS.tooltipText,
      fontSize: 12,
      padding: '8px 12px',
    },
    labelStyle: {
      color: DARK_CHART_COLORS.label,
      fontSize: 10,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.12em',
      marginBottom: 4,
    },
    itemStyle: {
      color: DARK_CHART_COLORS.tooltipText,
      fontSize: 12,
      padding: 0,
    },
    cursor: { stroke: DARK_CHART_COLORS.gridStrong, strokeDasharray: '3 3' },
  },
} as const

/**
 * Drop-in custom tooltip content voor Recharts.
 * Werkt met `<Tooltip content={<DarkChartTooltip />} />`.
 */
export function DarkChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string }>
  label?: string | number
  valueFormatter?: (v: number | string) => string
  labelFormatter?: (v: string | number) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div
      style={{
        background: P.surfaceHi,
        border: `1px solid ${P.lineStrong}`,
        borderRadius: 12,
        padding: '10px 12px',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
      }}
    >
      {label !== undefined && (
        <div
          className="athletic-mono"
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            fontWeight: 700,
            color: P.inkMuted,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: entry.color ?? P.lime,
                display: 'inline-block',
              }}
            />
            {entry.name && (
              <span
                className="athletic-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                  color: P.inkMuted,
                  textTransform: 'uppercase',
                }}
              >
                {entry.name}
              </span>
            )}
            <span
              style={{
                color: P.ink,
                fontSize: 13,
                fontWeight: 800,
                marginLeft: 'auto',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {valueFormatter && typeof entry.value !== 'undefined'
                ? valueFormatter(entry.value)
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
