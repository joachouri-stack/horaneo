-- Chatbot du site inclus dans le pack Pro : 100 conversations par mois (500 dans le Business).
-- Modifiable ensuite dans Admin → Packs. Les valeurs par défaut (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET features = features || '{"aiChatbot": true}'::jsonb,
    limits = limits || '{"aiChatConversations": 100, "chatbotQuestions": 0}'::jsonb,
    updated_at = now()
WHERE code = 'pro';
