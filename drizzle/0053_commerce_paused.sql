-- Commerce mis en pause (pas encore disponible) : il n'apparaît plus sur le site commercial (réglage modifiable
-- ensuite dans Admin → Réglages → Solutions). Sans réglage enregistré, la valeur par défaut
-- (src/config/defaults.ts) s'applique déjà. Remis en « Disponible » le jour de son lancement.
UPDATE platform_settings
SET value = (
    SELECT jsonb_agg(
      CASE WHEN item->>'code' = 'commerce' THEN jsonb_set(item, '{status}', '"hidden"') ELSE item END
    )
    FROM jsonb_array_elements(value) AS item
  ),
  updated_at = now()
WHERE key = 'solutions' AND jsonb_typeof(value) = 'array';
