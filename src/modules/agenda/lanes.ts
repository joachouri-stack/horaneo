/**
 * Rendez-vous qui se chevauchent dans une colonne : côte à côte. Chaque groupe
 * de rendez-vous liés par un chevauchement est réparti en couloirs ; chacun
 * reçoit son couloir et le nombre de couloirs de son groupe.
 */
export function layoutLanes<T extends { id: string; startsAt: Date; endsAt: Date }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const result = new Map<string, { lane: number; lanes: number }>();
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = 0;
  const close = () => {
    for (const entry of group) result.set(entry.id, { lane: entry.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (group.length > 0 && item.startsAt.getTime() >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= item.startsAt.getTime());
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endsAt.getTime();
    group.push({ id: item.id, lane });
    groupEnd = Math.max(group.length === 1 ? 0 : groupEnd, item.endsAt.getTime());
  }
  close();
  return result;
}
