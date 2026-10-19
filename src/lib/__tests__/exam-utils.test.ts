import { describe, expect, it } from "vitest";
import {
  auditExams,
  examsOverlap,
  findExamClashes,
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
