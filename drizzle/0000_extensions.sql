-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Génération d'identifiants UUID version 7 (triables par date).
-- PostgreSQL 18 la fournit nativement ; cette fonction la remplace en version 16.
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  unix_ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
BEGIN
  bytes := overlay(bytes PLACING substring(int8send(unix_ms) FROM 3) FROM 1 FOR 6);
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112);
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  RETURN encode(bytes, 'hex')::uuid;
END
$$;
