/**
 * Daily stress-score (Athlytic-stijl) uit hartslag t.o.v. rust-HR.
 *
 * Puur welzijnssignaal, GEEN diagnose. Model: cardiovasculaire "silent workload"
 * tijdens inactiviteit. We mappen elke (rustende) HR-meting naar 0–100 via
 * percentage hartslagreserve (%HRR / Karvonen):
 *
 *     score = clamp( (bpm − rustHR) / (maxHR − rustHR), 0..1 ) × 100
 *
 * Actieve/workout-periodes worden client-side al uitgesloten (alleen rust telt,
 * net als Athlytic). Banden volgen Athlytic: 0–25 laag · 26–50 matig ·
 * 51–74 verhoogd · 75+ hoog. Zie research-memo stress-meter.
 */

export type StressBand = 'low' | 'moderate' | 'elevated' | 'high';

export type StressBucket = { m: number; bpm: number };
export type StressSample = { m: number; v: number };

export function stressScore(bpm: number, restingHr: number, maxHr: number): number {
  const reserve = maxHr - restingHr;
  if (reserve <= 0) return 0;
  const hrr = (bpm - restingHr) / reserve;
  return Math.round(Math.max(0, Math.min(1, hrr)) * 100);
}

export function stressBand(score: number): StressBand {
  if (score <= 25) return 'low';
  if (score <= 50) return 'moderate';
  if (score <= 74) return 'elevated';
  return 'high';
}

/** p-percentiel (0..1) van een getallenreeks; voor de rust-HR-schatting. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Rust-HR bepalen voor de dag: expliciete waarde wint; anders het 10e percentiel
 * van de dag-HR (een redelijke rustproxy); anders een neutrale 60.
 */
export function resolveRestingHr(explicit: number | null | undefined, dayBpm: number[]): number {
  if (explicit && explicit > 0) return explicit;
  if (dayBpm.length >= 4) return Math.round(percentile(dayBpm, 0.1));
  return 60;
}

export type StressDayResult = {
  avgScore: number;
  restingHeartRate: number;
  samples: StressSample[];
  timeInBands: Record<StressBand, number>; // seconden per band
};

/**
 * Bereken de dag-stress uit gebucketde HR (elk bucket = `bucketMinutes` min,
 * workouts al uitgesloten). Retourneert null bij te weinig data.
 */
export function computeStressDay(
  buckets: StressBucket[],
  opts: { restingHr: number | null | undefined; maxHr: number; bucketMinutes?: number },
): StressDayResult | null {
  if (buckets.length < 3) return null;
  const bucketMinutes = opts.bucketMinutes ?? 30;
  const restingHr = resolveRestingHr(opts.restingHr, buckets.map((b) => b.bpm));
  const samples: StressSample[] = [];
  const timeInBands: Record<StressBand, number> = { low: 0, moderate: 0, elevated: 0, high: 0 };
  let sum = 0;
  for (const b of buckets) {
    const v = stressScore(b.bpm, restingHr, opts.maxHr);
    samples.push({ m: b.m, v });
    timeInBands[stressBand(v)] += bucketMinutes * 60;
    sum += v;
  }
  samples.sort((a, b) => a.m - b.m);
  return {
    avgScore: Math.round(sum / buckets.length),
    restingHeartRate: restingHr,
    samples,
    timeInBands,
  };
}
