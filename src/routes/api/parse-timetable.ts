import { createFileRoute } from "@tanstack/react-router";
import { aiJson } from "@/lib/ai-json.server";
import { clientIp, rateLimit } from "@/lib/rate-limit.server";

// Without this anyone with curl could burn the whole Gemini quota (each call
// is a ~90s vision parse with up to 3 retries). Per IP: 5/min burst,
// 10/hour, 30/day.
function tooMany(): Response {
  return Response.json(
    { error: "Too many parses right now — please wait and try again." },
    { status: 429 },
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Matches the strict JSON schema the model must fill (all fields required).
type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
type AiSession = {
  cls: string;
  code: string;
  title: string;
  day: string;
  start: string;
  end: string;
  room: string;
  kind: string;
  instructor: string;
};

const isDay = (value: string): value is Day =>
  (DAYS as readonly string[]).includes(value);

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["sessions"],
  properties: {
    sessions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "cls",
          "code",
          "title",
          "day",
          "start",
          "end",
          "room",
          "kind",
          "instructor",
        ],
        properties: {
          cls: {
            type: "string",
            description: "Class/section id like BEE-3A, BBA-5B",
          },
          code: { type: "string" },
          title: { type: "string" },
          day: { type: "string", enum: [...DAYS] },
          start: { type: "string", description: "HH:MM 24h" },
          end: { type: "string", description: "HH:MM 24h" },
          room: { type: "string" },
          kind: { type: "string", enum: ["theory", "lab"] },
          instructor: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `You convert ONE page of a university weekly CLASS TIMETABLE into structured sessions.
The input is layout-preserved text: each line is a visual row, "@N:" is its x-position, " | " separates cells.
Typical layouts: (a) one grid per class/section: rows = days, columns = time slots in a header row;
(b) rows = rooms/teachers with day/time columns; (c) list rows "Course | Day | Time | Room".
Procedure:
1. Find the section/class title for each grid (e.g. "BEE 3-A", "BBA-5 (B)") -> cls normalized as PROG-SEMSEC, e.g. "BEE-3A". If there is no section letter use "PROG-SEM".
2. Read the time-slot header row; map each cell to its column by x-position. A cell spanning several slots (labs) runs from the first slot's start to the last slot's end.
3. Each cell usually contains course code/title, instructor, room. A legend at page bottom may map codes to titles/instructors - use it to fill title/instructor.
4. day: Mon..Sat. Times as 24h HH:MM. University classes run 08:00-20:00: "1:00" means 13:00, "2:30" -> 14:30.
5. kind="lab" if the cell/legend says Lab or the room is a lab (CL-, Lab), else "theory".
6. Break/lunch/prayer/"Free" cells are NOT sessions. A merged cell repeated across sections must be emitted once per section.
Rules: Only output sessions literally present on this page. Never invent or guess times. Missing fields -> "". No duplicates. If the page has no timetable, return {"sessions":[]}.`;

function norm(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  let h = +m[1];
  const mm = +m[2];
  if (h < 7) h += 12;
  if (h > 23 || mm > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const Route = createFileRoute("/api/parse-timetable")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIp(request);
        if (!rateLimit(`ai-m:${ip}`, 5, 60_000).ok) return tooMany();
        if (!rateLimit(`ai-h:${ip}`, 10, 3_600_000).ok) return tooMany();
        if (!rateLimit(`ai-d:${ip}`, 30, 86_400_000).ok) return tooMany();
        const json = (b: unknown, status = 200) => Response.json(b, { status });
        const body = (await request.json().catch(() => ({}))) as {
          text?: string;
        };
        const text = String(body.text ?? "").slice(0, 60_000);
        if (text.trim().length < 20) return json({ sessions: [] });
        const r = await aiJson<{ sessions?: AiSession[] }>({
          system: SYSTEM,
          user: text,
          schema,
          name: "timetable",
        });
        if (!r.ok) return json({ error: r.error }, r.status);
        const parsed = r.data;

        // Deterministic validation layer
        const seen = new Set<string>();
        const sessions = [];
        for (const s of parsed.sessions ?? []) {
          const start = norm(s.start ?? ""),
            end = norm(s.end ?? "");
          if (!start || !end || !isDay(s.day) || !s.cls || !(s.code || s.title))
            continue;
          if (start >= end) continue;
          const dur =
            +end.slice(0, 2) * 60 +
            +end.slice(3) -
            (+start.slice(0, 2) * 60 + +start.slice(3));
          if (dur < 30 || dur > 300) continue; // implausible class length
          const cls = String(s.cls)
            .toUpperCase()
            .replace(/\s+/g, "")
            .replace(/[()]/g, "");
          const k = `${cls}|${s.code}|${s.day}|${start}`;
          if (seen.has(k)) continue;
          seen.add(k);
          sessions.push({
            ...s,
            day: s.day as Day,
            cls,
            code: s.code || s.title.slice(0, 12),
            title: s.title || s.code,
            start,
            end,
            note: "",
            inferred: false,
          });
        }
        return json({ sessions });
      },
    },
  },
});
