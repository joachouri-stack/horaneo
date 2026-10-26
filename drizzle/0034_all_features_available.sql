-- Outils des packs désormais présentés comme inclus (plus « Bientôt inclus ») ; seuls les modules
-- Commerce et Formation restent annoncés. Réactivable fonction par fonction dans Admin → Réglages.
UPDATE platform_settings SET value = COALESCE((
  SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(platform_settings.value) AS k
  WHERE k NOT IN ('aiChatbot', 'whatsappAssistant', 'aiTexts', 'aiImages', 'marketingAutomation',
    'advancedCrm', 'advancedSeo', 'multilingual', 'stockManagement', 'accountingExport', 'cashRegisterNf525')
), '[]'::jsonb)
WHERE key = 'features_soon';
