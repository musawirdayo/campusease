import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { coursesWeek, type ExamDataset } from "@/lib/exam-data";

// Regression check with the REAL generated dataset: a real roll number's
// papers must resolve into weekly picks (per course, not per section).
it("real dataset: SP23-BCS-109 resolves a working per-course week", async () => {
  const ds = JSON.parse(
    readFileSync("public/data/exams-fa26-mids.json", "utf8"),
  ) as ExamDataset;
  const packed = ds.students["CIIT/SP23-BCS-109/ISB"];
  expect(packed).toBeTruthy();
  const papers = packed[1].map((p) => ({
    date: ds.dates[p[0]] ?? "",
    slot: ds.slots[p[1]] ?? "",
    code: (ds.courses[p[2]] ?? "").split("|")[0],
    title: (ds.courses[p[2]] ?? "").split("|")[1] ?? "",
    cls: ds.classes[p[3]] ?? "",
    room: ds.rooms[p[4]] ?? "",
    seat: ds.seats[p[5]] ?? "",
  }));
  const { picks, missing } = await coursesWeek(papers);
  // every real course either resolves to sessions or is reported missing — none invented
  expect(picks.length + missing.length).toBe(papers.length);
  expect(picks.every((p) => p.sessions.length > 0)).toBe(true);
  // the resolved class must equal the paper's class exactly, or its
  // section-less base ("BCT-3A" → "BCT-3") — never some invented sibling
  for (const p of picks) {
    const paperCls = papers.find((x) => x.code === p.code)!.cls;
    const ok = p.cls === paperCls || paperCls.startsWith(p.cls);
    expect(ok, `${p.code}: ${p.cls} vs paper ${paperCls}`).toBe(true);
  }

  console.log(
    `real smoke: ${pickedCount(picks)} picks · missing: ${missing.map((m) => `${m.code}(${m.cls})`).join(", ")}`,
  );
});

function pickedCount(picks: { sessions: unknown[] }[]): number {
  return picks.reduce((n, p) => n + p.sessions.length, 0);
}
