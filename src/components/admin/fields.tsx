import { ui } from "@/components/ui/styles";

/** Champs de formulaire de l'espace admin (gros, lisibles sur téléphone). */

type BaseProps = { name: string; label: string; hint?: string; required?: boolean; id?: string };

function Hint({ text }: { text?: string }) {
  return text ? <p className="mt-1 text-sm text-ink/60">{text}</p> : null;
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
}) {
  const id = props.id ?? `f-${props.name}`;
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
        className={ui.input}
      />
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
      />
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
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-ink">
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
        <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
          <Heading className="text-xl font-bold">{title}</Heading>
          <span aria-hidden="true" className="text-navy/50 transition group-open:rotate-180">
            ▾
          </span>
        </summary>
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
