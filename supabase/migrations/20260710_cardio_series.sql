-- Per-minuut HR/tempo-tijdreeks per gesyncte workout.
-- Voedt de HR-over-tijd grafiek + cardiac-decoupling op het activity-scherm.
-- Vorm: [{ "t": sec-vanaf-start, "hr": bpm|null, "spd": m/s|null }].
-- cardio_logs heeft al RLS (deny-all) + wordt via Prisma (owner) geschreven,
-- dus geen extra policy nodig. Idempotent.
ALTER TABLE public.cardio_logs ADD COLUMN IF NOT EXISTS series jsonb;
