import { describe, expect, it } from "vitest";
import {
  groupByDay,
  lookupStudent,
  normalizeReg,
  papersToIcs,
  slotStart,
  sortPapers,
  type ExamDataset,
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
    expect(ics).toContain("seat CR-01 2nd 09:50-11:10");
  });
});

describe("slotStart", () => {
  it("converts HH:MM to minutes", () => {
    expect(slotStart("08:30-09:50")).toBe(510);
    expect(slotStart("16:00-17:20")).toBe(960);
  });
});
