CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."legal_document_key" AS ENUM('legal_notice', 'privacy', 'terms');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner');--> statement-breakpoint
CREATE TYPE "public"."deposit_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'active', 'error');--> statement-breakpoint
CREATE TYPE "public"."domain_type" AS ENUM('subdomain', 'custom');--> statement-breakpoint
CREATE TYPE "public"."site_theme" AS ENUM('light', 'dark', 'nature');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('draft', 'active', 'suspended', 'cancelled', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('logo', 'cover', 'gallery', 'staff', 'service', 'other');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('active', 'replaced');--> statement-breakpoint
CREATE TYPE "public"."site_page_key" AS ENUM('home', 'about', 'team', 'gallery', 'testimonials', 'practical', 'legal');--> statement-breakpoint
CREATE TYPE "public"."time_off_kind" AS ENUM('leave', 'block', 'closure');--> statement-breakpoint
CREATE TYPE "public"."appointment_source" AS ENUM('online', 'manual');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('pending_payment', 'confirmed', 'cancelled', 'attended', 'no_show', 'expired');--> statement-breakpoint
CREATE TYPE "public"."cancelled_by" AS ENUM('customer', 'manager', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('awaiting_payment', 'awaiting_review', 'paid', 'in_creation', 'done', 'rejected', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('requires_payment', 'processing', 'succeeded', 'canceled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('email', 'sms', 'push');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'failed', 'blocked_quota');--> statement-breakpoint
CREATE TYPE "public"."update_request_status" AS ENUM('new', 'in_progress', 'done', 'rejected');--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"key" "legal_document_key" NOT NULL,
	"locale" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"price_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"interval" "billing_interval" DEFAULT 'month' NOT NULL,
	"stripe_price_id" text,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_price_positive" CHECK ("plans"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status_code" smallint DEFAULT 301 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_status_code" CHECK ("redirects"."status_code" in (301, 302, 307, 308))
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"type" "domain_type" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"cloudflare_hostname_id" text,
	"ssl_status" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_domains_hostname_lowercase" CHECK ("tenant_domains"."hostname" = lower("tenant_domains"."hostname"))
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"min_notice_minutes" integer DEFAULT 120 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"slot_interval_minutes" smallint DEFAULT 15 NOT NULL,
	"max_services_per_booking" smallint DEFAULT 3 NOT NULL,
	"cancellation_deadline_hours" integer DEFAULT 24 NOT NULL,
	"deposit_enabled" boolean DEFAULT false NOT NULL,
	"deposit_type" "deposit_type" DEFAULT 'percent' NOT NULL,
	"deposit_value" integer DEFAULT 30 NOT NULL,
	"hold_minutes" smallint DEFAULT 10 NOT NULL,
	"daily_summary_enabled" boolean DEFAULT true NOT NULL,
	"monthly_summary_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_min_notice" CHECK ("tenant_settings"."min_notice_minutes" >= 0),
	CONSTRAINT "tenant_settings_max_advance" CHECK ("tenant_settings"."max_advance_days" between 1 and 730),
	CONSTRAINT "tenant_settings_slot_interval" CHECK ("tenant_settings"."slot_interval_minutes" between 5 and 120),
	CONSTRAINT "tenant_settings_max_services" CHECK ("tenant_settings"."max_services_per_booking" between 1 and 10),
	CONSTRAINT "tenant_settings_deposit_value" CHECK ("tenant_settings"."deposit_value" >= 0),
	CONSTRAINT "tenant_settings_deposit_percent" CHECK ("tenant_settings"."deposit_type" <> 'percent' or "tenant_settings"."deposit_value" <= 100),
	CONSTRAINT "tenant_settings_hold" CHECK ("tenant_settings"."hold_minutes" between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"siret" text,
	"vat_number" text,
	"status" "tenant_status" DEFAULT 'draft' NOT NULL,
	"plan_id" uuid NOT NULL,
	"country" char(2) DEFAULT 'FR' NOT NULL,
	"default_locale" text DEFAULT 'fr' NOT NULL,
	"enabled_locales" text[] DEFAULT ARRAY['fr']::text[] NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"phone" text,
	"email" text,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"city" text,
	"latitude" double precision,
	"longitude" double precision,
	"business_category" text,
	"template_key" text DEFAULT 'wellness' NOT NULL,
	"theme" "site_theme" DEFAULT 'light' NOT NULL,
	"brand" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stripe_account_id" text,
	"stripe_charges_enabled" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"deletion_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_format" CHECK ("tenants"."slug" ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$')
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"replaced_by_id" uuid,
	"purge_after" timestamp with time zone,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "assets_bytes_positive" CHECK ("assets"."bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"slug" jsonb NOT NULL,
	"description" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"duration_minutes" smallint NOT NULL,
	"buffer_minutes" smallint DEFAULT 0 NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"price_from" boolean DEFAULT false NOT NULL,
	"is_online_bookable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "services_duration" CHECK ("services"."duration_minutes" between 5 and 1440),
	CONSTRAINT "services_buffer" CHECK ("services"."buffer_minutes" between 0 and 240),
	CONSTRAINT "services_price" CHECK ("services"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"page_key" "site_page_key" NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seo_title" jsonb,
	"seo_description" jsonb,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bio" jsonb,
	"photo_asset_id" uuid,
	"user_id" uuid,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "staff_services" (
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "staff_services_tenant_id_staff_id_service_id_pk" PRIMARY KEY("tenant_id","staff_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"text" jsonb NOT NULL,
	"rating" smallint,
	"date" timestamp with time zone,
	"is_published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonials_rating" CHECK ("testimonials"."rating" is null or "testimonials"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_hours_weekday" CHECK ("opening_hours"."weekday" between 1 and 7),
	CONSTRAINT "opening_hours_range" CHECK ("opening_hours"."opens_at" < "opening_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "staff_schedules" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_schedules_weekday" CHECK ("staff_schedules"."weekday" between 1 and 7),
	CONSTRAINT "staff_schedules_range" CHECK ("staff_schedules"."starts_at" < "staff_schedules"."ends_at"),
	CONSTRAINT "staff_schedules_validity" CHECK ("staff_schedules"."valid_from" is null or "staff_schedules"."valid_until" is null or "staff_schedules"."valid_from" <= "staff_schedules"."valid_until")
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid,
	"kind" time_off_kind NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_off_range" CHECK ("time_off"."starts_at" < "time_off"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "appointment_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"service_id" uuid,
	"position" smallint NOT NULL,
	"service_name" jsonb NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"buffer_minutes" smallint DEFAULT 0 NOT NULL,
	"price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_items_duration" CHECK ("appointment_items"."duration_minutes" > 0),
	CONSTRAINT "appointment_items_price" CHECK ("appointment_items"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"status" "appointment_status" NOT NULL,
	"source" "appointment_source" NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"total_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"promo_code_id" uuid,
	"manage_token_hash" char(64),
	"cancelled_at" timestamp with time zone,
	"cancelled_by" "cancelled_by",
	"cancellation_reason" text,
	"rescheduled_from_id" uuid,
	"locale" text DEFAULT 'fr' NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "appointments_range" CHECK ("appointments"."starts_at" < "appointments"."ends_at" and "appointments"."ends_at" <= "appointments"."blocked_until"),
	CONSTRAINT "appointments_amounts" CHECK ("appointments"."total_cents" >= 0 and "appointments"."discount_cents" >= 0 and "appointments"."deposit_cents" >= 0 and "appointments"."deposit_cents" <= "appointments"."total_cents"),
	CONSTRAINT "appointments_hold" CHECK ("appointments"."status" <> 'pending_payment' or "appointments"."hold_expires_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"notes" text,
	"email_consent" boolean DEFAULT false NOT NULL,
	"sms_consent" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "customers_phone_e164" CHECK ("customers"."phone" is null or "customers"."phone" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "customers_contact" CHECK ("customers"."email" is not null or "customers"."phone" is not null)
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" jsonb,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "promo_codes_value" CHECK ("promo_codes"."discount_value" > 0),
	CONSTRAINT "promo_codes_percent" CHECK ("promo_codes"."discount_type" <> 'percent' or "promo_codes"."discount_value" <= 100),
	CONSTRAINT "promo_codes_uses" CHECK ("promo_codes"."max_uses" is null or "promo_codes"."used_count" <= "promo_codes"."max_uses")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"tenant_id" uuid NOT NULL,
	"period" char(7) NOT NULL,
	"online_bookings" integer DEFAULT 0 NOT NULL,
	"sms_sent" integer DEFAULT 0 NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_tenant_id_period_pk" PRIMARY KEY("tenant_id","period"),
	CONSTRAINT "usage_counters_period" CHECK ("usage_counters"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"activity" text NOT NULL,
	"phone" text NOT NULL,
	"current_website" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"status" "order_status" NOT NULL,
	"stripe_checkout_session_id" text,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid,
	"stripe_payment_intent_id" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"application_fee_cents" integer DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "payment_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "payments_amount" CHECK ("payments"."amount_cents" > 0 and "payments"."application_fee_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"stripe_refund_id" text,
	"amount_cents" integer NOT NULL,
	"reason" text,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount" CHECK ("refunds"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"account" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"commitment_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"tenant_id" uuid,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"status" "backup_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"size_bytes" bigint,
	"storage_key" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "message_log" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid,
	"appointment_id" uuid,
	"channel" "message_channel" NOT NULL,
	"template_key" text NOT NULL,
	"recipient" text NOT NULL,
	"locale" text NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "update_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"attachment_asset_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"status" "update_request_status" DEFAULT 'new' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."service_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_photo_fk" FOREIGN KEY ("tenant_id","photo_asset_id") REFERENCES "public"."assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staff_fk" FOREIGN KEY ("tenant_id","staff_id") REFERENCES "public"."staff_members"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_service_fk" FOREIGN KEY ("tenant_id","service_id") REFERENCES "public"."services"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_staff_fk" FOREIGN KEY ("tenant_id","staff_id") REFERENCES "public"."staff_members"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_staff_fk" FOREIGN KEY ("tenant_id","staff_id") REFERENCES "public"."staff_members"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_appointment_fk" FOREIGN KEY ("tenant_id","appointment_id") REFERENCES "public"."appointments"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_service_fk" FOREIGN KEY ("tenant_id","service_id") REFERENCES "public"."services"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_fk" FOREIGN KEY ("tenant_id","staff_id") REFERENCES "public"."staff_members"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_promo_code_fk" FOREIGN KEY ("tenant_id","promo_code_id") REFERENCES "public"."promo_codes"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduled_from_fk" FOREIGN KEY ("tenant_id","rescheduled_from_id") REFERENCES "public"."appointments"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_fk" FOREIGN KEY ("tenant_id","appointment_id") REFERENCES "public"."appointments"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."payments"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_appointment_fk" FOREIGN KEY ("tenant_id","appointment_id") REFERENCES "public"."appointments"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_requests" ADD CONSTRAINT "update_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_requests" ADD CONSTRAINT "update_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_key_locale_version_key" ON "legal_documents" USING btree ("key","locale","version");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_key" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "memberships_tenant_idx" ON "memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "redirects_tenant_from_key" ON "redirects" USING btree ("tenant_id","from_path");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_hostname_key" ON "tenant_domains" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_one_primary_key" ON "tenant_domains" USING btree ("tenant_id") WHERE "tenant_domains"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_stripe_account_id_key" ON "tenants" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "assets_tenant_kind_idx" ON "assets" USING btree ("tenant_id","kind","status");--> statement-breakpoint
CREATE INDEX "services_tenant_category_idx" ON "services" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_tenant_page_key" ON "site_pages" USING btree ("tenant_id","page_key");--> statement-breakpoint
CREATE INDEX "staff_services_service_idx" ON "staff_services" USING btree ("tenant_id","service_id");--> statement-breakpoint
CREATE INDEX "testimonials_tenant_idx" ON "testimonials" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "opening_hours_tenant_idx" ON "opening_hours" USING btree ("tenant_id","weekday");--> statement-breakpoint
CREATE INDEX "staff_schedules_staff_idx" ON "staff_schedules" USING btree ("tenant_id","staff_id","weekday");--> statement-breakpoint
CREATE INDEX "time_off_tenant_range_idx" ON "time_off" USING btree ("tenant_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_items_position_key" ON "appointment_items" USING btree ("appointment_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_manage_token_key" ON "appointments" USING btree ("manage_token_hash");--> statement-breakpoint
CREATE INDEX "appointments_tenant_starts_idx" ON "appointments" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_tenant_staff_starts_idx" ON "appointments" USING btree ("tenant_id","staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_tenant_customer_idx" ON "appointments" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "appointments_hold_idx" ON "appointments" USING btree ("hold_expires_at") WHERE "appointments"."status" = 'pending_payment';--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_email_key" ON "customers" USING btree ("tenant_id",lower("email")) WHERE "customers"."email" is not null;--> statement-breakpoint
CREATE INDEX "customers_tenant_phone_idx" ON "customers" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_tenant_code_key" ON "promo_codes" USING btree ("tenant_id",upper("code"));--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_session_key" ON "orders" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_payment_intent_key" ON "payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "payments_appointment_idx" ON "payments" USING btree ("tenant_id","appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_stripe_refund_key" ON "refunds" USING btree ("stripe_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_key" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "message_log_tenant_created_idx" ON "message_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_log_once_per_appointment_key" ON "message_log" USING btree ("appointment_id","channel","template_key") WHERE "message_log"."appointment_id" is not null and "message_log"."status" <> 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "update_requests_tenant_created_idx" ON "update_requests" USING btree ("tenant_id","created_at");