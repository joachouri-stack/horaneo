-- Chatbot et site multilingue : retirés des fonctions annoncées « Bientôt » (choix de la
-- direction) ; le pack Business les présente comme inclus. Modifiable ensuite dans
-- Admin → Réglages → Fonctions annoncées « Bientôt ».
UPDATE platform_settings
SET value = value - 'aiChatbot' - 'multilingual', updated_at = now()
WHERE key = 'features_soon';
