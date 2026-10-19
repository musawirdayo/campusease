import { DAYS, findClashes, toMin, type Picked } from "./timetable";
import type { Day } from "./types";

export type GridCell = {
  pick: Picked;
  session: Picked["sessions"][number];
  color: number; // index into the course palette
  col: number; // first column (0-based)
  span: number; // number of columns covered
  clash: boolean;
};

export type GridLayout = {
  days: Day[];
  cols: { start: number; end: number; free: boolean }[]; // minutes since midnight
  rows: { day: Day; lanes: GridCell[][] }[];
};

export const PALETTE_SIZE = 8;

/**
 * Builds a readable timetable table: days are rows, columns are the student's own
 * time slots (every distinct start/end time). Overlapping classes on the same day
 * get their own lane so nothing is ever hidden.
 */
export function buildGridLayout(picks: Picked[]): GridLayout {
  const clashes = findClashes(picks);
  const clashSids = new Set(clashes.flatMap((c) => [c.a.sid, c.b.sid]));
  const all = picks.flatMap((p, i) =>
    p.sessions.map((s) => ({ p, s, color: i % PALETTE_SIZE })),
  );
  const bounds = [
    ...new Set(all.flatMap((x) => [toMin(x.s.start), toMin(x.s.end)])),
  ].sort((a, b) => a - b);
  const cols = bounds
    .slice(0, -1)
    .map((start, i) => ({ start, end: bounds[i + 1], free: true }));
  const colOf = (m: number) => bounds.indexOf(m);

  const days = DAYS.filter((d) => all.some((x) => x.s.day === d));
  const rows = days.map((day) => {
    const items = all
      .filter((x) => x.s.day === day)
      .sort(
        (a, b) =>
          toMin(a.s.start) - toMin(b.s.start) ||
          toMin(b.s.end) - toMin(a.s.end),
      );
    const lanes: GridCell[][] = [];
    const laneEnd: number[] = [];
    for (const { p, s, color } of items) {
      const c0 = colOf(toMin(s.start));
      const c1 = colOf(toMin(s.end));
      for (let c = c0; c < c1; c++) cols[c].free = false;
      const cell: GridCell = {
        pick: p,
        session: s,
        color,
        col: c0,
        span: c1 - c0,
        clash: clashSids.has(s.sid),
      };
      let lane = laneEnd.findIndex((end) => end <= toMin(s.start));
      if (lane === -1) {
        lane = lanes.length;
        lanes.push([]);
        laneEnd.push(0);
      }
      lanes[lane].push(cell);
      laneEnd[lane] = toMin(s.end);
    }
    return { day, lanes };
  });
  return { days, cols, rows };
}

export const fmtMin = (m: number) => {
  const h = Math.floor(m / 60),
    mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")}`;
};
export const ampm = (m: number) => (m >= 720 ? "PM" : "AM");
