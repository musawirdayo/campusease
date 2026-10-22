import { describe, expect, it } from "vitest";
import {
  buildStudentTimetable,
  coursesWeek,
  dateView,
  groupByDay,
  i12,
  lookupStudent,
  normalizeReg,
  papersToIcs,
  searchSuggestions,
  seatView,
  slotStart,
  sortPapers,
  studentCourses,
  type ExamDataset,
  type Paper,
} from "../exam-data";

// Fixture mirroring the real generator output shape (string tables + students).
const ds: ExamDataset = {
  term: "FA26 Midterm · Department of Computer Science",
  dept: "Computer Science",
  source: "test fixture",
  dates: ["2026-11-02", "2026-11-03"],
  slots: ["08:30-09:50", "11:30-12:50"],
  rooms: ["G-05", "105", "Clash Room"],
  classes: ["BCS-4A", "BCS-4B", "—"],
  courses: [
    "CSC262|Artificial Intelligence",
    "CSC462|Artificial Intelligence",
    "MTH262|Statistics and Probability Theory",
  ],
  seats: [
    "R1-1",
    "R6-12",
    "CR-01 1st 08:30-09:50",
    "CR-01 2nd 09:50-11:10",
    "Extra-3",
  ],
  names: ["AYESHA KHAN", "SAAD ALI", "MUHAMMAD UMAR"],
  students: {
    "CIIT/FA25-BCS-065/ISB": [0, [[0, 0, 0, 0, 0, 0]]],
    "CIIT/SP23-BCS-109/ISB": [
      1,
      [
        [0, 0, 1, 1, 1, 1],
        [1, 1, 2, 2, 0, 4],
      ],
    ],
    // clash student: two clashing papers per official slot → sequential CR seats
    "CIIT/SP25-BCS-001/ISB": [
      2,
      [
        [0, 0, 0, 1, 2, 2],
        [0, 0, 1, 0, 2, 3],
      ],
    ],
  },
};

describe("buildStudentTimetable", () => {
  it("resolves a single-section program straight from the roll number", async () => {
    // Fall-2026 BSE intake has one class per course — no siblings to pick from
    const tt = await buildStudentTimetable("FA26-BSE-010");
    expect(tt.program).toBe("BSE");
    expect(tt.batch).toBe("Fall 2026");
    expect(tt.matched).toEqual(["BSE-1"]);
    expect(tt.options).toEqual([]);
    expect(tt.picks.length).toBeGreaterThan(0);
    for (const p of tt.picks) {
      expect(p.cls).toBe("BSE-1");
      expect(p.sessions.length).toBeGreaterThan(0);
      for (const s of p.sessions) expect(s.sid).toBeTruthy();
    }
  });

  it("maps FA25 batch onto the Fall-2025 BCS sections and pins one from paper cls tokens", async () => {
    const tt = await buildStudentTimetable("FA25-BCS-065", ["BCS-3A"]);
    expect(tt.matched).toEqual(["BCS-3A"]);
    expect(tt.options).toEqual([]); // pinned → no ask
    expect(tt.picks.some((p) => p.cls === "BCS-3A")).toBe(true);
    expect(tt.picks.every((p) => p.cls === "BCS-3A")).toBe(true);
  });

  it("raises sibling-section options when papers can't disambiguate", async () => {
    const tt = await buildStudentTimetable("FA25-BCS-099", [
      "CSC262-slot-only",
    ]);
    expect(tt.options.sort()).toEqual(["BCS-3A", "BCS-3B"]);
    // fall-back still returns the union so nothing renders empty in the meantime
    expect(tt.picks.length).toBeGreaterThan(0);
  });

  it("returns no classes for non-CS programs", async () => {
    const tt = await buildStudentTimetable("FA25-XXXX-065");
    expect(tt.matched).toEqual([]);
    expect(tt.picks).toEqual([]);
    expect(tt.program).toBe("XXXX");
  });

  it("tolerates any reasonable spelling of the roll number", async () => {
    const tt = await buildStudentTimetable("FA23-BDS-007");
    expect(tt.program).toBe("BDS");
    expect(tt.batch).toBe("Fall 2023");
    expect(tt.matched).toEqual(["BDS-7"]); // BDS has no sibling sections
  });
});

describe("normalizeReg", () => {
  it("accepts every reasonable spelling", () => {
    for (const input of [
      "FA25-BCS-065",
      "fa25-bcs-065",
      "FA25-BCS-65",
      "CIIT/FA25-BCS-065",
      "CIIT/FA25-BCS-065/ISB",
      "FA25 BCS 065",
      "fa25bcs065",
    ]) {
      expect(normalizeReg(input)).toBe("FA25-BCS-065");
    }
  });

  it("rejects non-registration noise", () => {
    expect(normalizeReg("hello world")).toBe(null);
    expect(normalizeReg("BCS-065")).toBe(null);
    expect(normalizeReg("")).toBe(null);
  });

  it("pads short roll numbers to 3 digits", () => {
    expect(normalizeReg("SP23-BDS-7")).toBe("SP23-BDS-007");
  });
});

describe("lookupStudent", () => {
  it("finds a student by full or core form", () => {
    for (const form of ["FA25-BCS-065", "CIIT/FA25-BCS-065/ISB"]) {
      const r = lookupStudent(ds, form);
      expect(r.kind).toBe("found");
      if (r.kind === "found") {
        expect(r.student.reg).toBe("CIIT/FA25-BCS-065/ISB");
        expect(r.student.name).toBe("AYESHA KHAN");
        expect(r.student.papers).toHaveLength(1);
        expect(r.student.papers[0].code).toBe("CSC262");
        expect(r.student.papers[0].title).toBe("Artificial Intelligence");
        expect(r.student.papers[0].room).toBe("G-05");
        expect(r.student.papers[0].seat).toBe("R1-1");
      }
    }
  });

  it("suggests near matches for an unknown number", () => {
    const r = lookupStudent(ds, "FA25-BCS-066");
    expect(r.kind).toBe("unknown");
    if (r.kind === "unknown") {
      expect(r.near.map((s) => s.core)).toContain("FA25-BCS-065");
    }
  });

  it("rejects unparseable input", () => {
    expect(lookupStudent(ds, "xyz").kind).toBe("invalid");
  });
});

describe("clash-room papers keep real sitting windows", () => {
  it("splits sequential CR sessions off the official slot", () => {
    const r = lookupStudent(ds, "SP25-BCS-001");
    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    const [first, second] = sortPapers(r.student.papers);
    expect(first.clashSession).toBe("1st");
    expect(first.effectiveSlot).toBe("08:30-09:50");
    expect(second.clashSession).toBe("2nd");
    expect(second.effectiveSlot).toBe("09:50-11:10");
    // official slot stays intact for both
    expect(first.slot).toBe("08:30-09:50");
    expect(second.slot).toBe("08:30-09:50");
  });

  it("orders clash-room rows by their real windows, not the shared slot", () => {
    const r = lookupStudent(ds, "SP25-BCS-001");
    if (r.kind !== "found") return;
    const sorted = sortPapers(r.student.papers);
    expect(sorted[0].code).toBe("CSC262"); // 1st session
    expect(sorted[1].code).toBe("CSC462"); // 2nd session
  });

  it("groups papers per day across the whole cohort", () => {
    const r = lookupStudent(ds, "SP23-BCS-109");
    if (r.kind !== "found") return;
    const days = groupByDay(r.student.papers);
    expect(days).toHaveLength(2);
    expect(days[0][0]).toBe("2026-11-02");
    expect(days[1][1]).toHaveLength(1);
  });

  it("encodes both clash sessions into the calendar file", () => {
    const r = lookupStudent(ds, "SP25-BCS-001");
    if (r.kind !== "found") return;
    const ics = papersToIcs(r.student.papers, {
      reg: "CIIT/SP25-BCS-001/ISB",
      name: "MUHAMMAD UMAR",
      term: ds.term,
    });
    expect(ics).toContain("DTSTART:20261102T0830");
    expect(ics).toContain("DTEND:20261102T1110"); // 2nd session runs to 11:10
    expect(ics).toContain("Clash-room session 2nd");
    expect(ics).toContain(
      "seat Clash Room 01 · 2nd sitting · 9:50 AM–11:10 AM",
    );
  });
});

describe("searchSuggestions", () => {
  it("matches roll numbers by compact prefix, dashes optional", () => {
    for (const q of [
      "FA25",
      "fa25-",
      "FA25BCS",
      "FA25-BCS-",
      "FA25-BCS-0",
      "fa25bcs065",
      "FA25-BCS-065",
    ]) {
      const cores = searchSuggestions(ds, q).map((s) => s.core);
      expect(cores).toContain("FA25-BCS-065");
    }
  });

  it("matches digits-only queries against the roll segment", () => {
    const cores = searchSuggestions(ds, "065").map((s) => s.core);
    expect(cores[0]).toBe("FA25-BCS-065");
    // rolls starting with 0: 065 and 001
    expect(searchSuggestions(ds, "0").length).toBe(2);
  });

  it("matches names token-wise, partial tokens included", () => {
    for (const q of [
      "Ayesha",
      "AYESHA KH",
      "MUHAMMAD UMAR",
      "umar",
      " SAAD ALI ",
    ]) {
      const names = searchSuggestions(ds, q).map((s) => s.name);
      expect(names.length).toBeGreaterThan(0);
    }
    expect(searchSuggestions(ds, "ayesha")[0]?.name).toBe("AYESHA KHAN");
  });

  it("prefix-of-name hits outrank substring-only hits", () => {
    const got = searchSuggestions(ds, "a").map((s) => s.name);
    expect(got[0]).toBe("AYESHA KHAN");
  });

  it("respects the limit", () => {
    expect(searchSuggestions(ds, "A", 1)).toHaveLength(1);
    expect(searchSuggestions(ds, "A", 2).length).toBeLessThanOrEqual(2);
  });

  it("returns nothing for empty or unmatched queries", () => {
    expect(searchSuggestions(ds, "")).toEqual([]);
    expect(searchSuggestions(ds, "ZZZZ")).toEqual([]);
    expect(searchSuggestions(ds, "ayesha smith")).toEqual([]);
  });
});

const paper = (code: string, title: string, cls: string): Paper => ({
  date: "2026-11-02",
  slot: "08:30-09:50",
  code,
  title,
  cls,
  room: "G-05",
  seat: "R1-1",
});

describe("studentCourses", () => {
  it("returns one entry per course — the student's own combination", () => {
    const courses = studentCourses([
      paper("CSC262", "Artificial Intelligence", "BCS-4A"),
      paper("MTH092", "Discrete Structures", "BCS-4A"),
      paper("CSC241", "Object Oriented Programming", "BCS-3B"), // improving — seated with 3B
    ]);
    expect(courses.map((c) => c.code)).toEqual(["CSC262", "MTH092", "CSC241"]);
    expect(courses[2]).toEqual({
      code: "CSC241",
      title: "Object Oriented Programming",
      cls: "BCS-3B",
    });
  });

  it("dedupes repeated codes and keeps the class each paper sat with", () => {
    const courses = studentCourses([
      paper("CSC262", "Artificial Intelligence", "BCS-4A"),
      paper("CSC262", "Artificial Intelligence", "BCS-4B"), // same course twice
    ]);
    expect(courses).toHaveLength(1);
    expect(courses[0].cls).toBe("BCS-4A");
  });
});

describe("coursesWeek", () => {
  it("resolves per-course classes from papers, never from a section roster", async () => {
    const { picks, missing } = await coursesWeek([
      paper("CSC291", "Linear Algebra", "BCS-3A"),
      paper("CSC270", "Operating Systems Concepts", "BCS-3B"),
    ]);
    expect(missing).toEqual([]);
    const a = picks.find((p) => p.code === "CSC291");
    const b = picks.find((p) => p.code === "CSC270");
    expect(a?.cls).toBe("BCS-3A");
    expect(a?.sessions.length).toBeGreaterThan(0);
    expect(b?.cls).toBe("BCS-3B");
    expect(b?.sessions.length).toBeGreaterThan(0);
  });

  it("tolerates a bogus section when the course runs in the same program+semester", async () => {
    const { picks, missing } = await coursesWeek([
      paper("CSC291", "Linear Algebra", "BCS-3Z"),
    ]);
    expect(missing).toEqual([]);
    expect(picks[0]?.cls.startsWith("BCS-3")).toBe(true);
    expect(picks[0]?.sessions.length).toBeGreaterThan(0);
  });

  it("reports courses the timetable does not run as missing instead of inventing them", async () => {
    const { picks, missing } = await coursesWeek([
      paper("XXX999", "Made-up course", "BCS-3A"),
      paper("CSC262", "Artificial Intelligence", "BCS-3F"), // runs in BCS-4, mismatched program+sem → missing
    ]);
    expect(picks).toEqual([]);
    expect(missing.map((m) => m.code)).toEqual(["XXX999", "CSC262"]);
  });
});

describe("slotStart", () => {
  it("converts HH:MM to minutes", () => {
    expect(slotStart("08:30-09:50")).toBe(510);
    expect(slotStart("16:00-17:20")).toBe(960);
  });
});

describe("12h formatting helpers", () => {
  it("renders seats and times as humans read them", () => {
    expect(dateView("2026-11-02")).toBe("2 Nov 2026");
    expect(seatView("R1-1")).toBe("R1-1");
    // clash-room seats carry a 24h window raw → displayed as 12h
    expect(seatView("CR-01 2nd 09:50-11:10")).toBe(
      "Clash Room 01 · 2nd sitting · 9:50 AM–11:10 AM",
    );
    expect(i12("08:30-09:50")).toBe("8:30 AM–9:50 AM");
    expect(i12("16:00-17:20")).toBe("4:00 PM–5:20 PM");
  });
});
