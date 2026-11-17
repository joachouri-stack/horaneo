"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { askAssistantAction } from "@/app/(tenant)/sites/[tenantId]/assistant/actions";
import type { BookingLink } from "@/modules/chatbot/tools";

type Turn = { role: "user" | "assistant"; content: string; links?: BookingLink[] };

/** Longueur maximale d'une question (comme côté serveur). */
const MAX_CHARS = 600;
/** Messages gardés dans la conversation envoyée (les plus récents). */
const MAX_TURNS = 19;

/**
 * Bulle « Une question ? » du site : le visiteur pose ses questions sur
 * l'établissement et l'assistant répond. Rien n'est gardé : fermer la page
 * efface la conversation.
 */
export function ChatWidget({ businessName, contact }: { businessName: string; contact: string | null }) {
  const t = useTranslations("site.chat");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Jeton remis par le serveur à la première question, renvoyé avec les suivantes.
  const [conversation, setConversation] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [turns, pending]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const send = () => {
    const question = draft.trim().slice(0, MAX_CHARS);
    if (!question || pending) return;
    const next: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(next);
    setDraft("");
    setError(null);
    startTransition(async () => {
      // Conversation envoyée : les derniers messages, en commençant par une question.
      let history = next.slice(-MAX_TURNS);
      while (history.length > 0 && history[0].role !== "user") history = history.slice(1);
      const result = await askAssistantAction({
        messages: history.map(({ role, content }) => ({ role, content })),
        conversation,
      });
      if (!result.ok) {
        setError(tErrors(result.error));
        return;
      }
      setConversation(result.conversation);
      setTurns((current) => [
        ...current,
        { role: "assistant", content: result.reply ?? t("fallback"), links: result.links },
      ]);
    });
  };

  return (
    <div className="fixed right-4 bottom-24 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open && (
        <section
          role="dialog"
          aria-label={t("title", { name: businessName })}
          className="flex max-h-[min(34rem,calc(100dvh-9rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-site-border bg-site-bg text-site-text shadow-[0_24px_60px_-20px_rgba(0,0,0,.35)]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-site-border bg-site-panel px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{t("title", { name: businessName })}</h2>
              <p className="text-sm text-site-muted">{t("subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-site-surface"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <ol ref={list} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <li className="max-w-[85%] rounded-2xl rounded-tl-sm bg-site-surface px-3.5 py-2.5 text-[0.95rem]">
              {t("welcome")}
            </li>
            {turns.map((turn, index) => (
              <li
                key={index}
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[0.95rem] ${
                  turn.role === "user"
                    ? "ml-auto rounded-tr-sm bg-site-button text-site-on-button"
                    : "rounded-tl-sm bg-site-surface"
                }`}
              >
                <span className="sr-only">{turn.role === "user" ? t("you") : t("assistant")} : </span>
                {turn.content}
                {turn.links && turn.links.length > 0 && (
                  <span className="mt-2.5 flex flex-col gap-2">
                    {turn.links.map((link) => (
                      <a
                        key={link.serviceId}
                        href={link.href}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-site-button px-3 py-2 text-center text-sm font-semibold text-site-on-button"
                      >
                        {t("book", { service: link.serviceName })}
                      </a>
                    ))}
                  </span>
                )}
              </li>
            ))}
            {pending && (
              <li className="max-w-[85%] rounded-2xl rounded-tl-sm bg-site-surface px-3.5 py-2.5 text-[0.95rem] text-site-muted">
                {t("thinking")}
              </li>
            )}
          </ol>
          {error && (
            <p role="alert" className="mx-4 mb-2 rounded-xl bg-site-surface px-3 py-2 text-sm">
              {error}
              {contact && <> {t("contactHint", { contact })}</>}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            className="flex items-end gap-2 border-t border-site-border p-3"
          >
            <label htmlFor="assistant-question" className="sr-only">
              {t("placeholder")}
            </label>
            <textarea
              id="assistant-question"
              ref={input}
              rows={1}
              maxLength={MAX_CHARS}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={t("placeholder")}
              className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-site-border bg-site-bg px-3 py-2.5 text-[0.95rem] focus:border-site-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              aria-label={t("send")}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-site-button text-site-on-button disabled:opacity-50"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
          <p className="px-4 pb-3 text-[0.75rem] text-site-muted">{t("disclaimer")}</p>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-12 items-center gap-2 rounded-full bg-site-button px-4 font-semibold text-site-on-button shadow-[0_12px_30px_-12px_rgba(0,0,0,.45)]"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {open ? t("close") : t("open")}
      </button>
    </div>
  );
}
