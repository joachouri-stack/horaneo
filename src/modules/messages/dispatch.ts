import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { messageLog, pushSubscriptions, tenants, usageCounters } from "@/db/schema";
import { getPlatformSetting } from "@/modules/settings";
import { currentPeriod } from "@/modules/tenants/queries";
import { renderMessage, type MessageRow, type RenderOptions } from "./render";
import { smsSegments, type MessageSenders } from "./senders";
import { releaseSms, reserveSms, type SmsReservation } from "./sms-usage";

/**
 * Envoi des messages en attente (rôle plateforme). Chaque message est d'abord
 * « réservé » (une seconde tâche simultanée ne le prend pas), puis préparé et
 * envoyé ; en cas d'échec il est réessayé plus tard, jusqu'à un nombre maximum d'essais.
 */

export type PlatformRunner = <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;

export type DispatchResult = {
  sent: number;
  skipped: number;
  blocked: number;
  retried: number;
  failed: number;
};

/** Délai avant le prochain essai : 2, 8, 18, 32… minutes. */
function backoffMinutes(attempts: number) {
  return 2 * attempts * attempts;
}

async function claim(platform: PlatformRunner, now: Date, limit: number, ids?: string[]) {
  return platform(async (tx) => {
    const due = await tx
      .select({ id: messageLog.id })
      .from(messageLog)
      .where(
        and(
          eq(messageLog.status, "queued"),
          or(isNull(messageLog.nextAttemptAt), lte(messageLog.nextAttemptAt, now)),
          ids ? inArray(messageLog.id, ids) : undefined,
        ),
      )
      .orderBy(asc(messageLog.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    // Réservation de 10 minutes : si le serveur s'arrête pendant l'envoi, le message sera repris.
    return tx
      .update(messageLog)
      .set({
        attempts: sql`${messageLog.attempts} + 1`,
        nextAttemptAt: new Date(now.getTime() + 10 * 60_000),
      })
      .where(
        inArray(
          messageLog.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
  });
}

async function countEmail(tx: Transaction, tenantId: string, now: Date) {
  const [tenant] = await tx
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) return;
  await tx
    .insert(usageCounters)
    .values({ tenantId, period: currentPeriod(tenant.timezone, now), emailsSent: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.tenantId, usageCounters.period],
      set: { emailsSent: sql`${usageCounters.emailsSent} + 1`, updatedAt: now },
    });
}

async function finish(
  platform: PlatformRunner,
  row: MessageRow,
  values: Partial<typeof messageLog.$inferInsert>,
) {
  await platform((tx) => tx.update(messageLog).set(values).where(eq(messageLog.id, row.id)));
}

async function processOne(
  platform: PlatformRunner,
  senders: MessageSenders,
  row: MessageRow,
  options: RenderOptions & { maxAttempts: number },
  result: DispatchResult,
) {
  let sms: SmsReservation | null = null;
  try {
    const rendered = await platform((tx) => renderMessage(tx, row, options));
    if (rendered.kind === "skip") {
      await finish(platform, row, { status: "skipped", error: rendered.reason, nextAttemptAt: null });
      result.skipped += 1;
      return;
    }
    if (rendered.kind === "push") {
      // Chaque appareil reçoit la notification ; ceux qui n'existent plus sont oubliés.
      let delivered = 0;
      const gone: string[] = [];
      let lastError: unknown = null;
      for (const device of rendered.devices) {
        try {
          const outcome = await senders.push({
            subscription: device,
            title: rendered.title,
            body: rendered.body,
            url: rendered.url,
            tag: rendered.tag,
          });
          if (outcome.gone) gone.push(device.id);
          else delivered += 1;
        } catch (error) {
          lastError = error;
        }
      }
      if (gone.length > 0)
        await platform((tx) => tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone)));
      // Aucun appareil joint à cause d'une panne : nouvel essai plus tard (une partie reçue suffit).
      if (delivered === 0 && lastError) throw lastError;
      await finish(platform, row, {
        status: delivered > 0 ? "sent" : "skipped",
        recipient: `${delivered}/${rendered.devices.length}`,
        sentAt: delivered > 0 ? options.now : null,
        error: delivered > 0 ? null : "no_device",
        nextAttemptAt: null,
      });
      if (delivered > 0) result.sent += 1;
      else result.skipped += 1;
      return;
    }
    if (rendered.kind === "sms") {
      // Un message long compte pour chacun des SMS qu'il occupe.
      const segments = smsSegments(rendered.text);
      sms = row.tenantId
        ? await platform((tx) => reserveSms(tx, row.tenantId!, options.now, segments))
        : null;
      if (!sms) {
        await finish(platform, row, { status: "blocked_quota", recipient: rendered.to, nextAttemptAt: null });
        result.blocked += 1;
        return;
      }
      const sent = await senders.sms({ to: rendered.to, sender: rendered.sender, text: rendered.text });
      await finish(platform, row, {
        status: "sent",
        recipient: rendered.to,
        providerMessageId: sent.id,
        sentAt: options.now,
        error: null,
        nextAttemptAt: null,
      });
    } else {
      const sent = await senders.email({
        to: rendered.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        fromName: rendered.fromName,
        replyTo: rendered.replyTo,
      });
      await platform(async (tx) => {
        await tx
          .update(messageLog)
          .set({
            status: "sent",
            recipient: rendered.to.join(", "),
            providerMessageId: sent.id,
            sentAt: options.now,
            error: null,
            nextAttemptAt: null,
          })
          .where(eq(messageLog.id, row.id));
        if (row.tenantId) await countEmail(tx, row.tenantId, options.now);
      });
    }
    result.sent += 1;
  } catch (error) {
    if (sms && row.tenantId) await platform((tx) => releaseSms(tx, row.tenantId!, sms!));
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    console.error("[messages]", row.templateKey, row.id, message);
    if (row.attempts >= options.maxAttempts) {
      await finish(platform, row, { status: "failed", error: message, nextAttemptAt: null });
      result.failed += 1;
    } else {
      await finish(platform, row, {
        error: message,
        nextAttemptAt: new Date(options.now.getTime() + backoffMinutes(row.attempts) * 60_000),
      });
      result.retried += 1;
    }
  }
}

export async function dispatchMessages(
  platform: PlatformRunner,
  senders: MessageSenders,
  options: {
    productName: string;
    appUrl: string;
    now?: Date;
    limit?: number;
    ids?: string[];
    mediaUrl?: (key: string) => string;
  },
): Promise<DispatchResult> {
  const now = options.now ?? new Date();
  const maxAttempts = await platform((tx) => getPlatformSetting(tx, "message_max_attempts"));
  const rows = await claim(platform, now, options.limit ?? 50, options.ids);
  const result: DispatchResult = { sent: 0, skipped: 0, blocked: 0, retried: 0, failed: 0 };
  for (const row of rows) {
    await processOne(platform, senders, row, { ...options, now, maxAttempts }, result);
  }
  return result;
}
