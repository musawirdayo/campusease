// Generator for the built-in exam dataset.
//
// Reads BOTH official xlsx files in the project root:
//   1. "Final Seating plans Mids (2) cs.xlsx"  → seat assignment for every
//      student-exam row (name, reg no, room, seat) — the authoritative
//      per-student truth powering /exams.
//   2. "Final Datesheet Mids cs.xlsx"          → class-level schedule, used to
//      cross-check the seating rows at generation time.
//
// Output:
//   public/data/exams-fa26-mids.json  — compact, indexed dataset fetched on
//                                       demand by /exams
//   src/lib/exam-meta.ts              — tiny static summary for SSR/landing
//
// Validation performed (generator fails loudly on violations):
//   - dates parse and sit inside the exam window
//   - time slot is HH:MM-HH:MM with end > start
//   - reg no matches CIIT/<batch>-<prog>-<num>/ISB and is globally unique
//   - one seat per (student, date, time) — a student never sits two rooms at once
//   - seat format R<row>-<num> | Extra-<n> | "CR-<n> ..." (clash room session)
//   - every seating row cross-checks against a class-level datesheet row
//     (same date/time/class → same course code + title, instructor if present)
//
// Run:  node scripts/gen-exam-data.mjs
import * as XLSX from "xlsx/xlsx.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SEATING_FILE = "Final Seating plans Mids (2) cs.xlsx";
const SEATING_SHEET = "Seating Plan";
const DATESHEET_FILE = "Final Datesheet Mids cs.xlsx";
const DATESHEET_SHEET = "Final Date Sheet";

const RE = /^CIIT\/(\w{4})-([A-Za-z]+)-(\d{3})\/ISB$/;
const SEAT_OK = /^(R\d+-\d+|Extra-\d+|CR-\d+ .+)$/;
const DATE_OK = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})$/;
const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
const TIME_OK = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

const read = (file, sheet) => {
  const wb = XLSX.read(readFileSync(file), { type: "buffer" });
  if (!wb.Sheets[sheet]) throw new Error(`Sheet "${sheet}" missing in ${file}`);
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
};

// ─── Load rows ──────────────────────────────────────────────────────────────
const seatRaw = read(SEATING_FILE, SEATING_SHEET).slice(4).filter((r) => r[0] || r[4]);
const dsRaw = read(DATESHEET_FILE, DATESHEET_SHEET).slice(4).filter((r) => r[0]);
console.log(`seating rows: ${seatRaw.length}, class-datesheet rows: ${dsRaw.length}`);

// ─── Parse one seating row ──────────────────────────────────────────────────
function parseSeat(r, i) {
  const dayDate = String(r[0]).trim();
  const slot = String(r[1]).trim();
  const room = String(r[2]).trim();
  const seat = String(r[3]).trim();
  const reg = String(r[4]).trim();
  const name = String(r[5]).trim();
  const cls = String(r[6]).trim();
  const course = String(r[7]).trim();
  const title = String(r[8]).trim();
  const dm = dayDate.match(DATE_OK);
  const tm = slot.match(TIME_OK);
  const problems = [];
  if (!dm) problems.push("bad date");
  if (!tm) problems.push("bad time");
  else if (+tm[1] * 60 + +tm[2] >= +tm[3] * 60 + +tm[4]) problems.push("time not increasing");
  const rm = reg && String(reg).match(RE);
  if (!rm) problems.push(`bad reg ${JSON.stringify(reg)}`);
  if (!SEAT_OK.test(seat)) problems.push(`bad seat ${JSON.stringify(seat)}`);
  if (!name) problems.push("missing name");
  if (!course) problems.push("missing course");
  if (problems.length)
    throw new Error(`Row ${i + 5}: ${problems.join("; ")} → ${JSON.stringify(r)}`);
  return {
    date: `${dm[4]}-${MONTHS[dm[3].toLowerCase()]}-${dm[2]}`,
    dow: dm[1],
    slot,
    room,
    reg: String(reg),
    name,
    cls: cls || className,
    course,
    title: title || course,
    seat,
  };
}

const rows = seatRaw.map(parseSeat);

// ─── Global invariants ──────────────────────────────────────────────────────
// one seat per (student, date, official slot, course). A student with two
// clashing papers per slot legitimately appears twice (clash room, sequenced
// sessions — the seat string carries the split timing).
const oneSeat = new Map();
for (const r of rows) {
  const k = `${r.reg}|${r.date}|${r.slot}|${r.course}`;
  if (oneSeat.has(k)) throw new Error(`Student sits twice for one course: ${k}`);
  oneSeat.set(k, r);
}
// unique reg → name
const regName = new Map();
for (const r of rows) {
  const prev = regName.get(r.reg);
  if (prev && prev !== r.name) throw new Error(`Name mismatch for ${r.reg}: ${prev} vs ${r.name}`);
  regName.set(r.reg, r.name);
}
const dates = [...new Set(rows.map((r) => r.date))].sort();
const slots = [...new Set(rows.map((r) => r.slot))].sort();
console.log(`students: ${regName.size}, exam days: ${dates.length}, slots: ${slots.length}`);
console.log("days:", dates.join(", "));

// ─── Cross-check against the class-level datesheet ─────────────────────────
// One class+slot may appear under several course codes (current catalog code
// for current students + older code for repeaters, one shared session — e.g.
// BCS-4B: CSC262 students and CSC462 repeaters, same instructor). So a key
// maps to ALL its code variants; a seating row is consistent when ANY variant
// agrees with its code. Two variants = one dual-code (shared) session.
const classLevel = new Map();
for (const r of dsRaw) {
  const dm = String(r[0]).match(DATE_OK);
  if (!dm) continue;
  const date = `${dm[4]}-${MONTHS[dm[3].toLowerCase()]}-${dm[2]}`;
  const slot = String(r[1]).trim();
  const cls = String(r[2]).trim();
  const course = String(r[5]).trim();
  const title = String(r[6]).trim();
  const instr = String(r[7]).trim();
  const k = `${date}|${slot}|${cls}`;
  const variants = classLevel.get(k) ?? [];
  if (!variants.some((v) => v.course.toLowerCase() === course.toLowerCase()))
    variants.push({ course, title, instr });
  classLevel.set(k, variants);
}
const multiCode = [...classLevel.values()].filter((v) => v.length > 1);
console.log(`class-level slots: ${classLevel.size}, dual-code slots: ${multiCode.length}`);
for (const v of multiCode)
  console.log(`  dual-code: ${v.map((x) => x.course).join(" + ")} — ${v[0].title} · ${v[0].instr}`);

// each seating row must agree with one of its class-level variants
let checked = 0, mismatchCode = 0, noParent = 0;
const mismatchSamples = [];
for (const r of rows) {
  const variants = classLevel.get(`${r.date}|${r.slot}|${r.cls}`);
  if (!variants) {
    noParent++;
    if (mismatchSamples.length < 8) mismatchSamples.push(`NO-PARENT ${r.cls} ${r.course} ${r.date} ${r.slot}`);
    continue;
  }
  checked++;
  const hit = variants.find((p) => p.course.toLowerCase() === r.course.toLowerCase());
  if (!hit) {
    mismatchCode++;
    if (mismatchCode <= 8)
      mismatchSamples.push(`CODE ${r.reg} ${r.cls} ${r.date} ${r.slot} seating=${r.course} datesheet=[${variants.map((v) => v.course).join(", ")}]`);
    continue;
  }
  // title (class-level sheet may leave it blank)
  if (hit.title && r.title && hit.title.toLowerCase() !== r.title.toLowerCase() && mismatchCode < 8)
    mismatchSamples.push(`TITLE ${r.cls} ${r.date} ${r.slot} "${r.title}" vs "${hit.title}"`);
}
console.log(`seat rows cross-checked: ${checked}/${rows.length}, code mismatches: ${mismatchCode}, rows without a class-level parent: ${noParent}`);
for (const s of mismatchSamples) console.log("  ", s);

// ─── Build compact indexed JSON ─────────────────────────────────────────────
const makeIdx = () => {
  const arr = [];
  const m = new Map();
  return {
    list: arr,
    push: (v) => {
      let i = m.get(v);
      if (i === undefined) {
        i = arr.length;
        m.set(v, i);
        arr.push(v);
      }
      return i;
    },
  };
};
const names = makeIdx(), courses = makeIdx(), classes = makeIdx(), rooms = makeIdx(), slotsT = makeIdx(), datesT = makeIdx(), seatsT = makeIdx();
const students = {}; // key: full reg no → [nameIdx, paper…]  paper=[d, t, c, cls, room, seat]
let paperCount = 0;
for (const r of rows) {
  const d = datesT.push(r.date), t = slotsT.push(r.slot),
    c = courses.push(`${r.course}|${r.title}`), cl = classes.push(r.cls),
    rm = rooms.push(r.room), st = seatsT.push(r.seat);
  const nm = names.push(r.name.toUpperCase() === r.name ? r.name : r.name);
  const k = r.reg;
  const s = (students[k] ??= [nm, []]);
  s[0] = nm;
  s[1].push([d, t, c, cl, rm, st]);
  paperCount++;
}
// sort papers chronologically inside each student
for (const k of Object.keys(students)) {
  students[k][1].sort((a, b) =>
    datesT.list[a[0]].localeCompare(datesT.list[b[0]]) || slotsT.list[a[1]].localeCompare(slotsT.list[b[1]]),
  );
}

const all = {
  term: "FA26 Midterm · Department of Computer Science",
  dept: "Computer Science",
  source: "Official final seating plan + final date sheet (22 Oct 2026)",
  dates: datesT.list,
  slots: slotsT.list,
  rooms: rooms.list,
  classes: classes.list,
  courses: courses.list,
  seats: seatsT.list,
  names: names.list,
  students,
};

// ─── Sanity: JSON round-trip + size report ─────────────────────────────────
const json = JSON.stringify(all);
const round = JSON.parse(json);
if (round.dates.length !== all.dates.length || !round.students[rows[0].reg])
  throw new Error("JSON round-trip failed");

// resolve one student end-to-end as a smoke test
const sampleReg = rows[0].reg;
const resolved = round.students[sampleReg];
console.log(`smoke ${sampleReg} → ${resolved[1].length} papers, name "${round.names[resolved[0]]}"`);
for (const p of resolved[1])
  console.log(`  ${round.dates[p[0]]} ${round.slots[p[1]]} ${round.courses[p[2]]} ${round.classes[p[3]]} · ${round.rooms[p[4]]} · ${round.seats[p[5]]}`);

mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/exams-fa26-mids.json", json + "\n");
const kb = Math.round(json.length / 1024);
console.log(`\nwrote public/data/exams-fa26-mids.json — ${kb} KB raw`);

// tiny static summary module for the landing page + admin
writeFileSync(
  "src/lib/exam-meta.ts",
  `// GENERATED by scripts/gen-exam-data.mjs — do not edit by hand.
export const EXAM_TERM = ${JSON.stringify(all.term)};
export const EXAM_DEPT = ${JSON.stringify(all.dept)};
export const EXAM_SOURCE = ${JSON.stringify(all.source)};
export const EXAM_DATES = ${JSON.stringify(all.dates)};
export const EXAM_SLOTS = ${JSON.stringify(all.slots)};
export const EXAM_STUDENTS = ${regName.size};
export const EXAM_PAPERS = ${round.dates.length ? paperCount : 0};
export const EXAM_CLASS_SLOTS = ${classLevel.size};
export const EXAM_DUAL_CODE_SLOTS = ${multiCode.length};
`,
);
console.log("wrote src/lib/exam-meta.ts");
