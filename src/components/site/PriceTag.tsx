/**
 * Prix d'une prestation ; en promotion, l'ancien prix barré à côté du prix réduit.
 * `wasLabel` est lu par les lecteurs d'écran (« au lieu de 55 € »).
 */
export function PriceTag({
  price,
  was,
  wasLabel,
  className = "",
}: {
  price: string;
  was?: string | null;
  wasLabel?: string;
  className?: string;
}) {
  if (!was) return <span className={className}>{price}</span>;
  return (
    <span className={`inline-flex flex-wrap items-baseline justify-end gap-x-2 ${className}`}>
      <s className="text-[0.85em] font-normal text-site-muted" aria-hidden="true">
        {was}
      </s>
      <span>{price}</span>
      {wasLabel && <span className="sr-only">{wasLabel}</span>}
    </span>
  );
}
