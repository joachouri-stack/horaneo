-- Fonctions annoncées mais pas encore livrées : affichées « Bientôt inclus », jamais promises comme disponibles.
-- (La liste en base datait des anciens packs ; on y ajoute celles de la grille actuelle, sans rien retirer.)
UPDATE platform_settings SET value = (
  SELECT jsonb_agg(DISTINCT k ORDER BY k) FROM (
    SELECT jsonb_array_elements_text(platform_settings.value) AS k
    UNION
    SELECT unnest(ARRAY['aiChatbot', 'whatsappAssistant', 'aiTexts', 'aiImages', 'marketingAutomation',
      'advancedCrm', 'advancedSeo', 'multilingual', 'commerce', 'formation'])
  ) keys
)
WHERE key = 'features_soon';
--> statement-breakpoint
-- Starter : contacts clients illimités (sinon la réservation en ligne s'arrête à la 50e nouvelle cliente).
UPDATE plans SET limits = limits || '{"customers": null}'::jsonb WHERE code = 'starter';
