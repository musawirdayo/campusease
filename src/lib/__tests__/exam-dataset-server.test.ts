import { describe, expect, it } from "vitest";
import {
  EXAM_DATASET,
  findStudentExact,
  findStudentSuggestions,
} from "../exam-dataset.server";
import {
  EXAM_CLASS_SLOTS,
  EXAM_DATES,
  EXAM_DUAL_CODE_SLOTS,
  EXAM_PAPERS,
  EXAM_SLOTS,
  EXAM_STUDENTS,
} from "../exam-meta";

// The server module bundles the real dataset. Search returns a limited list of
// names/rolls; exact lookup is required to return one student's exam details.
describe("server dataset exact lookup (the /api/lookup contract)", () => {
  it("exposes the real dataset server-side only", () => {
    expect(EXAM_DATASET.dates.length).toBeGreaterThan(0);
    expect(Object.keys(EXAM_DATASET.students).length).toBeGreaterThan(2000);
  });

  it("resolves a real core reg number to exactly one student", () => {
    const realReg = Object.keys(EXAM_DATASET.students)[0];
    const r = findStudentExact(realReg!);
    expect(r.kind).toBe("found");
    if (r.kind === "found") {
      expect(r.student.reg).toBe(realReg);
      expect(r.student.papers.length).toBeGreaterThan(0);
      for (const p of r.student.papers) {
        expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(p.room).toBeTruthy();
      }
    }
  });

  it("returns no extra keys for an unknown roll (nothing about anyone else)", () => {
    const r = findStudentExact("SP19-BCS-999");
    expect(r.kind).toBe("unknown");
    expect(Object.keys(r).sort()).toEqual(["kind", "reg"]);
  });

  it("returns limited name/roll suggestions without seating details", () => {
    const reg = Object.keys(EXAM_DATASET.students)[0]!;
    const nameIndex = EXAM_DATASET.students[reg]![0];
    const name = EXAM_DATASET.names[nameIndex]!;
    const suggestions = findStudentSuggestions(name);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(8);
    expect(suggestions.some((student) => student.name === name)).toBe(true);
    expect(Object.keys(suggestions[0]!).sort()).toEqual(["core", "name"]);
  });

  it("rejects garbage without touching the dataset", () => {
    for (const g of ["", "hello", "BCS-065", "  ", "names please: ayesha"]) {
      expect(findStudentExact(g).kind).toBe("invalid");
    }
  });

  it("keeps every packed exam row valid and its summary metadata in sync", () => {
    const classSlots = new Map<string, Set<string>>();
    const uniqueStudentPapers = new Set<string>();
    const regToName = new Map<string, string>();
    let paperCount = 0;

    for (const [reg, [nameIndex, papers]] of Object.entries(
      EXAM_DATASET.students,
    )) {
      expect(reg).toMatch(/^CIIT\/\w{4}-[A-Za-z]+-\d{3}\/ISB$/);
      expect(Number.isInteger(nameIndex)).toBe(true);
      const name = EXAM_DATASET.names[nameIndex];
      expect(name?.trim()).toBeTruthy();
      expect(regToName.get(reg)).toBeUndefined();
      regToName.set(reg, name!);

      for (const paper of papers) {
        expect(paper).toHaveLength(6);
        const [
          dateIndex,
          slotIndex,
          courseIndex,
          classIndex,
          roomIndex,
          seatIndex,
        ] = paper;
        for (const [index, list] of [
          [dateIndex, EXAM_DATASET.dates],
          [slotIndex, EXAM_DATASET.slots],
          [courseIndex, EXAM_DATASET.courses],
          [classIndex, EXAM_DATASET.classes],
          [roomIndex, EXAM_DATASET.rooms],
          [seatIndex, EXAM_DATASET.seats],
        ] as const) {
          expect(Number.isInteger(index)).toBe(true);
          expect(list[index]?.trim()).toBeTruthy();
        }

        const date = EXAM_DATASET.dates[dateIndex]!;
        const slot = EXAM_DATASET.slots[slotIndex]!;
        const course = EXAM_DATASET.courses[courseIndex]!;
        const cls = EXAM_DATASET.classes[classIndex]!;
        const seat = EXAM_DATASET.seats[seatIndex]!;
        expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
          date,
        );
        expect(slot).toMatch(/^\d{2}:\d{2}-\d{2}:\d{2}$/);
        expect(slot.slice(0, 5) < slot.slice(6)).toBe(true);
        expect(course.split("|")[0]?.trim()).toBeTruthy();
        expect(course.split("|").slice(1).join("|").trim()).toBeTruthy();
        expect(seat).toMatch(/^(R\d+-\d+|Extra-\d+|CR-\d+ .+)$/);

        const classSlotKey = `${date}|${slot}|${cls}`;
        const codes = classSlots.get(classSlotKey) ?? new Set<string>();
        codes.add(course.split("|")[0]!.toLowerCase());
        classSlots.set(classSlotKey, codes);

        const paperKey = `${reg}|${date}|${slot}|${course.split("|")[0]}`;
        expect(uniqueStudentPapers.has(paperKey)).toBe(false);
        uniqueStudentPapers.add(paperKey);
        paperCount++;
      }
    }

    expect(Object.keys(EXAM_DATASET.students)).toHaveLength(EXAM_STUDENTS);
    expect(regToName.size).toBe(EXAM_STUDENTS);
    expect(paperCount).toBe(EXAM_PAPERS);
    expect([...new Set(EXAM_DATASET.dates)].sort()).toEqual(
      [...EXAM_DATES].sort(),
    );
    expect([...new Set(EXAM_DATASET.slots)].sort()).toEqual(
      [...EXAM_SLOTS].sort(),
    );
    expect(classSlots.size).toBe(EXAM_CLASS_SLOTS);
    expect(
      [...classSlots.values()].filter((codes) => codes.size > 1),
    ).toHaveLength(EXAM_DUAL_CODE_SLOTS);
  });
});
