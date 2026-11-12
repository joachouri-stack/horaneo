-- Pack Pro : la traduction du site dans d'autres langues et le chatbot ne sont pas inclus
-- (traduction réservée au pack Business ; chatbot ajouté plus tard). Modifiable ensuite
-- dans Admin → Packs. Les valeurs par défaut (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET features = features || '{"aiChatbot": false, "multilingual": false}'::jsonb,
  limits = limits - 'chatbotQuestions' - 'extraLanguages',
  updated_at = now()
WHERE code = 'pro';
