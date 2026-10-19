import type { ClassSession, Day } from "./types";

export const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_FULL: Record<Day, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

export function toMin(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

export function fmt12(t: string): string {
  if (!t) return "";
  const [hs, m] = t.split(":");
  let h = parseInt(hs, 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

export function overlaps(
  a: Pick<ClassSession, "day" | "start" | "end">,
  b: Pick<ClassSession, "day" | "start" | "end">,
) {
  return (
    a.day === b.day &&
    toMin(a.start) < toMin(b.end) &&
    toMin(b.start) < toMin(a.end)
  );
}

/** A course the student picked. Sessions are a private copy so they can be edited/relocated. */
export type Picked = {
  id: string;
  cls: string;
  code: string;
  title: string;
  sessions: (ClassSession & { sid: string; edited?: boolean })[];
};

export type Clash = {
  a: { pickId: string; sid: string };
  b: { pickId: string; sid: string };
  day: Day;
  label: string;
};

export function findClashes(picks: Picked[]): Clash[] {
  const flat = picks.flatMap((p) => p.sessions.map((s) => ({ p, s })));
  const out: Clash[] = [];
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const x = flat[i],
        y = flat[j];
      if (x.p.id === y.p.id && x.s.sid === y.s.sid) continue;
      if (overlaps(x.s, y.s)) {
        out.push({
          a: { pickId: x.p.id, sid: x.s.sid },
          b: { pickId: y.p.id, sid: y.s.sid },
          day: x.s.day,
          label: `${x.p.code} (${x.p.cls}) ${fmt12(x.s.start)}–${fmt12(x.s.end)} ↔ ${y.p.code} (${y.p.cls}) ${fmt12(y.s.start)}–${fmt12(y.s.end)}`,
        });
      }
    }
  }
  return out;
}

/** Clashes a candidate set of sessions would create against current picks. */
export function candidateClashes(
  cands: ClassSession[],
  picks: Picked[],
  ignorePickId?: string,
) {
  const res: { cand: ClassSession; with: Picked; s: ClassSession }[] = [];
  for (const c of cands) {
    for (const p of picks) {
      if (p.id === ignorePickId) continue;
      for (const s of p.sessions)
        if (overlaps(c, s)) res.push({ cand: c, with: p, s });
    }
  }
  return res;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export type Fix = {
  pickId: string;
  code: string;
  from: string;
  to: string;
  before: number;
  after: number;
};

/**
 * Section swaps (same course, other section) that reduce the total number of
 * clashes. Picks whose sessions the user hand-edited are left alone — the
 * explicit edit expresses intent and must never be silently reverted.
 */
export function suggestFixes(
  picks: Picked[],
  alts: (code: string) => { cls: string; sessions: ClassSession[] }[],
): Fix[] {
  const before = findClashes(picks).length;
  if (!before) return [];
  const involved = new Set(
    findClashes(picks).flatMap((c) => [c.a.pickId, c.b.pickId]),
  );
  const out: Fix[] = [];
  for (const p of picks) {
    if (!involved.has(p.id)) continue;
    if (p.sessions.some((s) => s.edited)) continue;
    for (const a of alts(p.code)) {
      if (a.cls === p.cls) continue;
      const trial = picks.map((x) =>
        x.id === p.id
          ? {
              ...x,
              cls: a.cls,
              sessions: a.sessions.map((s) => ({ ...s, sid: uid() })),
            }
          : x,
      );
      const after = findClashes(trial).length;
      if (after < before)
        out.push({
          pickId: p.id,
          code: p.code,
          from: p.cls,
          to: a.cls,
          before,
          after,
        });
    }
  }
  return out.sort((x, y) => x.after - y.after);
}

/**
 * Greedily apply the best swap until no swap helps. Returns the new picks.
 * Manually edited picks are preserved untouched; if nothing else improved,
 * the result keeps the same clash count at minimum.
 */
export function autoResolve(
  picks: Picked[],
  alts: (code: string) => { cls: string; sessions: ClassSession[] }[],
): Picked[] {
  let cur = picks;
  let best = findClashes(cur).length;
  for (let i = 0; i < 12; i++) {
    const fixes = suggestFixes(cur, alts);
    const f = fixes[0];
    if (!f || f.after >= best) break;
    const a = alts(f.code).find((x) => x.cls === f.to)!;
    cur = cur.map((x) =>
      x.id === f.pickId
        ? {
            ...x,
            cls: a.cls,
            sessions: a.sessions.map((s) => ({ ...s, sid: uid() })),
          }
        : x,
    );
    best = f.after;
  }
  return cur;
}

/**
 * Drop duplicate sessions inside one pick (same course, day, start, end —
 * e.g. when a published PDF lists the same lecture twice). Hand-edited
 * duplicates survive — the user's edit is authoritative.
 */
export function dedupeSessions<
  S extends ClassSession & { sid: string; edited?: boolean },
>(sessions: S[]): S[] {
  const seen = new Set<string>();
  const out: S[] = [];
  for (const s of sessions) {
    const k = `${s.code}|${s.day}|${s.start}|${s.end}`;
    if (seen.has(k)) {
      if (!s.edited) continue;
      // replace the raw duplicate with the edited one
      const idx = out.findIndex(
        (o) => `${o.code}|${o.day}|${o.start}|${o.end}` === k,
      );
      if (idx >= 0) out[idx] = s;
      else out.push(s);
      continue;
    }
    seen.add(k);
    out.push(s);
  }
  return out;
}

export type DayStats = {
  daysUsed: number;
  freeDays: Day[];
  busiestDay: Day | null;
  busiestCount: number;
  earliest: number | null; // minutes since midnight
  latest: number | null; // minutes since midnight
};

/** Day-load summary of the student's week — used in the stats row and PDF. */
export function dayStats(picks: Picked[]): DayStats {
  const perDay = new Map<Day, number>();
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const s of picks.flatMap((p) => p.sessions)) {
    perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);
    const a = toMin(s.start);
    const b = toMin(s.end);
    if (earliest === null || a < earliest) earliest = a;
    if (latest === null || b > latest) latest = b;
  }
  const used = [...perDay.entries()].sort((a, b) => b[1] - a[1]);
  return {
    daysUsed: perDay.size,
    freeDays: DAYS.filter((d) => !perDay.has(d)),
    busiestDay: used[0]?.[0] ?? null,
    busiestCount: used[0]?.[1] ?? 0,
    earliest,
    latest,
  };
}
