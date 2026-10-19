import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Exam, ClassSession } from "./types";

export type PublishedDoc<T = unknown> = {
  id: string;
  kind: "timetable" | "datesheet";
  title: string;
  version: string;
  departments: { name: string } | null;
  published_at: string | null;
  data: T[];
};

async function fetchPublished<T>(
  kind: "timetable" | "datesheet",
): Promise<PublishedDoc<T>[]> {
  const { data, error } = await supabase
    .from("schedule_documents")
    .select("id, kind, title, version, departments(name), published_at, data")
    .eq("kind", kind)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  const docs = (data ?? []) as unknown as PublishedDoc<T>[];
  // Latest published version per department wins.
  const byDept = new Map<string, PublishedDoc<T>>();
  for (const doc of docs) {
    const key = doc.departments?.name ?? doc.title;
    if (!byDept.has(key)) byDept.set(key, doc);
  }
  return [...byDept.values()];
}

export function usePublishedTimetables() {
  return useQuery({
    queryKey: ["published", "timetable"],
    queryFn: () => fetchPublished<ClassSession>("timetable"),
    staleTime: 60_000,
  });
}

export function usePublishedDatesheets() {
  return useQuery({
    queryKey: ["published", "datesheet"],
    queryFn: () => fetchPublished<Record<string, unknown>>("datesheet"),
    staleTime: 60_000,
  });
}

// ── Row → model mappers (published documents store raw admin-reviewed rows) ──

/** Normalizes raw stored rows (from AI parsing or manual entry) into ClassSession[]. */
export function timetableRowsToSessions(
  rows: Record<string, unknown>[],
): ClassSession[] {
  const out: ClassSession[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const cls = String(r.cls ?? "").trim();
    const code = String(r.code ?? "").trim();
    const day = String(r.day ?? "").trim();
    const start = String(r.start ?? "").trim();
    const end = String(r.end ?? "").trim();
    if (!cls || !code || !day || !start || !end) continue;
    out.push({
      cls,
      code: code.toUpperCase(),
      title: String(r.title ?? code).trim() || code,
      day: day as ClassSession["day"],
      start,
      end,
      room: String(r.room ?? "").trim(),
      kind: (String(r.kind ?? "theory") === "lab"
        ? "lab"
        : "theory") as ClassSession["kind"],
      instructor: String(r.instructor ?? "").trim(),
      note: String(r.note ?? "").trim(),
      inferred: Boolean(r.inferred),
    });
  }
  return out;
}

const TIME_RE = /^\d{1,2}:\d{2}$/;

/** Normalizes raw stored rows (time or start/end, rooms array or csv) into Exam[]. */
export function datesheetRowsToExams(rows: Record<string, unknown>[]): Exam[] {
  const out: Exam[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const date = String(r.date ?? "").trim();
    const prog = String(r.prog ?? "").trim();
    const sem = Number(r.sem ?? 0) || 0;
    if (!date || !prog || !sem) continue;
    let time = String(r.time ?? "").trim();
    const start = String(r.start ?? "").trim();
    const end = String(r.end ?? "").trim();
    if (!time && TIME_RE.test(start) && TIME_RE.test(end))
      time = `${start}-${end}`;
    if (!time) continue;
    const sec = String(r.sec ?? "").trim();
    const course = String(r.course ?? "").trim();
    const code = String(r.code ?? "").trim();
    if (!course && !code) continue;
    let rooms: string[] = [];
    if (Array.isArray(r.rooms)) rooms = r.rooms.map(String);
    else if (typeof r.rooms === "string")
      rooms = r.rooms.split(/[,;]\s*/).filter(Boolean);
    out.push({
      date,
      time,
      prog,
      sem,
      sec,
      course: course || code,
      code,
      rooms,
      instructor: String(r.instructor ?? "").trim(),
    });
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
}
