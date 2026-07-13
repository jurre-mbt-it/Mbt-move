-- RLS voor de hashtag-tabellen (hashtags, hashtag_usages, tag_vocabulary).
-- Prisma draait als owner en bypasst RLS; deny-all volstaat om de anon-key
-- (browserbundle) buiten de REST-API te houden. Idempotent.

ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.hashtags;
CREATE POLICY "default_deny" ON public.hashtags
  FOR ALL TO public USING (false) WITH CHECK (false);

ALTER TABLE public.hashtag_usages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.hashtag_usages;
CREATE POLICY "default_deny" ON public.hashtag_usages
  FOR ALL TO public USING (false) WITH CHECK (false);

ALTER TABLE public.tag_vocabulary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "default_deny" ON public.tag_vocabulary;
CREATE POLICY "default_deny" ON public.tag_vocabulary
  FOR ALL TO public USING (false) WITH CHECK (false);
