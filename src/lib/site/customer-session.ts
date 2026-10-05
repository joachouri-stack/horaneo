import "server-only";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { withTenant } from "@/db/access";
import { CUSTOMER_LOGIN, readSession } from "@/modules/customer-space/auth";

/**
 * Session d'une cliente sur le site d'un professionnel : un cookie sur son
 * domaine (jamais lisible par le navigateur), relu en base à chaque visite.
 */
export const CUSTOMER_COOKIE = "espace_cliente";

export async function customerSession(tenantId: string) {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  return withTenant(tenantId, (tx) => readSession(tx, tenantId, token), undefined, null);
}

export async function customerSessionToken() {
  return (await cookies()).get(CUSTOMER_COOKIE)?.value;
}

export async function setCustomerCookie(token: string) {
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CUSTOMER_LOGIN.sessionDays * 86_400,
  });
}

export async function clearCustomerCookie() {
  (await cookies()).delete(CUSTOMER_COOKIE);
}
