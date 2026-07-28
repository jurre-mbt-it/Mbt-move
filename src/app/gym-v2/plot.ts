import { WEEKS, type Week } from './data'

export type Pad = { l: number; r: number; t: number; b: number }
export type Scale = {
  w: number
  h: number
  pad: Pad
  x: (i: number) => number
  y: (v: number) => number
}

/** Lineaire schaal over twaalf weken horizontaal en 0-100 verticaal. */
export function makeScale(w: number, h: number, pad: Pad): Scale {
  return {
    w,
    h,
    pad,
    x: (i) => pad.l + (i / (WEEKS.length - 1)) * (w - pad.l - pad.r),
    y: (v) => h - pad.b - (v / 100) * (h - pad.t - pad.b),
  }
}

export type Pt = { x: number; y: number }

export function points(s: Scale, key: 'fit' | 'fat'): Pt[] {
  return WEEKS.map((d: Week, i) => ({ x: s.x(i), y: s.y(d[key]) }))
}

export function toPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
}

/**
 * Exacte lengte van een polyline. De lijnen zijn puur M/L, dus de som van de
 * segmenten klopt tot op de pixel. Daarmee kan de intekenanimatie in CSS,
 * zonder JavaScript en zonder getTotalLength() op een gerenderd element.
 */
export function pathLength(pts: Pt[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return Math.round(len)
}

/** Vult het gebied onder een lijn tot aan de nullijn. */
export function toArea(s: Scale, pts: Pt[]): string {
  const last = pts[pts.length - 1]
  return `${toPath(pts)} L ${last.x.toFixed(1)} ${s.y(0).toFixed(1)} L ${pts[0].x.toFixed(1)} ${s.y(0).toFixed(1)} Z`
}

/** Sparkline voor één sporter, geschaald op zijn eigen minimum en maximum. */
export function sparkPath(series: number[], w = 88, h = 26) {
  const max = Math.max(...series)
  const min = Math.min(...series)
  const sx = (i: number) => 2 + (i / (series.length - 1)) * (w - 4)
  const sy = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 8)
  const line = series.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ')
  return {
    line,
    area: `${line} L ${sx(series.length - 1).toFixed(1)} ${h} L ${sx(0).toFixed(1)} ${h} Z`,
    endX: sx(series.length - 1),
    endY: sy(series[series.length - 1]),
    w,
    h,
  }
}
