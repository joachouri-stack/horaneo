import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { AppError } from "./errors";

/** « 06 12 34 56 78 » (France) → « +33612345678 ». Vide → null. */
export function normalizePhone(
  value: string | null | undefined,
  country: string,
  field = "phone",
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const phone = parsePhoneNumberFromString(raw, country.toUpperCase() as CountryCode);
  if (!phone?.isValid()) throw new AppError("phone_invalid", field);
  return phone.number;
}

/** Affichage lisible d'un numéro international (« +33 6 12 34 56 78 »). */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
