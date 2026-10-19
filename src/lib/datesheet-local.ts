// Deterministic datesheet parser for the "Mid DateSheet FA26" layout
// (department D-Sheet PDFs like "Mids D-Sheet CS v1.pdf").
//
// Input is the layout-preserved text produced by lib/pdf-layout.ts:
//   @56: Date | Time | Class | Sec | ST | Course | Title | Instructor | Room | Cap. | Occ. | Block
//   @56: Mon
//   @124: 08:30-09:50 | BAE-5B | B | 37 | CSC325 | Computer Organization… | Raja… | 107 | 50 | 22 | AB-II
//   @56: 02-Nov-2026
//
// The FA26 layout is a strict column table, so it is parsed with rules instead
// of an AI model. This keeps the exam feature fully working even when AI is
// unconfigured or its provider fails — zero cost, zero latency, no invented rows.
//
// Known quirks handled:
//  - one exam = many rows (one per room allocation) → merged into one Exam
//  - long course titles wrap and land as fragments between visual rows
//  - long instructor names ("Mehreen Fatima (Hybrid HUM102)") drift into the
//    date column, removing the instructor cell from that row
//  - class can be "—", "ALL PROGRAM 8A", or duplicated ("F | F")
//  - the merged Date cell usually repeats as its own text line above/below
//    each row; slot+date pairs form the row's decisive identity
import type { Exam } from "./types";

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

const DATE_RE = /(\d{1,2})[-–]([A-Za-z]{3})[-–](\d{4})/;
const SLOT_RE = /^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}$/;
const CODE_RE = /^[A-Z]{2,4}\d{3}[A-Z]?$/;
const ROOM_RE =
  /^([1-9]\d{0,2}|[Gg]-?\d{1,2}|[Cc][Ll]-?\d{1,2}|G-\d{2}|CL-\d{1,2}|Seminar|Lab[\w -]*)$/;
const SEC_WORDS = new Set([
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "R",
  "AB",
  "G",
  "—",
  "-",
]);
const HONORIFIC = /^(Mr|Mrs|Ms|Miss|Dr|Prof|Hafiza|Engr|Sir|Madam|TA)\b/i;

function normDate(tok: string): string | null {
  const m = tok.match(DATE_RE);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const day = parseInt(m[1], 10);
  if (day < 1 || day > 31) return null;
  return `${m[3]}-${month}-${String(day).padStart(2, "0")}`;
}

const isCode = (t: string) => CODE_RE.test(t.replace(/\s+/g, ""));
const isNum = (t: string) => /^\d{1,4}$/.test(t);
const isRoom = (t: string) => ROOM_RE.test(t.replace(/\s+/g, "")) || t === "—";

/** "BAE-5B" → { prog: BAE, sem: 5, sec: B } · "ALL PROGRAM 8A" → { prog: ALL, sem: 8 } */
export function parseClassToken(cls: string): {
  prog: string;
  sem: number;
  sec: string;
} {
  const clean = (cls || "")
    .replace(/[-–_/]+/g, " ")
    .trim()
    .toUpperCase();
  const all = clean.match(/^(?:ALL(?:\s+PROGRAM)?\s*(\d{1,2})?)([A-Z]{1,2})?$/);
  if (all) {
    return {
      prog: "ALL",
      sem: all[1] ? parseInt(all[1], 10) : 0,
      sec: all[2] ?? "",
    };
  }
  // Repeater-style tokens with no semester digit: "BS-R", "Phy-R" → prog BS/PHY, sec R.
  const rpt = clean.match(/^([A-Z]{2,4})\s*R$/);
  if (rpt) return { prog: rpt[1], sem: 0, sec: "R" };
  const std = clean.match(/^([A-Z]{2,4})\s*(\d{1,2})([A-Z]{1,2})?$/);
  if (std) {
    return {
      prog: std[1],
      sem: parseInt(std[2], 10),
      sec: std[3] ?? "",
    };
  }
  return { prog: clean || "", sem: 0, sec: "" };
}

type Cand = {
  date: string;
  slot: string;
  cls: string;
  prog: string;
  sem: number;
  sec: string;
  code: string;
  title: string;
  instructor: string;
  rooms: string[];
  /** mid cell held a wrapped instructor start ("Mehmood Anwar (Hybrid"). */
  unbalancedInstr: boolean;
};

const DAY_TOKEN =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/i;

/** Non-date, non-day fragments drifting around a row (merged-cell spillover). */
// Natural reading order: nearest line ABOVE first, then nearest line BELOW.
function looksLikeClassToken(t: string): boolean {
  return /^[A-Z]{2,4}-(\d{1,2})[A-Z]{1,2}?$/.test(t.replace(/\s/g, ""));
}
function fragPieces(lines: string[], li: number, k: number): string[] {
  const out: string[] = [];
  for (const offset of [-k, k]) {
    const line = lines[li + offset] ?? "";
    for (const piece of line.split(/\s+\|\s+/)) {
      const t = piece.trim();
      if (!t || DAY_TOKEN.test(t) || DATE_RE.test(t)) continue;
      out.push(t);
    }
  }
  return out;
}

/** Parse one data row given cell splits (first cell = time slot). */
function parseRow(cells: string[], date: string | null): Cand | null {
  if (!date || !cells.length || !SLOT_RE.test(cells[0])) return null;
  const tail = cells
    .slice(1)
    .map((c) => c.trim())
    .filter(Boolean);
  if (tail.length < 3) return null;

  // locate the course code
  let codeIdx = -1;
  for (let i = 0; i < tail.length; i++) {
    if (isCode(tail[i])) {
      codeIdx = i;
      break;
    }
  }
  if (codeIdx < 0) return null;

  // cells before the code: [class, sec, st] (class may be missing)
  const pre = tail.slice(0, codeIdx);
  let cls = "";
  let secRaw = "";
  let stIdx = 1; // index of ST inside `pre`
  if (pre.length >= 2 && SEC_WORDS.has(pre[1].toUpperCase())) {
    cls = pre[0];
    secRaw = pre[1];
    stIdx = 2;
  } else if (pre.length >= 1 && SEC_WORDS.has(pre[0].toUpperCase())) {
    cls = "";
    secRaw = pre[0];
    stIdx = 1;
  } else {
    cls = pre[0] ?? "";
    secRaw = pre[1] ?? "";
    stIdx = 2;
  }
  const st = pre[stIdx] && isNum(pre[stIdx]) ? pre[stIdx] : "";

  // anchor the end: [... room, cap, occ, block]
  // walk back over numerics: last = occ (num, often 1..100), block = string
  let roomIdx = -1;
  for (let i = tail.length - 1; i >= codeIdx + 2; i--) {
    if (
      isNum(tail[i]) &&
      isNum(tail[i - 1]) &&
      (typeof tail[i + 1] === "string" || true)
    ) {
      // tail[i]=Occ, tail[i-1]=Cap → room at i-2
      if (i - 2 > codeIdx) {
        roomIdx = i - 2;
        break;
      }
    }
  }
  if (roomIdx < 0) {
    // fallback: first room-looking cell after the code
    for (let i = codeIdx + 1; i < tail.length; i++) {
      if (isRoom(tail[i])) {
        roomIdx = i;
        break;
      }
    }
  }
  if (roomIdx < 0) return null;

  // middle segment = title / instructor slots
  const mid = tail.slice(codeIdx + 1, roomIdx);
  const lastMid = mid.length ? mid[mid.length - 1] : "";
  // A single mid cell that reads like an honorific name = instructor only
  // (title wrapped away); two-or-more cells = title, instructor.
  let title = "";
  let instructor = "";
  if (mid.length === 1) {
    if (HONORIFIC.test(lastMid)) instructor = lastMid;
    else title = lastMid;
  } else {
    title = mid.slice(0, mid.length - 1).join(" ");
    instructor = lastMid || "";
  }
  // An unbalanced "Name (Hybrid" cell is a wrapped instructor START, not a
  // title; its tail (e.g. "HUM102)") drifts to a neighbouring line.
  const unbalanced = /\([^)]*$/.test(instructor || title);

  const room = tail[roomIdx].replace(/\s+/g, "");
  const rooms = room && room !== "—" ? [room] : [];

  const parsed = parseClassToken(cls);
  return {
    date,
    slot: cells[0].replace(/\s/g, ""),
    cls: cls || "",
    prog: parsed.prog,
    sem: parsed.sem,
    // the printed Sec column wins over a token's embedded section
    sec: (secRaw || "").toUpperCase() || parsed.sec,
    code: tail[codeIdx],
    title: title.trim(),
    instructor: instructor.trim(),
    rooms,
    unbalancedInstr: unbalanced,
  };
}

/**
 * Deterministic parse of the FA26 mid-datesheet layout.
 * Returns exams merged across their room-allocation rows.
 */
export function parseMidDatesheet(rawText: string): {
  department: string;
  exams: Exam[];
} {
  const lines = rawText.split("\n").map((l) => l.replace(/^@\d+:\s*/, ""));
  const dept = lines.find((l) => /department\s+of\s+[A-Za-z]/i.test(l));
  const department =
    dept?.match(/department\s+of\s+([A-Za-z ]+)/i)?.[1]?.trim() ?? "";

  const merged = new Map<string, Cand>();
  for (let li = 0; li < lines.length; li++) {
    const cells = lines[li]
      .split(/\s+\|\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
    // replicate the FA26 pattern: the slot may be preceded by the day name
    // ("Mon | 08:30-09:50 | …") in the same visual row
    const slotAt = cells.findIndex((c) => SLOT_RE.test(c.replace(/\s/g, "")));
    if (slotAt < 0) continue;
    const rowCells = cells.slice(slotAt);

    // the row's date: same line, else ±2 lines around it
    let date = rowCells.map(normDate).find(Boolean) ?? null;
    for (let k = 1; !date && k <= 2; k++) {
      const below = normDate(lines[li + k] ?? "");
      if (below) {
        date = below;
        break;
      }
      const above = normDate(lines[li - k] ?? "");
      if (above) date = above;
    }

    let cand = parseRow(rowCells, date);
    if (!cand) continue;

    const around = fragPieces(lines, li, 1);

    // class recovery pass 1: full token ("BCS-2B") or bare suffix ("8A") that
    // wrapped onto a neighbouring line
    if (!cand.cls) {
      const full = around.find((p) => looksLikeClassToken(p)) ?? null;
      const hasAll = around.some((p) => /ALL\s+PROGRAM/i.test(p));
      const suffix =
        full ?? around.find((p) => /^\d{1,2}[A-Z]{1,2}$/.test(p)) ?? null;
      if (hasAll || suffix) {
        const token = `${hasAll ? "ALL PROGRAM" : ""}${hasAll && suffix ? " " : ""}${suffix ?? ""}`;
        const parsed = parseClassToken(token);
        cand = {
          ...cand,
          cls: token,
          prog: parsed.prog,
          sem: parsed.sem,
          ...(!cand.sec && parsed.sec ? { sec: parsed.sec } : {}),
        };
      }
    }

    // class recovery pass 2: the class cell wrapped out, but a full
    // "Prog-SemSec" token sits on a line a bit further away.
    if (!cand.cls) {
      const aroundWide = [
        ...fragPieces(lines, li, 1),
        ...fragPieces(lines, li, 2),
      ];
      const wideFull = aroundWide.find((p) => looksLikeClassToken(p));
      if (wideFull) {
        const wantSec = cand.sec;
        const parsedWide = parseClassToken(wideFull);
        if (!wantSec || parsedWide.sec === wantSec) {
          cand = {
            ...cand,
            cls: wideFull,
            prog: parsedWide.prog,
            sem: parsedWide.sem,
            sec: parsedWide.sec || wantSec,
          };
        }
      }
    }

    // fragment bookkeeping: a class-suffix piece is consumed by the class hint
    const consumed = new Set<string>();
    if (cand.cls) {
      // account for every fragment that contributed to the recovered class
      for (const p of around)
        if (
          /ALL\s+PROGRAM/i.test(p) ||
          /^\d{1,2}[A-Z]{1,2}$/.test(p) ||
          looksLikeClassToken(p)
        )
          consumed.add(p);
    }
    const frags = around.filter((p) => !consumed.has(p));

    // wrapped fragments reattach to the field the row is missing
    if (cand.instructor && !cand.title && frags.length) {
      cand.title = frags.join(" ");
    } else if (!cand.instructor && frags.length) {
      cand.instructor = frags.join(" ");
    }

    // A name that kept an unclosed "(Hybrid" belongs to the instructor field,
    // even when pdf.js left it in the title slot.
    if (/\([^)]*$/.test(cand.title)) {
      if (!cand.instructor) cand.instructor = cand.title;
      cand.title = "";
    }
    // A stray course-code tail ("HUM102) …") occasionally prefixes the
    // instructor text pulled from a drifted fragment.
    cand.instructor = cand.instructor
      .replace(/^[A-Za-z]{2,4}\d{3}[A-Z]?\)?\s*/, "")
      .replace(/\s+/g, " ")
      .trim();

    // A wrapped instructor start ("Mehmood Anwar (Hybrid") is completed by
    // its tail fragment within the fragments already consumed above, so no
    // extra reassembly is needed here — the block only guards against the
    // partial start surviving as a fake title.
    if (cand.unbalancedInstr && cand.title && !cand.instructor) {
      cand.instructor = cand.title;
      cand.title = "";
    }

    const key = `${cand.date}|${cand.slot}|${cand.prog}|${cand.sem}|${cand.sec}|${cand.code}`;
    const prev = merged.get(key);
    if (prev) {
      for (const r of cand.rooms)
        if (!prev.rooms.includes(r)) prev.rooms.push(r);
      if (cand.title.length > prev.title.length) prev.title = cand.title;
      if (cand.instructor.length > prev.instructor.length)
        prev.instructor = cand.instructor;
    } else {
      merged.set(key, cand);
    }
  }

  const exams: Exam[] = [...merged.values()]
    .map((c) => ({
      date: c.date,
      time: c.slot,
      prog: c.prog,
      sem: c.sem,
      sec: c.sec,
      course: c.title || c.code,
      code: c.code,
      rooms: c.rooms.sort(),
      instructor: c.instructor,
    }))
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
  return { department, exams };
}
