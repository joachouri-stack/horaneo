/** Nom du cookie qui garde, sur l'appareil, les membres affichés dans l'agenda d'un site. */
export function agendaMembersCookie(tenantId: string) {
  return `agenda-membres-${tenantId}`;
}
