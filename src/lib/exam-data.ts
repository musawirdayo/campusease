// Client-side engine for the built-in per-student exam dataset.
//
// PRIVACY MODEL: the full dataset never reaches the browser any more. It used
// to live at public/data/exams-fa26-mids.json (names + reg numbers + rooms +
// seats for every student, downloaded by every visitor); it now ships only in
// the server bundle. Search returns a limited list of matching names/rolls;
// only an exact selection returns that student's papers, room, and seat.
//
// Design notes:
//  - string tables keep the dataset compact; resolvePaper() turns indices into
//    typed papers (server side).
//  - normalizeReg() accepts the many ways students type their reg no:
//    "fa25-bcs-065", "FA25-BCS-65", "CIIT/FA25-BCS-065/ISB", spacing included.
//  - Students with clashing papers sit them sequentially in the Clash Room;
//    the seat string ("CR-01 2nd 09:50-11:10") carries the real timing, which
//    effectiveStart() extracts so the sheet always shows when they actually sit.
import type { ClassSession } from "./types";
import type { Picked } from "./timetable";
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

// ─── Search and exact lookup via the server ───────────────────────────────
export const LOOKUP_URL = "/api/lookup?reg=";
export const SEARCH_URL = "/api/lookup?q=";

export type StudentSuggestion = { core: string; name: string };

export function searchStudentSuggestionsRemote(
  input: string,
): Promise<StudentSuggestion[]> {
  const query = input.trim();
  if (query.length < 2) return Promise.resolve([]);
  return fetch(`${SEARCH_URL}${encodeURIComponent(query)}`, {
    cache: "no-store",
  }).then(async (r) => {
    if (r.status === 429)
      throw new Error("Too many lookups — wait a moment and try again.");
    if (!r.ok) throw new Error(`Student search unavailable (HTTP ${r.status})`);
    const result = (await r.json()) as { suggestions?: StudentSuggestion[] };
    return result.suggestions ?? [];
  });
}

export function lookupStudentRemote(input: string): Promise<StudentLookup> {
  const core = normalizeReg(input);
  if (!core)
    return Promise.resolve({
      kind: "invalid",
      input: String(input ?? "").trim(),
    });
  return fetch(`${LOOKUP_URL}${encodeURIComponent(core)}`, {
    cache: "no-store",
  }).then(async (r) => {
    if (r.status === 429)
      throw new Error("Too many lookups — wait a moment and try again.");
    if (!r.ok) throw new Error(`Seating plan unavailable (HTTP ${r.status})`);
    return r.json() as Promise<StudentLookup>;
  });
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
  | { kind: "invalid"; input: string }
  | { kind: "unknown"; reg: string };

export type StudentRec = {
  reg: string; // full CIIT/…/ISB form
  core: string;
  name: string;
  papers: Paper[];
};

// Search suggestions reveal only a matching name and roll number. The exact
// lookup below is still required before showing papers, room, or seat details.

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

/** The single entry point: resolve a typed registration number.
 *  Exact matches only — unknown numbers return nothing about anyone else. */
export function lookupStudent(ds: ExamDataset, input: string): StudentLookup {
  const core = normalizeReg(input);
  if (!core) return { kind: "invalid", input: String(input ?? "").trim() };
  const reg = regIndex(ds).get(core);
  if (reg) return { kind: "found", reg, student: studentFromDataset(ds, reg) };
  return { kind: "unknown", reg: fullForm(core) };
}

// ─── Ordering / grouping helpers ─────────────────────────────────────────
export function slotStart(slot: string): number {
  const m = slot.match(/^(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : 0;
}

const DAY_MS = 86_400_000;

/** Format a date using the viewer's local calendar rather than UTC. */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Whole days from today to the paper (negative = past). */
export function daysUntil(date: string, now = new Date()): number {
  const then = new Date(`${date}T00:00:00`);
  if (isNaN(then.getTime())) return 0;
  const dayNumber = (value: Date) =>
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS;
  return dayNumber(then) - dayNumber(now);
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

// ─── Human formatting (12h times everywhere students look) ───────────────

/** "08:30-09:50" → "8:30 AM–9:50 AM" (en dash, 12h). */
export function i12(slot: string): string {
  const conv = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return t;
    let h = +m[1];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m[2]} ${ampm}`;
  };
  const [a, b] = slot.split("-");
  return `${conv(a ?? "")}–${conv(b ?? "")}`;
}

/** "2026-11-02" → "2 Nov 2026". */
export function dateView(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return isNaN(d.getTime())
    ? date
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

/**
 * Seat cell, humanized: clash-room seats carry a 24h window raw
 * ("CR-01 2nd 09:50-11:10") → shown as "Clash Room 01 · 2nd sitting · 9:50 AM–11:10 AM".
 * Ordinary seats pass through unchanged.
 */
export function seatView(seat: string): string {
  const m = seat.match(/^CR-(\d+) (1st|2nd) (\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (m)
    return `Clash Room ${m[1]} · ${m[2]} sitting · ${i12(`${m[3]}-${m[4]}`)}`;
  return seat || "—";
}

// ─── Student profile meta (derived, never invented) ───────────────────────
const CLASS_TOKEN = /^([A-Za-z]{2,4})[- ]?(\d{1,2})([A-Za-z]{0,2})$/;

/** "BCT-3A" → { prog: BCT, sem: 3, sec: A } · "BCS-6AB" → sec AB. */
export function parseStudentClass(token: string): {
  prog: string;
  sem: number;
  sec: string;
} {
  const m = String(token ?? "")
    .trim()
    .match(CLASS_TOKEN);
  if (!m) return { prog: "", sem: 0, sec: "" };
  return {
    prog: m[1].toUpperCase(),
    sem: parseInt(m[2], 10),
    sec: m[3].toUpperCase(),
  };
}

/** "FA25" → Fall 2025 · "SP23" → Spring 2023 (batch = intake term). */
export function batchOf(core: string): string {
  const m = core.match(/^([A-Za-z]{2})(\d{2})-/);
  if (!m) return "";
  const term = m[1].toUpperCase();
  const name = term === "FA" ? "Fall" : term === "SP" ? "Spring" : term;
  return `${name} 20${m[2]}`;
}

export const ORDINALS = [
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "12th",
];
export const ordinalSem = (n: number) =>
  n >= 1 && n <= 12 ? `${ORDINALS[n - 1]}` : n ? String(n) : "";

export type StudentMeta = {
  prog: string;
  sem: number;
  sec: string;
  primaryClass: string; // the class grouping most of their papers
  classes: string[]; // every class grouping they sit with
  intake: string; // "Fall 2025"
};

/** Profile facts derived only from the seating plan + reg number. */
export function studentMeta(student: StudentRec): StudentMeta {
  const tally = new Map<string, number>();
  for (const p of student.papers)
    if (p.cls && p.cls !== "—") tally.set(p.cls, (tally.get(p.cls) ?? 0) + 1);
  const classes = [...tally.keys()].sort();
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const primary = sorted[0]?.[0] ?? classes[0] ?? "";
  const t = primary
    ? parseStudentClass(primary)
    : { prog: "", sem: 0, sec: "" };
  return {
    prog: t.prog,
    sem: t.sem,
    sec: t.sec,
    primaryClass: primary,
    classes,
    intake: batchOf(student.core),
  };
}

// ─── Course-level facts (section-independent) ──────────────────────────────

/** A course the roll number is examined in, with the class its paper sat in. */
export type StudentCourse = { code: string; title: string; cls: string };

/**
 * The unique set of courses a roll number is examined in this term — derived
 * ONLY from the seating plan. Each course is pinned by its own paper's class
 * token, so a “BCS-4A” student who is improving a 3rd-semester paper (or was
 * seated with a mismatched group) keeps their REAL combination instead of
 * inheriting a whole section roster.
 */
export function studentCourses(papers: Paper[]): StudentCourse[] {
  const byCode = new Map<string, StudentCourse>();
  for (const p of sortPapers(papers)) {
    if (!p.code || byCode.has(p.code)) continue;
    byCode.set(p.code, { code: p.code, title: p.title, cls: p.cls });
  }
  return [...byCode.values()];
}

/**
 * "BCT-3A" exists in the timetable either exactly or as its section-less
 * base "BCT-3" (the CS timetable lists most non-CS programs without sections).
 */
export function normalizeTtClass(cls: string, available: Set<string>): string {
  if (available.has(cls)) return cls;
  const t = parseStudentClass(cls);
  const base = t.sec ? `${t.prog}-${t.sem}` : cls;
  if (t.sec && available.has(base)) return base;
  // section-inless class token like "BCT-3" → try adding the largest section
  for (const c of [...available].sort()) {
    if (c.startsWith(`${base}-`) || (base === cls && c === base)) return c;
  }
  return "";
}

/**
 * Build a student's weekly timetable picks: every timetable session whose
 * class is one of the student's class groups, grouped per (class, course).
 */
function sessionsToPicks(
  sessions: Array<{
    cls: string;
    code: string;
    title: string;
    day: string;
    start: string;
    end: string;
    kind?: string;
    room?: string;
    instructor?: string;
    inferred?: boolean;
    note?: string;
  }>,
  classes: string[],
): Picked[] {
  const classSet = new Set(classes);
  const byKey = new Map<
    string,
    { cls: string; code: string; title: string; sessions: Picked["sessions"] }
  >();
  for (const s of sessions) {
    if (!classSet.has(s.cls)) continue;
    const key = `${s.cls}|${s.code}`;
    const row = byKey.get(key) ?? {
      cls: s.cls,
      code: s.code,
      title: s.title,
      sessions: [] as Picked["sessions"],
    };
    row.sessions.push({
      ...s,
      day: s.day as ClassSession["day"],
      room: s.room ?? "",
      note: s.note ?? "",
      inferred: !!s.inferred,
      sid: key + "#" + s.day + s.start,
    } as Picked["sessions"][number]);
    byKey.set(key, row);
  }
  return [...byKey.values()].map((r) => ({
    id: r.code + "@" + r.cls,
    ...r,
  }));
}

// ─── Weekly timetable per roll number ──────────────────────────────

const SEASON_OF: Record<string, string> = { FA: "Fall", SP: "Spring" };

export type StudentTimetable = {
  reg: string;
  /** every timetable class we resolved for this student, e.g. ["BCS-3A"] */
  matched: string[];
  /** sibling sections the student could belong to if disambiguation failed */
  options: string[];
  picks: Picked[];
  program: string | null;
  batch: string | null;
};

/**
 * Weekly timetable for a CS-dept roll number: "FA25-BCS-065" → their class
 * section's sessions for the term. Loads the timetable chunk on demand.
 * `preferCls` = cls tokens from the student's exam papers, which pin the exact
 * section ("BCS-3A") when the timetable has siblings ("BCS-3B").
 */
export async function buildStudentTimetable(
  core: string,
  preferCls?: Iterable<string> | null,
): Promise<StudentTimetable> {
  const empty: StudentTimetable = {
    reg: core,
    matched: [],
    options: [],
    picks: [],
    program: null,
    batch: null,
  };
  const m = core.match(/^([A-Z]{2})(\d{2})-([A-Z]{2,4})-(\d{3})$/);
  if (!m) return empty;
  const [, seas, yy, prog] = m;
  const batch = `${SEASON_OF[seas]} 20${yy}`;
  const { CS_CLASSES, CS_SESSIONS } = await import("@/lib/cs-timetable");
  const own = CS_CLASSES.filter((c) => c.prog === prog && c.batch === batch);
  if (!own.length) return { ...empty, program: prog, batch };

  const prefer = new Set(preferCls ?? []);
  const hit = own.filter((c) => prefer.has(c.id));
  const chosen = hit.length ? hit : own;
  const ids = chosen.map((c) => c.id);

  return {
    reg: core,
    matched: ids,
    options: hit.length || own.length <= 1 ? [] : own.map((c) => c.id),
    picks: sessionsToPicks(CS_SESSIONS, ids).sort((a, b) =>
      a.code.localeCompare(b.code),
    ),
    program: prog,
    batch,
  };
}

// ─── Course-level weekly timetable (no section assumption) ───────────────────

export type CourseWeek = {
  /** courses found in the term's timetable, as editable weekly picks */
  picks: Picked[];
  /** courses not found in the timetable (old batches, repeats, other campus) */
  missing: StudentCourse[];
};

/**
 * Build a weekly timetable from the papers themselves — the student's EXACT
 * course combination, resolved per (course, class) instead of via a section
 * roster. Each paper's class token tries, in order:
 *   1. exact class match in the timetable,
 *   2. section-less/base tolerance ("BCT-3A" → "BCT-3"),
 *   3. another class of the same program + semester,
 * and anything left over lands in `missing` rather than being invented.
 */
export async function coursesWeek(papers: Paper[]): Promise<CourseWeek> {
  const { CS_SESSIONS } = await import("@/lib/cs-timetable");
  const picks: Picked[] = [];
  const missing: StudentCourse[] = [];

  for (const c of studentCourses(papers)) {
    const cls = resolveTimetableCls(c.code, c.cls, CS_SESSIONS);
    if (!cls) {
      missing.push(c);
      continue;
    }
    const forCode = CS_SESSIONS.filter((s) => s.code === c.code);

    const seenSid = new Set<string>();
    const sessions: Picked["sessions"] = [];
    for (const s of forCode) {
      if (s.cls !== cls) continue;
      const sid = `${c.code}@${cls}#${s.day}#${s.start}#${s.end}#${s.kind ?? ""}`;
      if (seenSid.has(sid)) continue;
      seenSid.add(sid);
      sessions.push({
        ...s,
        day: s.day as ClassSession["day"],
        room: s.room ?? "",
        note: s.note ?? "",
        inferred: !!s.inferred,
        sid,
      });
    }
    if (!sessions.length) {
      missing.push(c);
      continue;
    }
    picks.push({
      id: `${c.code}@${cls}`,
      cls,
      code: c.code,
      title: forCode[0]?.title || c.title,
      sessions,
    });
  }

  picks.sort((a, b) => a.code.localeCompare(b.code));
  return { picks, missing };
}

/**
 * Shared tolerant class resolution (exact → section-less base → same
 * program+semester). Used by coursesWeek() and courseDetails(); "" = no match.
 */
function resolveTimetableCls(
  code: string,
  paperCls: string,
  sessions: Array<{ code: string; cls: string }>,
): string {
  const forCode = sessions.filter((s) => s.code === code);
  const classSet = new Set(forCode.map((s) => s.cls));
  let cls = classSet.has(paperCls)
    ? paperCls
    : normalizeTtClass(paperCls, classSet);
  if (!cls) {
    const t = parseStudentClass(paperCls);
    cls = classSet.size
      ? ([...classSet].find((k) => {
          const kt = parseStudentClass(k);
          return !!t.prog && kt.prog === t.prog && kt.sem === t.sem;
        }) ?? "")
      : "";
  }
  return cls;
}

// ─── Course detail: instructors & weekly load per course ───────────────────

export type CourseDetail = {
  code: string;
  title: string;
  cls: string; // class the exam paper sat with (seating plan)
  timetableCls: string; // resolved timetable class ("" when not matched)
  instructors: string[];
  weeklyDays: string[]; // e.g. ["Mon","Wed"]
  sessionsPerWeek: number;
  matched: boolean;
};

/**
 * Everything useful we know about each course the student is examined in.
 * Instructors come from the official timetable (matched per course, with the
 * same tolerant class resolution as coursesWeek — empty when unavailable:
 * the profile never invents a name).
 */
export async function courseDetails(papers: Paper[]): Promise<CourseDetail[]> {
  const { CS_SESSIONS } = await import("@/lib/cs-timetable");
  return studentCourses(papers).map((c) => {
    const timetableCls = resolveTimetableCls(c.code, c.cls, CS_SESSIONS);
    const rel = CS_SESSIONS.filter(
      (s) => s.code === c.code && s.cls === timetableCls,
    );
    const instructors = [
      ...new Set(
        rel.map((s) => String(s.instructor ?? "").trim()).filter(Boolean),
      ),
    ];
    return {
      code: c.code,
      title: c.title,
      cls: c.cls,
      timetableCls,
      instructors,
      weeklyDays: [...new Set(rel.map((s) => s.day))],
      sessionsPerWeek: rel.length,
      matched: rel.length > 0,
    };
  });
}

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
      `SUMMARY:${icsEsc(`${p.code || p.title}${p.title && p.code ? " — " + p.title : ""} (${i12(p.room === "Clash Room" ? (p.effectiveSlot ?? p.slot) : p.slot)})`)}`,
      `LOCATION:${icsEsc(`${paperView.room(p)} · seat ${seatView(p.seat)}`)}`,
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
