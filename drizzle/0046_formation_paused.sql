-- Formation mise en pause : elle n'apparaît plus sur le site commercial (réglage modifiable
-- ensuite dans Admin → Réglages → Solutions). Sans réglage enregistré, la valeur par défaut
-- (src/config/defaults.ts) s'applique déjà.
UPDATE platform_settings
SET value = (
    SELECT jsonb_agg(
      CASE WHEN item->>'code' = 'formation' THEN jsonb_set(item, '{status}', '"hidden"') ELSE item END
    )
    FROM jsonb_array_elements(value) AS item
  ),
  updated_at = now()
WHERE key = 'solutions' AND jsonb_typeof(value) = 'array';
