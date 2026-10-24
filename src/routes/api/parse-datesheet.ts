import { createFileRoute } from "@tanstack/react-router";
import { aiJson } from "@/lib/ai-json.server";
import { clientIp, rateLimit } from "@/lib/rate-limit.server";

// Per IP: 5/min burst, 10/hour, 30/day (see parse-timetable for rationale).
function tooMany(): Response {
  return Response.json(
    { error: "Too many parses right now — please wait and try again." },
    { status: 429 },
  );
}
import { parseMidDatesheet } from "@/lib/datesheet-local";
import { auditExams } from "@/lib/exam-utils";
import type { Exam } from "@/lib/types";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["department", "exams"],
  properties: {
    department: { type: "string" },
    exams: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "date",
          "start",
          "end",
          "prog",
          "sem",
          "sec",
          "course",
          "code",
          "rooms",
          "instructor",
        ],
        properties: {
          date: {
            type: "string",
            description:
              "Calendar date as printed, e.g. 2026-11-02 or 02-Nov-2026",
          },
          start: { type: "string", description: "HH:MM 24h" },
          end: { type: "string", description: "HH:MM 24h" },
          prog: { type: "string" },
          sem: { type: "integer" },
          sec: { type: "string" },
          course: { type: "string" },
          code: { type: "string" },
          rooms: { type: "array", items: { type: "string" } },
          instructor: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `You convert ONE page of a university EXAM DATESHEET into structured rows.
Input is layout-preserved text: each line is a visual row, "@N:" is its x-position, " | " separates cells.

Layout A (most common, per-course seating rows):
Columns are Date | Time | Class | Sec | ST | Course | Title | Instructor | Room | Cap. | Occ. | Block.
The Date cell of a vertical merge is re-emitted as its own line ("02-Nov-2026"), and the day
("Mon") as a separate line as well — both belong to the data rows between them.
Each row is ONE class seated in ONE room, so the same exam appears in many consecutive rows.
Class tokens look like "BAE-5B" (prog BAE, sem 5, sec B), "BCS-2A", "BCS-12", "F", or
"ALL PROGRAM 8A" (applies to every program, sem 8). Numbers like ST (strength), Cap. (capacity),
Occ. (occupancy) and Block ("AB-II") are metadata — ignore them.
rooms = venue ids only (e.g. 107, G-05, CL-10); drop capacities and block names; merge ALL rooms
of equal (date, time, class, course-code) exams into one row's rooms array.
Long course titles or instructor names may wrap and drift to a neighbouring line — reattach them.

Layout B (older, grouped-by-slot):
Datesheets grouped by date and time slot (a date/slot header applies to the rows beneath it),
or a table with Date | Time | Class | Course | Room columns.

Procedure (both layouts):
1. Track the current date of each row (from its own line, its header, or the adjacent lines).
2. One output row per (date, time, class, course). Convert dates to YYYY-MM-DD
   ("02-Nov-2026" -> "2026-11-02"). Times -> 24h ("2:00 PM" -> 14:00; exams run 08:00-19:00;
   a printed "08:30-09:50" slot stays exactly that).
3. code = course code (e.g. CSC325, usually printed as its own column or in parentheses);
   course = title without the code. sec = section letter ("" if unknown); sem as integer.
4. Only output rows literally on this page. Never invent. Unknown text fields -> "".
   Unknown sem -> 0. No duplicates.
5. No datesheet content on the page -> {"department":"", "exams":[]}. Also read the
   department name from the page header when present (e.g. "Department of Computer Science").`;

function t24(t: string) {
  const m = String(t)
    .trim()
    .match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  let h = +m[1];
  if (h < 7) h += 12;
  return h > 22 || +m[2] > 59 ? null : `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Accepts "2026-11-02" or "02-Nov-2026"/"2-Nov-26" and returns YYYY-MM-DD. */
function normDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const rel = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/);
  if (!rel) return null;
  const month = MONTHS[rel[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  let year = rel[3];
  if (year.length === 2) year = `20${year}`;
  const day = parseInt(rel[1], 10);
  if (day < 1 || day > 31) return null;
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

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

type AiExam = {
  date: string;
  start: string;
  end: string;
  prog: string;
  sem: number;
  sec: string;
  course: string;
  code: string;
  rooms: string[];
  instructor: string;
};

/** Deterministic validation + one-exam-many-rooms merge. */
function cleanExams(list: AiExam[] | undefined): Exam[] {
  const merged = new Map<string, Exam>();
  for (const e of list ?? []) {
    const date = normDate(e.date);
    const s = t24(e.start);
    const en = t24(e.end);
    if (!date || !s || !en || s >= en || !e.prog || !(e.code || e.course))
      continue;
    const prog = String(e.prog)
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    const sec = String(e.sec ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const rooms = (e.rooms ?? []).map((r) => String(r).trim()).filter(Boolean);
    const key = `${date}|${s}-${en}|${prog}|${e.sem}|${sec}|${e.code}`;
    const prev = merged.get(key);
    if (prev) {
      for (const r of rooms) if (!prev.rooms.includes(r)) prev.rooms.push(r);
      if (!prev.instructor && e.instructor) prev.instructor = e.instructor;
      if (prev.course === prev.code && e.course && e.course !== e.code)
        prev.course = e.course;
      continue;
    }
    merged.set(key, {
      date,
      time: `${s}-${en}`,
      prog,
      sem: Number(e.sem) || 0,
      sec,
      course: e.course || e.code,
      code: e.code || "",
      rooms,
      instructor: e.instructor || "",
    });
  }
  return [...merged.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
}

export const Route = createFileRoute("/api/parse-datesheet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIp(request);
        if (!rateLimit(`ai-m:${ip}`, 5, 60_000).ok) return tooMany();
        if (!rateLimit(`ai-h:${ip}`, 10, 3_600_000).ok) return tooMany();
        if (!rateLimit(`ai-d:${ip}`, 30, 86_400_000).ok) return tooMany();
        const body = (await request.json().catch(() => ({}))) as {
          text?: string;
        };
        const text = String(body.text ?? "").slice(0, 60_000);
        if (text.trim().length < 20)
          return Response.json({ department: "", exams: [] });
        const r = await aiJson<{ department: string; exams: AiExam[] }>({
          system: SYSTEM,
          user: text,
          schema,
          name: "datesheet",
        });
        if (r.ok) {
          const cleaned = cleanExams(r.data.exams);
          return Response.json({
            department: r.data.department ?? "",
            exams: cleaned,
            warnings: auditExams(cleaned),
            source: "ai",
          });
        }
        // AI unavailable/failed: fall back to the deterministic FA26-layout
        // parser so the exam feature keeps working (result is labelled).
        const local = parseMidDatesheet(text);
        if (local.exams.length) {
          return Response.json({
            department: local.department,
            exams: local.exams,
            warnings: auditExams(local.exams),
            source: "rules-fallback",
            aiError: r.error,
          });
        }
        return Response.json({ error: r.error }, { status: r.status });
      },
    },
  },
});
