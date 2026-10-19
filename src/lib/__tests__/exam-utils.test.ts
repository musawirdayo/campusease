import { describe, expect, it } from "vitest";
import {
  auditExams,
  examsOverlap,
  findExamClashes,
  findSharedSlots,
  isSharedSlot,
  normalDate,
  normalSlot,
  examRange,
} from "../exam-utils";
import type { Exam } from "../types";

const exam = (
  date: string,
  time: string,
  code: string,
  prog = "BCS",
  sem = 3,
  sec = "A",
): Exam => ({
  date,
  time,
  prog,
  sem,
  sec,
  course: code + " course",
  code,
  rooms: [],
  instructor: "",
});

describe("exam-utils", () => {
  it("detects overlapping times on the same date", () => {
    expect(
      examsOverlap(
        exam("2026-11-02", "08:30-09:50", "CSC262"),
        exam("2026-11-02", "08:30-09:50", "CSC462"),
      ),
    ).toBe(true);
    expect(
      examsOverlap(
        exam("2026-11-02", "08:30-09:50", "CSC262"),
        exam("2026-11-02", "10:00-11:20", "CSC462"),
      ),
    ).toBe(false);
    expect(
      examsOverlap(
        exam("2026-11-02", "08:30-09:50", "CSC262"),
        exam("2026-11-03", "08:30-09:50", "CSC462"),
      ),
    ).toBe(false);
  });

  it("never flags the same course against itself", () => {
    expect(
      examsOverlap(
        exam("2026-11-02", "08:30-09:50", "CSC462", "BAI", 4, "A"),
        exam("2026-11-02", "08:30-09:50", "CSC462", "BCS", 4, "B"),
      ),
    ).toBe(false);
  });

  it("pairs every clash both ways", () => {
    const list = [
      exam("2026-11-02", "08:30-09:50", "CSC262"),
      exam("2026-11-02", "09:30-10:50", "CSC462"),
      exam("2026-11-03", "08:30-09:50", "HUM120"),
    ];
    const clashes = findExamClashes(list);
    expect(clashes.length).toBe(1);
    expect([clashes[0].a.code, clashes[0].b.code].sort()).toEqual([
      "CSC262",
      "CSC462",
    ]);
  });

  describe("shared slots — one paper under two codes", () => {
    // Real v1 pattern: BAI-4A "Artificial Intelligence" sits as CSC262 (current
    // students) and CSC462 (repeaters) in the same room, same instructor.
    const ai = (code: string, prog = "BAI", sec = "A") => ({
      ...exam("2026-11-02", "08:30-09:50", code, prog, 4, sec),
      course: "Artificial Intelligence",
      rooms: ["G-08"],
      instructor: "Umar Nauman",
    });

    it("recognises same class + same course title + one slot as shared", () => {
      expect(isSharedSlot(ai("CSC262"), ai("CSC462"))).toBe(true);
      // different class → not shared (another cohort's own exam)
      expect(isSharedSlot(ai("CSC262"), ai("CSC462", "BAI", "B"))).toBe(false);
      // different course title → a genuine overlap candidate
      const other = { ...ai("CSC462"), course: "Theory of Computation" };
      expect(isSharedSlot(ai("CSC262"), other)).toBe(false);
      // non-overlapping slot → not shared
      const later = { ...ai("CSC462"), time: "10:00-11:20" };
      expect(isSharedSlot(ai("CSC262"), later)).toBe(false);
    });

    it("is NOT a clash — personal sheets skip shared pairs", () => {
      const list = [ai("CSC262"), ai("CSC462")];
      expect(findExamClashes(list)).toEqual([]);
      expect(findSharedSlots(list)).toHaveLength(1);
    });

    it("audit reports shared slots separately from clashes", () => {
      const issues = auditExams([ai("CSC262"), ai("CSC462")]);
      expect(issues.filter((i) => i.type === "clash")).toHaveLength(0);
      const shared = issues.filter((i) => i.type === "shared-slot");
      expect(shared).toHaveLength(1);
      expect(shared[0].message).toContain("CSC262");
      expect(shared[0].message).toContain("CSC462");
    });

    it("keeps red clashes when the titles differ despite codes", () => {
      const other = { ...ai("CSC462"), course: "Theory of Computation" };
      const clashes = findExamClashes([ai("CSC262"), other]);
      expect(clashes).toHaveLength(1);
    });
  });

  it("normalizes dates in both common formats", () => {
    expect(normalDate("02-Nov-2026")).toBe("2026-11-02");
    expect(normalDate("2026-11-02")).toBe("2026-11-02");
    expect(normalDate("2-Nov-26")).toBe("2026-11-02");
  });

  it("normalizes slots with 12h/24h input", () => {
    expect(normalSlot("2:00 PM - 3:20 PM")).toBe("14:00-15:20");
    expect(normalSlot("08:30-09:50")).toBe("08:30-09:50");
  });

  it("rejects invalid ranges", () => {
    expect(examRange("9999")).toBe(null);
    expect(examRange("15:00-14:00")).toBe(null);
  });

  describe("auditExams", () => {
    it("flags exact duplicate rows (same key, same rooms)", () => {
      const a = exam("2026-11-02", "08:30-09:50", "CSC325", "BAE", 5, "B");
      const b = { ...a, rooms: ["107"] };
      const c = { ...a, rooms: ["107"] }; // same key AND same rooms
      const issues = auditExams([a, b, c]);
      const dups = issues.filter((i) => i.type === "duplicate");
      expect(dups.length).toBe(1);
    });

    it("does NOT flag multi-room rows (different rooms, same key)", () => {
      const a = exam("2026-11-02", "08:30-09:50", "CSC325", "BAE", 5, "B");
      const b = { ...a, rooms: ["107"] };
      const c = { ...a, rooms: ["110"] };
      expect(
        auditExams([a, b, c]).filter((i) => i.type === "duplicate").length,
      ).toBe(0);
    });

    it("flags the same exam offered in two different slots", () => {
      const a = exam("2026-11-02", "08:30-09:50", "CSC141", "BCS", 1, "A");
      const b = exam("2026-11-03", "08:30-09:50", "CSC141", "BCS", 1, "A");
      const issues = auditExams([a, b]);
      expect(issues.some((i) => i.type === "same-exam-different-slot")).toBe(
        true,
      );
    });

    it("flags rows without a readable class", () => {
      const a = exam("2026-11-02", "08:30-09:50", "HUM102", "—", 0, "A");
      expect(auditExams([a]).some((i) => i.type === "missing-field")).toBe(
        true,
      );
    });

    it("reports clashes through the same audit", () => {
      const issues = auditExams([
        exam("2026-11-02", "08:30-09:50", "CSC262", "BAI", 4, "A"),
        exam("2026-11-02", "08:30-09:50", "CSC462", "BAI", 4, "A"),
      ]);
      expect(issues.filter((i) => i.type === "clash").length).toBe(1);
    });

    it("returns nothing for a clean sheet", () => {
      expect(
        auditExams([
          exam("2026-11-02", "08:30-09:50", "HUM120", "BCS", 2, "A"),
          exam("2026-11-03", "13:00-14:20", "MTH104", "BCS", 3, "B"),
        ]),
      ).toEqual([]);
    });
  });
});
