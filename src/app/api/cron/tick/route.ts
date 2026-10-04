import { timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { runTick } from "@/lib/jobs/tick";

/**
 * Tâche planifiée, appelée toutes les 5 minutes par Coolify (ou `pnpm jobs:tick`
 * en local) avec l'en-tête « Authorization: Bearer <CRON_SECRET> ».
 */
export async function POST(request: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET non configurée", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Accès refusé", { status: 401 });
  }
  const result = await runTick();
  return Response.json(result);
}
