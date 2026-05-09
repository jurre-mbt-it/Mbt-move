-- Eenmalige seed: zet Jurre op isPracticeOwner=true voor zijn praktijk.
-- Veilig om opnieuw te draaien (idempotent door UPDATE-WHERE).
UPDATE public.users
SET "isPracticeOwner" = true
WHERE email = 'jurre@movementbasedtherapy.nl';

-- Check resultaat
SELECT id, email, "practiceId", "isPracticeOwner", "firstName", "lastName"
FROM public.users
WHERE email = 'jurre@movementbasedtherapy.nl';
