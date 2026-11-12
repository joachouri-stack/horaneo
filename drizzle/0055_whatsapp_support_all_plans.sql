-- Assistance par WhatsApp incluse dans tous les packs (y compris le premier). Modifiable ensuite pack
-- par pack dans Admin → Packs. Les packs créés à partir des valeurs par défaut
-- (src/config/defaults.ts) l'ont déjà.
UPDATE plans
SET features = features || '{"whatsappSupport": true}'::jsonb, updated_at = now()
WHERE COALESCE((features->>'whatsappSupport')::boolean, false) = false;
