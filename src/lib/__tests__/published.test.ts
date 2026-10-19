import { describe, it, expect } from "vitest";
import { timetableRowsToSessions, datesheetRowsToExams } from "../published";

describe("timetableRowsToSessions", () => {
  it("keeps complete rows and normalizes fields", () => {
    const sessions = timetableRowsToSessions([
      {
        cls: "BSE-1",
        code: "cs101",
        title: "Intro",
        day: "Mon",
        start: "08:30",
        end: "09:50",
        room: "L-1",
        kind: "lab",
        instructor: "",
        note: "x",
        inferred: false,
      },
      { cls: "BSE-1", code: "CS102", day: "Tue", start: "10:00", end: "11:30" },
    ]);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ code: "CS101", kind: "lab" });
    expect(sessions[1]).toMatchObject({
      code: "CS102",
      kind: "theory",
      room: "",
      inferred: false,
    });
  });
  it("drops incomplete rows", () => {
    expect(
      timetableRowsToSessions([
        { cls: "X", code: "Y", day: "Mon", start: "", end: "9" },
      ]),
    ).toHaveLength(0);
    expect(timetableRowsToSessions([])).toHaveLength(0);
  });
});

describe("datesheetRowsToExams", () => {
  it("builds time from start/end when time is missing", () => {
    const exams = datesheetRowsToExams([
      {
        date: "2026-07-01",
        prog: "BCS",
        sem: 3,
        sec: "A",
        course: "DS",
        code: "CS221",
        start: "09:00",
        end: "12:00",
        rooms: ["R1"],
      },
    ]);
    expect(exams).toHaveLength(1);
    expect(exams[0]).toMatchObject({
      time: "09:00-12:00",
      prog: "BCS",
      sem: 3,
      rooms: ["R1"],
    });
  });
  it("accepts a plain time field and csv rooms", () => {
    const exams = datesheetRowsToExams([
      {
        date: "2026-07-02",
        prog: "BSE",
        sem: 2,
        code: "EE110",
        time: "14:00-16:00",
        rooms: "R2, R3",
      },
    ]);
    expect(exams[0]).toMatchObject({
      time: "14:00-16:00",
      course: "EE110",
      rooms: ["R2", "R3"],
    });
  });
  it("skips rows without usable date/sem/time", () => {
    expect(
      datesheetRowsToExams([
        { date: "2026-07-03", prog: "X", sem: 1 },
        { date: "", prog: "X", sem: 1, time: "a-b" },
      ]),
    ).toHaveLength(0);
  });
});
