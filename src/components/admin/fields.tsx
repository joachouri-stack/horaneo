"use client";

import { createContext, Fragment, useContext, useState } from "react";
import { ui } from "@/components/ui/styles";

/** Champs de formulaire de l'espace admin (gros, lisibles sur téléphone). */

/**
 * Erreurs du dernier envoi, par nom de champ : fournies par ActionForm, affichées
 * sous chaque champ concerné.
 */
export const FieldErrorsContext = createContext<Record<string, string>>({});

type BaseProps = { name: string; label: string; hint?: string; required?: boolean; id?: string };

function Hint({ text }: { text?: string }) {
  return text ? <p className="mt-1 text-sm text-ink/70">{text}</p> : null;
}

/** Message d'erreur sous un champ, et attributs à poser sur le champ. */
function useFieldError(name: string, id: string) {
  const error = useContext(FieldErrorsContext)[name];
  const errorId = `${id}-erreur`;
  return {
    message: error ? (
      <p id={errorId} className="mt-1 text-sm font-medium text-danger-ink">
        {error}
      </p>
    ) : null,
    attributes: error ? { "aria-invalid": true as const, "aria-describedby": errorId } : {},
  };
}

export function TextField({
  type = "text",
  defaultValue,
  placeholder,
  ...props
}: BaseProps & {
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  inputMode?: "numeric" | "decimal" | "email" | "tel" | "url";
  autoComplete?: string;
  /** Pas d'un champ nombre (ex. "any" pour accepter 0,5). */
  step?: string;
  /** Liste de suggestions (identifiant d'un <datalist>). */
  list?: string;
}) {
  const id = props.id ?? `f-${props.name}`;
  const error = useFieldError(props.name, id);
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {props.label}
      </label>
      <input
        id={id}
        name={props.name}
        type={type}
        required={props.required}
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        step={props.step}
        list={props.list}
        className={ui.input}
        {...error.attributes}
      />
      {error.message}
      <Hint text={props.hint} />
    </div>
  );
}

export function TextArea({
  defaultValue,
  rows = 4,
  ...props
}: BaseProps & { defaultValue?: string | null; rows?: number }) {
  const id = props.id ?? `f-${props.name}`;
  const error = useFieldError(props.name, id);
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {props.label}
      </label>
      <textarea
        id={id}
        name={props.name}
        rows={rows}
        required={props.required}
        defaultValue={defaultValue ?? undefined}
        className={ui.input}
        {...error.attributes}
      />
      {error.message}
      <Hint text={props.hint} />
    </div>
  );
}

export function SelectField({
  options,
  defaultValue,
  ...props
}: BaseProps & { options: { value: string; label: string }[]; defaultValue?: string | null }) {
  const id = props.id ?? `f-${props.name}`;
  const error = useFieldError(props.name, id);
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {props.label}
      </label>
      <select
        id={id}
        name={props.name}
        required={props.required}
        defaultValue={defaultValue ?? undefined}
        className={ui.input}
        {...error.attributes}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error.message}
      <Hint text={props.hint} />
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
  value,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  value?: string;
}) {
  // Toute la ligne (au moins 48 px de haut) est cliquable, pas seulement la case.
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1 text-ink">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="h-6 w-6 shrink-0 accent-navy"
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Interrupteur marche/arrêt : même envoi qu'une case à cocher (« on » quand activé),
 * pour les réglages qui s'allument ou s'éteignent. Toute la ligne est cliquable.
 */
export function ToggleField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-1 text-ink">
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint && <span className="block text-sm text-ink/70">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          name={name}
          defaultChecked={defaultChecked}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="h-7 w-12 rounded-full bg-navy/20 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}

/**
 * Interrupteur qui ouvre ses réglages : les champs n'apparaissent que lorsqu'il est activé
 * (cachés, ils restent dans le formulaire et sont enregistrés tels quels).
 */
export function ToggleSection({
  name,
  label,
  hint,
  defaultChecked,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  children: React.ReactNode;
}) {
  const [on, setOn] = useState(Boolean(defaultChecked));
  return (
    <div className="space-y-4">
      <div
        onChange={(event) => {
          const target = event.target as HTMLInputElement;
          if (target.name === name) setOn(target.checked);
        }}
      >
        <ToggleField name={name} label={label} hint={hint} defaultChecked={defaultChecked} />
      </div>
      <div className="space-y-4" hidden={!on}>
        {children}
      </div>
    </div>
  );
}

/** Note de 1 à 5 en étoiles à toucher (envoyée comme un nombre). */
export function StarRating({
  name,
  legend,
  defaultValue,
  idPrefix,
}: {
  name: string;
  legend: string;
  defaultValue?: number | null;
  idPrefix: string;
}) {
  // Ordre inversé + flex-row-reverse : une étoile cochée colore aussi celles d'avant.
  return (
    <fieldset>
      <legend className="mb-1 font-medium text-night">{legend}</legend>
      <div className="flex flex-row-reverse justify-end">
        {[5, 4, 3, 2, 1].map((value) => (
          <Fragment key={value}>
            <input
              type="radio"
              id={`${idPrefix}-${name}-${value}`}
              name={name}
              value={value}
              defaultChecked={(defaultValue ?? 0) === value}
              className="peer sr-only [&:checked~label]:text-[#e0a526]"
            />
            <label
              htmlFor={`${idPrefix}-${name}-${value}`}
              className="flex size-11 cursor-pointer items-center justify-center text-[1.75rem] leading-none text-navy/20 transition peer-checked:text-[#e0a526] peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
            >
              <span aria-hidden="true">★</span>
              <span className="sr-only">{value}</span>
            </label>
          </Fragment>
        ))}
      </div>
    </fieldset>
  );
}

/** Choix multiple en pastilles (ex. prestations d'un membre) : touchée, la pastille se colore. */
export function ChipCheckboxes({
  name,
  legend,
  options,
  defaultValues,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  defaultValues: string[];
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-medium text-night">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={defaultValues.includes(option.value)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-white px-4 text-[0.9375rem] text-night transition peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Section({
  title,
  children,
  aside,
  level = 2,
  collapsible = false,
  open = false,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  /** 1 quand la section porte le titre de la page (espace gérante). */
  level?: 1 | 2;
  /** Section repliable (pages longues) ; `open` : dépliée au chargement. */
  collapsible?: boolean;
  open?: boolean;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  if (collapsible) {
    return (
      <details className={`${ui.card} group`} open={open}>
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
          <Heading className="text-xl font-bold">{title}</Heading>
          <span aria-hidden="true" className="text-navy/50 transition group-open:rotate-180">
            ▾
          </span>
        </summary>
        {aside && <div className="mt-2">{aside}</div>}
        <div className="mt-4">{children}</div>
      </details>
    );
  }
  return (
    <section className={ui.card}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <Heading className="text-xl font-bold">{title}</Heading>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Champs cachés communs (identifiant du client, d'un élément, opération). */
export function Hidden({ values }: { values: Record<string, string | undefined> }) {
  return (
    <>
      {Object.entries(values).map(([name, value]) =>
        value === undefined ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
    </>
  );
}
