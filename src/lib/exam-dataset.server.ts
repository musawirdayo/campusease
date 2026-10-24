// SERVER-ONLY: the built-in exam dataset, bundled with the server bundle.
//
// The dataset contains every student's name, registration number, room and
// seat — it stays in the server bundle rather than a browser-downloadable
// asset. /api/lookup returns limited name/roll matches for search, then only
// the selected student's papers, room and seat after an exact profile lookup.
//
// CSP/imports: resolved by the bundler at build time; not readable at runtime
// from the network.
import datasetJson from "@/data/exams-fa26-mids.json";
import {
  lookupStudent,
  normalizeReg,
  type ExamDataset,
  type StudentLookup,
} from "@/lib/exam-data";

export const EXAM_DATASET = datasetJson as unknown as ExamDataset;

/** Exact registration-number lookup against the bundled dataset. */
export function findStudentExact(input: string): StudentLookup {
  return lookupStudent(EXAM_DATASET, input);
}

export type StudentSuggestion = { core: string; name: string };

/** Return a short list of matching names/rolls for type-ahead. Exam papers,
 *  room and seat details remain available only after an exact profile pick. */
export function findStudentSuggestions(
  query: string,
  limit = 8,
): StudentSuggestion[] {
  const q = query.trim().toUpperCase().replace(/\s+/g, " ");
  if (q.length < 2) return [];
  const compact = q.replace(/[^A-Z0-9]/g, "");
  const tokens = q.split(" ").filter(Boolean);
  const names: StudentSuggestion[] = [];
  const rolls: StudentSuggestion[] = [];

  for (const [reg, [nameIndex]] of Object.entries(EXAM_DATASET.students)) {
    const core = normalizeReg(reg);
    if (!core) continue;
    const name = EXAM_DATASET.names[nameIndex] ?? "";
    const candidate = { core, name };
    if (tokens.every((token) => name.toUpperCase().includes(token)))
      names.push(candidate);
    const roll = core.replace(/[^A-Z0-9]/g, "");
    if (
      roll.startsWith(compact) ||
      (/^\d+$/.test(compact) && core.split("-")[2]?.startsWith(compact))
    )
      rolls.push(candidate);
  }

  names.sort(
    (a, b) => a.name.localeCompare(b.name) || a.core.localeCompare(b.core),
  );
  rolls.sort((a, b) => a.core.localeCompare(b.core));
  const merged =
    /^\d+$/.test(compact) || compact.length >= 4
      ? [
          ...rolls,
          ...names.filter((n) => !rolls.some((r) => r.core === n.core)),
        ]
      : [
          ...names,
          ...rolls.filter((r) => !names.some((n) => n.core === r.core)),
        ];
  return merged.slice(0, limit);
}
