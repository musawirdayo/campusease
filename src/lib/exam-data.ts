// Client-side engine for the built-in per-student exam dataset.
//
// The dataset (public/data/exams-fa26-mids.json) is generated from the
// department's official final seating plan — every student-exam row with its
// room and seat — so a personal datesheet is ONE lookup by registration
// number. No uploads, no section picking, no clash guessing: the department
// already resolved every overlap (see clashRoom windows below).
//
// Design notes:
//  - string tables keep the JSON compact; resolvePaper() turns indices into
//    typed papers.
//  - normalizeReg() accepts the many ways students type their reg no:
//    "fa25-bcs-065", "FA25-BCS-65", "CIIT/FA25-BCS-065/ISB", spacing included.
//  - Students with clashing papers sit them sequentially in the Clash Room;
//    the seat string ("CR-01 2nd 09:50-11:10") carries the real timing, which
//    effectiveStart() extracts so the sheet always shows when they actually sit.
import { EXAM_DUAL_CODE_SLOTS, EXAM_TERM } from "./exam-meta";

export { EXAM_TERM, EXAM_DUAL_CODE_SLOTS };
export type ExamDataset = {
  term: string;
  dept: string;
  source: string;
  dates: string[];
  slots: string[];
  rooms: string[];
  classes: string[];
  courses: string[]; // "CODE|Title"
  seats: string[];
  names: string[];
  students: Record<string, [number, number[][]]>;
};

export type Paper = {
  date: string;
  slot: string; // official slot, e.g. 08:30-09:50
  code: string;
  title: string;
  cls: string; // class the paper belongs to, e.g. BCS-4B
  room: string;
  seat: string;
  /** Clash-room sessions: the actual window they sit in (from the seat). */
  effectiveSlot?: string;
  /** "1st" | "2nd" for clash-room sequential sessions. */
  clashSession?: string;
};

// ─── Dataset loading (fetched on demand, module-cached) ─────────────────────
export const EXAM_DATA_URL = "/data/exams-fa26-mids.json";

let cachePromise: Promise<ExamDataset> | null = null;

export function loadExamDataset(): Promise<ExamDataset> {
  cachePromise ??= fetch(EXAM_DATA_URL, { cache: "no-cache" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`Dataset unavailable (HTTP ${r.status})`);
      const json = (await r.json()) as ExamDataset;
      if (!json || !json.students || !json.dates?.length)
        throw new Error("Dataset is malformed");
      return json;
    })
    .catch((e) => {
      cachePromise = null; // retry next time
      throw e;
    });
  return cachePromise;
}

// ─── Registration number handling ───────────────────────────────────────────
// "FA25-BCS-065" → the canonical core every lookup key shares.
const CORE_RE = /^(\w{4})-([A-Z]{2,4})-(\d{3})$/;

/** Accepts any reasonable spelling of a registration number; returns the
 *  canonical "FA25-BCS-065" core, or null if it can't be one. */
export function normalizeReg(input: string): string | null {
  const up = String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  const stripped = up.replace(/^CIIT/, "").replace(/ISB$/, "");
  const m = stripped.match(/^([A-Z]{2}\d{2})-([A-Z]{2,4})-(\d{1,3})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3].padStart(3, "0")}`;
  // tolerate batch+candidates typed without the first dash: "FA25BCS065"
  const m2 = up
    .replace(/^CIIT/, "")
    .replace(/ISB$/, "")
    .match(/^([A-Z]{2}\d{2})([A-Z]{2,4})(\d{1,3})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3].padStart(3, "0")}`;
  return null;
}

export type StudentLookup =
  | { kind: "found"; reg: string; student: StudentRec }
  | { kind: "suggestions"; reg: string; list: Suggestion[] }
  | { kind: "invalid"; input: string }
  | { kind: "unknown"; reg: string; near: Suggestion[] };

export type StudentRec = {
  reg: string; // full CIIT/…/ISB form
  core: string;
  name: string;
  papers: Paper[];
};

export type Suggestion = { reg: string; core: string; name: string };

const fullForm = (core: string) => `CIIT/${core}/ISB`;

/** Build a fast lookup index once per dataset: core → reg. */
export function regIndex(ds: ExamDataset): Map<string, string> {
  const map = new Map<string, string>();
  for (const reg of Object.keys(ds.students)) {
    const core = normalizeReg(reg);
    if (core && !map.has(core)) map.set(core, reg);
  }
  return map;
}

function buildPaper(ds: ExamDataset, packed: number[]): Paper {
  const [d, t, c, cl, rm, st] = packed;
  const cls = ds.classes[cl] ?? "";
  const course = ds.courses[c] ?? "";
  const sep = course.indexOf("|");
  const code = sep >= 0 ? course.slice(0, sep) : course;
  const title = sep >= 0 ? course.slice(sep + 1) : "";
  const seat = ds.seats[st] ?? "";
  const cr = seat.match(/^CR-\d+ (1st|2nd) (\d{2}:\d{2}-\d{2}:\d{2})$/);
  return {
    date: ds.dates[d] ?? "",
    slot: ds.slots[t] ?? "",
    code,
    title,
    cls,
    room: ds.rooms[rm] ?? "",
    seat,
    ...(cr ? { clashSession: cr[1], effectiveSlot: cr[2] } : {}),
  };
}

export function studentFromDataset(ds: ExamDataset, reg: string): StudentRec {
  const core = normalizeReg(reg) ?? "";
  const packed = ds.students[fullForm(core)] ?? ds.students[reg];
  return {
    reg: fullForm(core),
    core,
    name: packed ? (ds.names[packed[0]] ?? "") : "",
    papers: packed ? packed[1].map((p) => buildPaper(ds, p)) : [],
  };
}

/** Closest candidate tokens to a core, for "did you mean …" hints. */
function nearMatches(ds: ExamDataset, core: string): Suggestion[] {
  const [batch, prog, num] = core.split("-");
  const out: Suggestion[] = [];
  for (const reg of Object.keys(ds.students).sort()) {
    const c = normalizeReg(reg);
    if (!c) continue;
    const [b, p, n] = c.split("-");
    if (b === batch && p === prog) {
      out.push({ reg, core: c, name: ds.names[ds.students[reg][0]] ?? "" });
      continue;
    }
    if (n === num && (p === prog || b === batch)) {
      out.push({ reg, core: c, name: ds.names[ds.students[reg][0]] ?? "" });
      continue;
    }
    if (p === prog) {
      out.push({ reg, core: c, name: ds.names[ds.students[reg][0]] ?? "" });
      continue;
    }
    if (out.length >= 5) break;
  }
  return out.slice(0, 5);
}

/** The single entry point: resolve a typed registration number. */
export function lookupStudent(ds: ExamDataset, input: string): StudentLookup {
  const core = normalizeReg(input);
  if (!core) return { kind: "invalid", input: String(input ?? "").trim() };
  const reg = regIndex(ds).get(core);
  if (reg) return { kind: "found", reg, student: studentFromDataset(ds, reg) };
  return { kind: "unknown", reg: fullForm(core), near: nearMatches(ds, core) };
}

// ─── Ordering / grouping helpers ─────────────────────────────────────────────
export function slotStart(slot: string): number {
  const m = slot.match(/^(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : 0;
}

const DAY_MS = 86_400_000;

/** Whole days from today to the paper (negative = past). */
export function daysUntil(date: string, now = new Date()): number {
  const today = Math.floor(now.getTime() / DAY_MS);
  const then = Math.floor(new Date(`${date}T00:00:00`).getTime() / DAY_MS);
  return isNaN(then) ? 0 : then - today;
}

/** Papers sorted chronologically, using the real sitting time for clash-room rows. */
export function sortPapers(papers: Paper[]): Paper[] {
  return [...papers].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      slotStart(a.effectiveSlot ?? a.slot) -
        slotStart(b.effectiveSlot ?? b.slot),
  );
}

export function groupByDay(papers: Paper[]): Array<[string, Paper[]]> {
  const byDay = new Map<string, Paper[]>();
  for (const p of sortPapers(papers)) {
    const arr = byDay.get(p.date) ?? [];
    arr.push(p);
    byDay.set(p.date, arr);
  }
  return [...byDay.entries()];
}

/** Convenience view helpers. */
export const paperView = {
  code: (p: Paper) => p.code || p.title,
  room: (p: Paper) => p.room || "Room TBA",
  isClash: (p: Paper) => !!p.clashSession,
};

// ─── Calendar export (.ics) ─────────────────────────────────────────────────
function icsDT(date: string, slot: string): [string, string] | null {
  const m = `${date} ${slot}`.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})-(\d{2}):(\d{2})$/,
  );
  if (!m) return null;
  return [
    `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`,
    `${m[1]}${m[2]}${m[3]}T${m[6]}${m[7]}00`,
  ];
}

const icsEsc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

/** Single-file calendar with every paper as an event. */
export function papersToIcs(
  papers: Paper[],
  opts: { reg: string; name: string; term: string },
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CampusEase//Personal Datesheet//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const p of sortPapers(papers)) {
    const dt = icsDT(p.date, p.effectiveSlot ?? p.slot);
    if (!dt) continue;
    const [start, end] = dt;
    const seatNote = paperView.isClash(p)
      ? ` Clash-room session ${p.clashSession} — arrive 10 min early.`
      : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:campusease-${opts.reg}-${p.date}-${p.slot}-${p.code}@campusease`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsEsc(`${p.code || p.title}${p.title && p.code ? " — " + p.title : ""} (${p.room === "Clash Room" ? p.effectiveSlot : p.slot})`)}`,
      `LOCATION:${icsEsc(`${paperView.room(p)} · seat ${p.seat}`)}`,
      `DESCRIPTION:${icsEsc(
        `${opts.name} · ${opts.term} · class ${p.cls}. Double-check with the official seating plan.${seatNote}`,
      )}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function downloadIcs(
  papers: Paper[],
  opts: { reg: string; name: string; term: string },
) {
  const blob = new Blob([papersToIcs(papers, opts)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campusease-datesheet-${opts.reg.replace(/[^\w-]/g, "")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
