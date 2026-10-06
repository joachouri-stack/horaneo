/** Présentation d'une catégorie découpée en blocs : paragraphes, et les lignes « - … » en listes. */
export type DetailBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export function detailBlocks(text: string): DetailBlock[] {
  const blocks: DetailBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const item = line.match(/^[-•]\s*(.+)$/)?.[1];
    const last = blocks.at(-1);
    if (item && last?.kind === "ul") last.items.push(item);
    else if (item) blocks.push({ kind: "ul", items: [item] });
    else blocks.push({ kind: "p", text: line });
  }
  return blocks;
}
