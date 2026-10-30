-- Export des données de l'entreprise (clientes, rendez-vous, paiements) : packs Pro et Business.
UPDATE plans SET features = features || '{"dataExport": true}'::jsonb WHERE code IN ('pro', 'business');
