/** « 10 », « 10,50 » ou « 10.5 » (euros) → 1050 centimes ; NaN si ce n'est pas un montant. */
export function parseMoney(value: string): number {
  const text = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN;
  return Math.round(Number(text) * 100);
}
