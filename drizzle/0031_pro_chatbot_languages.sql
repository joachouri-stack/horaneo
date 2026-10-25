-- Pro : configuration accompagnée, chatbot (20 questions et réponses), site en 2 langues de plus.
UPDATE plans SET
  features = features || '{"setupAssistance": true, "aiChatbot": true, "multilingual": true}'::jsonb,
  limits = limits || '{"chatbotQuestions": 20, "extraLanguages": 2}'::jsonb
  WHERE code = 'pro';
--> statement-breakpoint
-- Business : même chatbot (et son chatbot IA), site en 4 langues de plus (5 au total).
UPDATE plans SET limits = limits || '{"chatbotQuestions": 20, "extraLanguages": 4}'::jsonb
  WHERE code = 'business';
