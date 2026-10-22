import type { Exam } from "./types";

/** "HH:MM-HH:MM" → [startMinutes, endMinutes]. */
export function examRange(time: string): [number, number] | null {
  const m = String(time).match(
    /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/,
  );
  if (!m) return null;
  const start = +m[1] * 60 + +m[2];
  const end = +m[3] * 60 + +m[4];
  return start < end ? [start, end] : null;
}

/** Two exams overlap when they share a date AND their time windows intersect. */
export function examsOverlap(a: Exam, b: Exam): boolean {
  if (a.date !== b.date || a.code === b.code) return false;
  const ra = examRange(a.time);
  const rb = examRange(b.time);
  if (!ra || !rb) return false;
  return ra[0] < rb[1] && rb[0] < ra[1];
}

/** The same class sitting the same paper under two codes in one slot —
 *  typically one shared session listed per catalog code (e.g. current
 *  CSC262 students and repeaters registered under CSC462, same course title,
 *  same instructor, often the same room). Not a clash: each student sits one
 *  paper. */
export function isSharedSlot(a: Exam, b: Exam): boolean {
  if (a.date !== b.date || a.code === b.code) return false;
  const ra = examRange(a.time);
  const rb = examRange(b.time);
  if (!ra || !rb) return false;
  const overlapping = ra[0] < rb[1] && rb[0] < ra[1];
  if (!overlapping) return false;
  return (
    a.prog === b.prog &&
    a.sem === b.sem &&
    a.sec === b.sec &&
    a.course.trim().toLowerCase() === b.course.trim().toLowerCase()
  );
}

export type ExamClash = {
  date: string;
  a: Exam;
  b: Exam;
};

/**
 * Genuine clashes within a student's personal datesheet: two DIFFERENT
 * courses (different code AND different title) for one class that run at
 * overlapping times on the same day — e.g. the v1 datesheet mistake of
 * scheduling Discrete Structures against Statistics for BCS-2A.
 *
 * The same paper under two codes (CSC262 + CSC462 for BCS-4A "Artificial
 * Intelligence") is NOT a clash — see isSharedSlot — and is filtered out.
 */
export function findExamClashes(exams: Exam[]): ExamClash[] {
  const out: ExamClash[] = [];
  for (let i = 0; i < exams.length; i++) {
    for (let j = i + 1; j < exams.length; j++) {
      if (isSharedSlot(exams[i], exams[j])) continue;
      if (examsOverlap(exams[i], exams[j]))
        out.push({ date: exams[i].date, a: exams[i], b: exams[j] });
    }
  }
  return out.sort(
    (c) => c.a.date.localeCompare(c.b.date) || c.a.time.localeCompare(c.b.time),
  );
}

export type SharedSlot = { date: string; a: Exam; b: Exam };

/**
 * Collapse shared-slot duplicates down to ONE row per paper, keeping the
 * CURRENT catalog's code.
 *
/** Same class + same course title under two codes in one slot. Shown as a
 *  neutral "one paper, registered codes" note, never as a clash. */
export function findSharedSlots(exams: Exam[]): SharedSlot[] {
  const out: SharedSlot[] = [];
  for (let i = 0; i < exams.length; i++) {
    for (let j = i + 1; j < exams.length; j++) {
      if (isSharedSlot(exams[i], exams[j]))
        out.push({ date: exams[i].date, a: exams[i], b: exams[j] });
    }
  }
  return out.sort(
    (c) => c.a.date.localeCompare(c.b.date) || c.a.time.localeCompare(c.b.time),
  );
}

/** Deduplicate rows: same (date, slot, class, code) with several rooms → one exam. */
const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

export type ExamIssue = {
  type:
    | "duplicate"
    | "missing-field"
    | "clash"
    | "same-exam-different-slot"
    | "shared-slot";
  message: string;
  /** course codes / row keys involved, for review-table cross-reference */
  rows: string[];
};

const examRowKey = (e: Exam) =>
  `${e.date}|${e.time}|${e.prog}|${e.sem}|${e.sec}|${e.code}`;

/**
 * Full health audit of a datesheet (parsed PDF rows or a published document).
 * Surfaces what a student sees AND what the admin must fix before publishing:
 *
 * - duplicates: identical rows repeated beyond the expected one-row-per-room
 *   seating pattern (e.g. page-break artefacts of the same exam),
 * - same exam listed on two different slots (rescheduled but both rows kept),
 * - rows missing prog/sem (the class cell is unreadable),
 * - clashes: different courses overlapping in the same slot for one class.
 */
export function auditExams(all: Exam[]): ExamIssue[] {
  const issues: ExamIssue[] = [];

  // duplicates: same key seen more than once with the SAME room list
  const seen = new Map<string, Exam>();
  const dupKeys = new Map<string, number>();
  for (const e of all) {
    const k = examRowKey(e);
    const rooms = [...new Set(e.rooms)].sort().join(",");
    const prev = seen.get(k);
    if (prev) {
      const prevRooms = [...new Set(prev.rooms)].sort().join(",");
      if (rooms === prevRooms) {
        dupKeys.set(k, (dupKeys.get(k) ?? 1) + 1);
      } else {
        // legitimate room rows merge instead — different rooms on an equal
        // key before dedupe are how multi-room exams appear; not an issue.
      }
    }
    seen.set(k, e);
  }
  for (const [k, n] of dupKeys) {
    issues.push({
      type: "duplicate",
      message: `Duplicate row ×${n + 1}: ${k.replace(/\|/g, " · ")}`,
      rows: [k],
    });
  }

  // same course/class on different slots/dates — likely a reschedule with a
  // stale row left behind
  const byCourse = new Map<string, Exam[]>();
  for (const e of all) {
    if (!e.code) continue;
    const k = `${e.prog}|${e.sem}|${e.sec}|${e.code}`;
    const arr = byCourse.get(k) ?? [];
    arr.push(e);
    byCourse.set(k, arr);
  }
  for (const [k, arr] of byCourse) {
    const slots = [...new Set(arr.map((e) => `${e.date} ${e.time}`))];
    if (slots.length > 1)
      issues.push({
        type: "same-exam-different-slot",
        message: `${k.replace(/\|/g, " · ")} appears in ${slots.length} different slots`,
        rows: slots,
      });
  }

  // unreadable class rows
  for (const e of all) {
    if (!e.prog || e.prog === "—")
      issues.push({
        type: "missing-field",
        message: `Row without a readable class: ${e.code} ${e.date} ${e.time}`,
        rows: [`|${e.date}|${e.time}|${e.code}`],
      });
  }

  // clashes last — genuine ones warn; known shared-code slots get a neutral
  // review line instead of a false alarm
  for (const c of findExamClashes(all))
    issues.push({
      type: "clash",
      message: `${c.date}: ${c.a.code} (${c.a.time}) ↔ ${c.b.code} (${c.b.time}) for ${c.a.prog}${c.a.sem}${c.a.sec ? "-" + c.a.sec : ""}`,
      rows: [examRowKey(c.a), examRowKey(c.b)],
    });
  for (const c of findSharedSlots(all))
    issues.push({
      type: "shared-slot",
      message: `${c.date}: ${c.a.code} + ${c.b.code} (${c.a.time}) share one slot for ${c.a.prog}${c.a.sem}${c.a.sec ? "-" + c.a.sec : ""} — likely the same paper under two registered codes, confirm before publishing`,
      rows: [examRowKey(c.a), examRowKey(c.b)],
    });

  return issues;
}

/** "02-Nov-2026" → "2026-11-02" (keeps YYYY-MM-DD untouched). */
export function normalDate(tok: string): string {
  const s = String(tok ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const day = parseInt(m[1], 10);
    if (month && day >= 1 && day <= 31) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${month}-${String(day).padStart(2, "0")}`;
    }
  }
  return s;
}

/** "8:30 AM - 9:50 AM" / "08:30-09:50" → "08:30-09:50". */
export function normalSlot(time: string): string {
  const to24 = (t: string) => {
    const m = t.trim().match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM)?$/i);
    if (!m) return null;
    let h = +m[1];
    const ap = (m[3] ?? "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  };
  const parts = String(time ?? "").split(/[-–]\s*/);
  if (parts.length === 2) {
    const a = to24(parts[0]);
    const b = to24(parts[1]);
    if (a && b) return `${a}-${b}`;
    return `${a ?? parts[0].trim()}-${b ?? parts[1].trim()}`;
  }
  return String(time ?? "").trim();
}
