import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Coordonnées saisies sur la page de commande quand la personne n'est pas
 * connectée : elle commande sans créer de compte au préalable. Son compte est
 * retrouvé (même adresse e-mail) ou créé ; elle y accède ensuite par le lien
 * de connexion reçu par e-mail.
 */
export const orderCustomerInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
});

export type OrderCustomerInput = z.input<typeof orderCustomerInput>;

/** Compte de la personne qui commande : celui de son adresse e-mail, sinon un nouveau. */
export async function findOrCreateOrderCustomer(
  tx: Transaction,
  raw: OrderCustomerInput,
  locale: string,
): Promise<string> {
  const input = orderCustomerInput.parse(raw);
  const name = `${input.firstName} ${input.lastName}`;
  const [existing] = await tx
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(sql`lower(${users.email})`, input.email));
  if (existing) {
    // Compte existant : son nom n'est jamais remplacé par celui saisi ici, seulement complété.
    if (!existing.name) await tx.update(users).set({ name }).where(eq(users.id, existing.id));
    return existing.id;
  }
  const [created] = await tx
    .insert(users)
    .values({ email: input.email, name, locale })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created) return created.id;
  // Créé au même instant par une autre commande : on reprend ce compte.
  const [again] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, input.email));
  return again.id;
}
