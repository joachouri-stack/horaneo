-- Pack Starter : 2 membres d'équipe (la gérante et un collaborateur) au lieu d'un seul. Modifiable
-- ensuite dans Admin → Packs. Seulement si le pack est encore à 1 membre : une limite déjà
-- changée dans l'admin n'est pas écrasée.
UPDATE plans
SET limits = jsonb_set(limits, '{members}', '2'::jsonb), updated_at = now()
WHERE code = 'starter' AND limits->>'members' = '1';
