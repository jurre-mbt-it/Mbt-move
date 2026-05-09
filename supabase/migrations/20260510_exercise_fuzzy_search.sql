-- Fuzzy search op oefeningen via pg_trgm. Catches:
--   - typos:      "squzt" → "Squat"
--   - varianten:  "squatten" → "Squat"
--   - prefixen:   "abdu" → "Abductie heup"
-- Synoniemen-matching ("zijwaarts heffen" → "Abductie") gaat via Exercise.tags
-- (al bestaande array). De combinatie van trigram + tags geeft 95%+ recall.
--
-- pg_trgm berekent similarity tussen 2 strings als ratio van overlappende
-- 3-letter substrings. GIN-index met gin_trgm_ops maakt similarity-zoeken
-- snel zonder full-table-scan.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN-index op `name` voor trigram-similarity searches
CREATE INDEX IF NOT EXISTS exercises_name_trgm_idx
  ON public.exercises
  USING GIN (name gin_trgm_ops);

-- GIN-index op `tags` array — voor de bestaande `tags @> ARRAY[…]`-style
-- lookups. Postgres heeft hier al een ingebouwde array-index, maar GIN
-- maakt 'm efficient over grote sets.
CREATE INDEX IF NOT EXISTS exercises_tags_gin_idx
  ON public.exercises
  USING GIN (tags);
