-- Site multilingue : pas encore développé, de nouveau annoncé « Bientôt » (audit). Le
-- chatbot, lui, est livré et reste présenté comme inclus. Modifiable ensuite dans
-- Admin → Réglages → Fonctions annoncées « Bientôt ».
UPDATE platform_settings
SET value = value || '["multilingual"]'::jsonb, updated_at = now()
WHERE key = 'features_soon' AND NOT (value ? 'multilingual');
