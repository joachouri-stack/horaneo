import { sql } from "drizzle-orm";
import { withPlatform } from "@/db/access";

/**
 * Page de santé : le site répond et la base de données aussi. Appelée par la
 * vérification de Coolify (redémarrage si le site se bloque) et par la
 * surveillance extérieure. Ne révèle rien d'autre que « ok » ou « en panne ».
 */

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5000;

export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    await Promise.race([
      withPlatform((tx) => tx.execute(sql`select 1`)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("délai dépassé")), TIMEOUT_MS)),
    ]);
    return Response.json({ status: "ok" }, { headers });
  } catch (error) {
    console.error("Page de santé : base de données injoignable", error);
    return Response.json({ status: "down" }, { status: 503, headers });
  }
}
