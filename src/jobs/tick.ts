import "dotenv/config";

/**
 * Lance la tâche planifiée une fois, en appelant /api/cron/tick de l'application
 * en marche (`pnpm jobs:tick`). En production, Coolify fait le même appel toutes
 * les 5 minutes (voir README).
 */
async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET n'est pas définie (voir .env.example).");
  const base = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const response = await fetch(`${base}/api/cron/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Tâche planifiée refusée (${response.status}) : ${body}`);
  console.log(body);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
