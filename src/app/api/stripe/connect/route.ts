import { withPlatform } from "@/db/access";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { paymentGateway } from "@/lib/payments/stripe";
import type { GatewayEvent } from "@/modules/payments/gateway";
import { handleEvent, recordEventError } from "@/modules/payments/webhooks";

/**
 * Point de réception des événements Stripe des comptes connectés (acomptes,
 * remboursements, état des comptes). La signature est vérifiée avant tout.
 */
export async function POST(request: Request) {
  const gateway = paymentGateway();
  if (!gateway) return new Response("Paiements non configurés", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Signature absente", { status: 400 });

  const payload = await request.text();
  let event: GatewayEvent;
  try {
    event = gateway.parseEvent(payload, signature);
  } catch {
    return new Response("Signature invalide", { status: 400 });
  }

  try {
    const result = await withPlatform((tx) => handleEvent(tx, event, gateway));
    sendQueuedSoon();
    return Response.json({ received: true, ...result });
  } catch (error) {
    console.error("[stripe] événement", event.id, event.type, error);
    await withPlatform((tx) => recordEventError(tx, event, error)).catch(() => undefined);
    // Réponse en erreur : Stripe renverra l'événement plus tard.
    return new Response("Erreur de traitement", { status: 500 });
  }
}
