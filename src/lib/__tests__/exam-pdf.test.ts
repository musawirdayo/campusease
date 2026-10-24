import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildExamDatesheet } from "@/lib/exam-pdf";
import {
  lookupStudent,
  regIndex,
  normalizeReg,
  sortPapers,
  studentMeta,
  type ExamDataset,
  type StudentRec,
} from "@/lib/exam-data";

// Print-layout regression: building the datesheet PDF for REAL students from
// the REAL generated dataset must produce a valid document that is exactly
// ONE A4 page (the old CSS-print path spilled blank pages on phones).
const ds = JSON.parse(
  readFileSync("src/data/exams-fa26-mids.json", "utf8"),
) as ExamDataset;

const index = regIndex(ds);

function unpack(core: string): StudentRec {
  const reg = index.get(normalizeReg(core) ?? "");
  expect(reg, `${core} exists in the dataset`).toBeTruthy();
  const packed = ds.students[reg!];
  const papers = packed[1].map((p): StudentRec["papers"][number] => ({
    date: ds.dates[p[0]] ?? "",
    slot: ds.slots[p[1]] ?? "",
    code: (ds.courses[p[2]] ?? "").split("|")[0],
    title: (ds.courses[p[2]] ?? "").split("|")[1] ?? "",
    cls: ds.classes[p[3]] ?? "",
    room: ds.rooms[p[4]] ?? "",
    seat: ds.seats[p[5]] ?? "",
  }));
  return {
    reg: reg!,
    core,
    name: ds.names[packed[0]] ?? "",
    papers: sortPapers(papers.filter((p) => p.date)),
  };
}

/** The first student found whose seat sits in the Clash Room. */
function findClashStudent(): StudentRec {
  for (const reg of Object.keys(ds.students)) {
    const core = normalizeReg(reg);
    if (!core) continue;
    const s = unpack(core);
    if (s.papers.some((p) => p.clashSession || /^CR-\d+/.test(p.seat)))
      return s;
  }
  throw new Error("no clash-room student found in the dataset");
}

async function build(s: StudentRec): Promise<Uint8Array> {
  const doc = await buildExamDatesheet({
    student: s,
    papers: s.papers,
    detailMap: new Map(),
  });
  expect(doc.getNumberOfPages(), `${s.core} fits on ONE page`).toBe(1);
  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

it("paginates an oversized schedule cleanly onto a second page", async () => {
  // Synthetic 24-paper schedule (12 days × 2) — bigger than any real one
  // in the dataset — must continue onto exactly one extra page, not shrink
  // into illegibility. (Test fixture only; no real data is altered.)
  const s = unpack("FA25-BCS-065");
  const papers = Array.from({ length: 24 }, (_, i) => ({
    ...s.papers[i % s.papers.length]!,
    date: `2026-11-${String(2 + Math.floor(i / 2)).padStart(2, "0")}`,
    seat: `S-${String(i + 1).padStart(3, "0")}`,
  }));
  const doc = await buildExamDatesheet({
    student: s,
    papers,
    detailMap: new Map(),
  });
  expect(doc.getNumberOfPages()).toBe(2);
  // sample for manual / audit inspection
  writeFileSync(
    join(tmpdir(), "campusease-exam-datesheet-pages.pdf"),
    new Uint8Array(doc.output("arraybuffer") as ArrayBuffer),
  );
});

it("renders a valid one-page PDF for ordinary students", async () => {
  const bytes = await build(unpack("FA25-BCS-065"));
  const head = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  expect(head).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(2_000); // actually drew content
});

it("renders a valid one-page PDF for a clash-room student", async () => {
  const s = findClashStudent();
  console.log(
    `clash sample: ${s.core} · ${s.papers.length} papers · meta ${studentMeta(s).prog}`,
  );
  const bytes = await build(s);
  expect(bytes.length).toBeGreaterThan(2_000);
  // sample for manual / pdfjs inspection (clash tag + marker-bar check)
  const out = join(tmpdir(), "campusease-exam-datesheet-clash.pdf");
  writeFileSync(out, bytes);
  console.log(`sample written: ${out}`);
});

it("renders one page even for the heaviest schedule in the dataset", async () => {
  let heaviest: StudentRec | null = null;
  let best = 0;
  for (const reg of Object.keys(ds.students)) {
    const core = normalizeReg(reg);
    if (!core) continue;
    const s = unpack(core);
    if (s.papers.length > best) {
      best = s.papers.length;
      heaviest = s;
    }
  }
  expect(heaviest).toBeTruthy();
  const bytes = await build(heaviest!);
  expect(bytes.length).toBeGreaterThan(2_000);
});

it("writes a sample PDF to /tmp for manual inspection", async () => {
  const s = unpack("FA25-BCS-065");
  const bytes = await build(s);
  const out = join(tmpdir(), "campusease-exam-datesheet-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`sample written: ${out} (${bytes.length} bytes)`);
});
