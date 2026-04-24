-- ============================================================================
-- CIE — nieuwe regel `deload_needed` (fase 2)
-- File: supabase/migrations/20260424_cie_deload_needed_rule.sql
-- ============================================================================
-- InsightRule heeft signalType als PK. Idempotent via ON CONFLICT zodat
-- herhaald runnen veilig is + threshold-updates automatisch meegenomen.
-- ============================================================================

INSERT INTO public.insight_rules (
  "signalType",
  category,
  "defaultUrgency",
  "defaultConfig",
  "evidenceRefs",
  "enabledGlobally",
  "updatedAt"
)
VALUES (
  'deload_needed',
  'progression',
  'MEDIUM',
  '{"painAbove":5,"recentSessions":3}'::jsonb,
  ARRAY[
    'Haff GG, Triplett NT. Essentials of Strength Training and Conditioning, 4e. NSCA — deload/unload principles.',
    'Stone MH et al. Principles of deloading in resistance training. Strength & Conditioning Journal 1982.'
  ],
  true,
  now()
)
ON CONFLICT ("signalType") DO UPDATE
SET
  category         = EXCLUDED.category,
  "defaultUrgency" = EXCLUDED."defaultUrgency",
  "defaultConfig"  = EXCLUDED."defaultConfig",
  "evidenceRefs"   = EXCLUDED."evidenceRefs",
  "updatedAt"      = now();
