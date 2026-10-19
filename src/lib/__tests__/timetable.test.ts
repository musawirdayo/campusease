import { describe, it, expect } from "vitest";
import {
  findClashes,
  suggestFixes,
  autoResolve,
  dedupeSessions,
  dayStats,
  type Picked,
} from "../timetable";
import { buildGridLayout } from "../timetable-layout";
import type { ClassSession } from "../types";

const s = (
  cls: string,
  code: string,
  day: ClassSession["day"],
  start: string,
  end: string,
): ClassSession => ({
  cls,
  code,
  title: code,
  day,
  start,
  end,
  room: "",
  kind: "theory",
  instructor: "",
  note: "",
  inferred: false,
});
const pick = (id: string, x: ClassSession): Picked => ({
  id,
  cls: x.cls,
  code: x.code,
  title: x.code,
  sessions: [{ ...x, sid: id + "s" }],
});

describe("clash resolver", () => {
  const A = pick("a", s("BCS-3A", "CSC211", "Mon", "08:30", "10:00"));
  const B = pick("b", s("BCS-3A", "MTH231", "Mon", "09:00", "10:30"));
  const alts = (code: string) =>
    code === "MTH231"
      ? [
          {
            cls: "BCS-3A",
            sessions: [s("BCS-3A", "MTH231", "Mon", "09:00", "10:30")],
          },
          {
            cls: "BCS-3B",
            sessions: [s("BCS-3B", "MTH231", "Tue", "09:00", "10:30")],
          },
        ]
      : [
          {
            cls: "BCS-3A",
            sessions: [s("BCS-3A", "CSC211", "Mon", "08:30", "10:00")],
          },
        ];

  it("detects the overlap", () => expect(findClashes([A, B])).toHaveLength(1));
  it("suggests switching to a section with no clash", () => {
    expect(suggestFixes([A, B], alts)[0]).toMatchObject({
      code: "MTH231",
      to: "BCS-3B",
      after: 0,
    });
  });
  it("auto-resolve removes all clashes", () =>
    expect(findClashes(autoResolve([A, B], alts))).toHaveLength(0));
  it("back-to-back classes are not a clash", () => {
    expect(
      findClashes([A, pick("c", s("X", "Y", "Mon", "10:00", "11:00"))]),
    ).toHaveLength(0);
  });
  it("never suggests swapping a hand-edited pick", () => {
    const edited: Picked = {
      ...B,
      sessions: B.sessions.map((x) => ({ ...x, edited: true })),
    };
    expect(suggestFixes([A, edited], alts)).toHaveLength(0);
  });
});

describe("dedupeSessions", () => {
  const base = s("BCS-3A", "CSC211", "Mon", "08:30", "10:00");
  it("drops exact duplicates", () => {
    const a = { ...base, sid: "1" };
    const b = { ...base, sid: "2" };
    expect(dedupeSessions([a, b])).toHaveLength(1);
  });
  it("keeps different days/times even for the same code", () => {
    const a = { ...base, sid: "1" };
    const b = { ...base, sid: "2", day: "Tue" as const };
    expect(dedupeSessions([a, b])).toHaveLength(2);
  });
  it("an edited duplicate replaces the raw one", () => {
    const a = { ...base, sid: "1" };
    const b = { ...base, sid: "2", room: "201", edited: true };
    const out = dedupeSessions([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].room).toBe("201");
  });
  it("a different time is a different session, not a duplicate", () => {
    const a = { ...base, sid: "1" };
    const b = { ...base, sid: "2", start: "09:00", edited: true };
    expect(dedupeSessions([a, b])).toHaveLength(2);
  });
});

describe("dayStats", () => {
  it("summarises free days and the busiest day", () => {
    const st = dayStats([
      pick("a", s("X", "CSC211", "Mon", "08:30", "10:00")),
      pick("b", s("X", "MTH231", "Mon", "11:00", "12:00")),
      pick("c", s("X", "HUM120", "Wed", "09:00", "10:30")),
    ]);
    expect(st.daysUsed).toBe(2);
    expect(st.busiestDay).toBe("Mon");
    expect(st.busiestCount).toBe(2);
    expect(st.freeDays).toContain("Fri");
    expect(st.earliest).toBe(510);
    expect(st.latest).toBe(720);
  });
  it("handles an empty week", () => {
    const st = dayStats([]);
    expect(st.daysUsed).toBe(0);
    expect(st.busiestDay).toBe(null);
    expect(st.earliest).toBe(null);
  });
});

describe("timetable grid layout", () => {
  const A = pick("a", s("BCS-3A", "CSC211", "Mon", "08:30", "10:00"));
  const B = pick("b", s("BCS-3A", "MTH231", "Mon", "09:00", "10:30"));
  const L = pick("l", s("BCS-3A", "CSC211L", "Tue", "08:30", "11:30"));

  it("uses the student's own times as columns", () => {
    const g = buildGridLayout([A, L]);
    expect(g.cols.map((c) => [c.start, c.end])).toEqual([
      [510, 600],
      [600, 690],
    ]);
  });
  it("a 3-hour lab spans both columns", () => {
    const cell = buildGridLayout([A, L]).rows.find((r) => r.day === "Tue")!
      .lanes[0][0];
    expect(cell).toMatchObject({ col: 0, span: 2 });
  });
  it("clashing classes go to separate lanes and stay visible", () => {
    const mon = buildGridLayout([A, B]).rows.find((r) => r.day === "Mon")!;
    expect(mon.lanes).toHaveLength(2);
    expect(mon.lanes.flat().every((c) => c.clash)).toBe(true);
  });
  it("only days with classes are shown", () =>
    expect(buildGridLayout([A]).days).toEqual(["Mon"]));
});
