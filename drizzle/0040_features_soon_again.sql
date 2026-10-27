-- Fonctions des packs pas encore développées : de nouveau annoncées « Bientôt »
-- (revient sur 0034). Une promesse comme la caisse certifiée NF525 ne doit pas
-- apparaître comme incluse tant qu'elle n'existe pas. Réglable dans Admin → Réglages.
-- Sans ligne enregistrée, la valeur de départ (src/config/defaults.ts) s'applique déjà.
UPDATE platform_settings SET value = (
  SELECT jsonb_agg(DISTINCT k ORDER BY k) FROM (
    SELECT jsonb_array_elements_text(platform_settings.value) AS k
    UNION
    SELECT unnest(ARRAY['aiChatbot', 'whatsappAssistant', 'aiTexts', 'aiImages', 'marketingAutomation',
      'advancedCrm', 'advancedSeo', 'multilingual', 'stockManagement', 'accountingExport', 'cashRegisterNf525'])
  ) AS soon
)
WHERE key = 'features_soon';
