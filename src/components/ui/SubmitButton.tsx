"use client";

import { useFormStatus } from "react-dom";

/**
 * Bouton d'envoi d'un formulaire simple (action qui redirige) : demande une
 * confirmation si besoin, et se désactive pendant l'envoi pour éviter un double clic.
 */
export function SubmitButton({
  children,
  confirm,
  className,
}: {
  children: React.ReactNode;
  confirm?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
