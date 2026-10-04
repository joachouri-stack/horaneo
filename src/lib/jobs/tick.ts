import "server-only";
import { after } from "next/server";
import { env, publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { brevoSenders } from "@/lib/messages/brevo";
import { storage } from "@/lib/storage";
import { purgeReplacedAssets } from "@/modules/media/purge";
import { dispatchMessages } from "@/modules/messages/dispatch";
import {
  expireAllHolds,
  queueEmailReminders,
  queueSmsReminders,
  queueSummaries,
} from "@/modules/messages/schedule";

/**
 * Tâche planifiée, lancée toutes les 5 minutes (voir README) :
 * libère les créneaux non payés, prépare les rappels et les résumés, envoie
 * les messages en attente et supprime les photos remplacées depuis plus de 7 jours.
 * Chaque étape peut être rejouée sans risque de doublon.
 */

const platform = <T>(fn: Parameters<typeof withPlatform<T>>[0]) => withPlatform(fn);

function dispatchOptions(now: Date) {
  return { productName: env().PRODUCT_NAME, appUrl: publicAppUrl(), now };
}

let running = false;

export async function runTick(now = new Date()) {
  if (running) return { alreadyRunning: true as const };
  running = true;
  try {
    const expired = await platform((tx) => expireAllHolds(tx, now));
    const emailReminders = await platform((tx) => queueEmailReminders(tx, now));
    const smsReminders = await platform((tx) => queueSmsReminders(tx, now));
    const summaries = await platform((tx) => queueSummaries(tx, now));
    const purged = await purgeReplacedAssets(platform, storage(), now);
    const sent = { sent: 0, skipped: 0, blocked: 0, retried: 0, failed: 0 };
    // Jusqu'à 5 lots de 50 messages par passage.
    for (let round = 0; round < 5; round += 1) {
      const result = await dispatchMessages(platform, brevoSenders, { ...dispatchOptions(now), limit: 50 });
      for (const key of Object.keys(sent) as (keyof typeof sent)[]) sent[key] += result[key];
      if (Object.values(result).reduce((sum, value) => sum + value, 0) < 50) break;
    }
    return {
      alreadyRunning: false as const,
      expired,
      emailReminders,
      smsReminders,
      summaries,
      purged,
      messages: sent,
    };
  } finally {
    running = false;
  }
}

/**
 * Envoie tout de suite (après la réponse au visiteur) les messages qui viennent
 * d'être ajoutés : la confirmation arrive en quelques secondes. La tâche
 * planifiée reprend ceux qui auraient échoué.
 */
export function sendQueuedSoon() {
  after(async () => {
    try {
      await dispatchMessages(platform, brevoSenders, { ...dispatchOptions(new Date()), limit: 20 });
    } catch (error) {
      console.error("[messages] envoi immédiat", error);
    }
  });
}
