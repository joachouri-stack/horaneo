/**
 * Erreur métier compréhensible : son code correspond à un texte traduit
 * (messages/<langue>.json → "errors.<code>"), et `field` désigne le champ concerné.
 */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly field?: string,
  ) {
    super(code);
  }
}

export type AppErrorCode =
  | "invalid"
  | "not_found"
  | "slug_taken"
  | "slug_reserved"
  | "slug_invalid"
  | "hostname_taken"
  | "hostname_invalid"
  | "feature_unavailable"
  | "quota_reached"
  | "last_free_plan"
  | "hours_overlap"
  | "hours_invalid"
  | "phone_invalid"
  | "image_too_large"
  | "image_unsupported"
  | "image_too_small"
  | "image_empty"
  | "category_not_empty"
  | "domain_not_active"
  | "booking_closed"
  | "booking_quota_reached"
  | "slot_unavailable"
  | "too_many_services"
  | "service_unavailable"
  | "cancellation_deadline_passed"
  | "booking_not_modifiable"
  | "rate_limited"
  | "promo_code_invalid"
  | "promo_code_taken"
  | "payments_unavailable"
  | "payment_not_refundable"
  | "payment_provider_error"
  | "subscription_active"
  | "already_customer"
  | "order_in_progress"
  | "order_not_pending"
  | "services_mixed"
  | "manager_already_linked"
  | "primary_business_only"
  | "promo_not_combinable"
  | "gift_card_not_found"
  | "gift_card_expired"
  | "gift_card_used"
  | "gift_card_insufficient"
  | "gift_cards_unavailable"
  | "gift_card_amount"
  | "reward_unavailable"
  | "login_invalid"
  | "sms_unavailable"
  | "customer_space_unavailable";
