-- Pack Starter : assistance par e-mail incluse, comme l'assistance WhatsApp et le service technique.
UPDATE plans SET features = features || '{"ticketSupport": true}'::jsonb WHERE code = 'starter';
