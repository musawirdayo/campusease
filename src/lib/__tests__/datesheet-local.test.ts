import { describe, expect, it } from "vitest";
import { parseMidDatesheet, parseClassToken } from "../datesheet-local";

// Real rows from "Mids D-Sheet CS v1.pdf" (pdf-layout.ts format), including the
// quirky multiroom / wrapped / drifted variants actually found in the file.
const SAMPLE = `@34: Mid DateSheet FA26 – Department of Computer Science
@34: Fall 2026 Midterm · ST = total strength of the class in the course · Occ. = students of the class seated in that room
@56: Date | Time | Class | Sec | ST | Course | Title | Instructor | Room | Cap. | Occ. | Block
@56: Mon
@124: 08:30-09:50 | BAE-5B | B | 37 | CSC325 | Computer Organization and Assembly Language | Raja Rashid Mehmood | 107 | 50 | 22 | AB-II
@56: 02-Nov-2026
@56: Mon
@124: 08:30-09:50 | BAE-5B | B | 37 | CSC325 | Computer Organization and Assembly Language | Raja Rashid Mehmood | 110 | 50 | 15 | AB-II
@56: 02-Nov-2026
@56: Mon
@124: 08:30-09:50 | BAI-2A | A | 51 | HUM120 | Expository Writing | Mahnoor | 106 | 50 | 25 | AB-II
@56: 02-Nov-2026
@56: Mon | Mehreen Fatima (Hybrid
@124: 08:30-09:50 | — | A | 1 | HUM102 | Report Writing Skills | 105 | 46 | 1 | AB-II
@56: 02-Nov-2026 | HUM102)
@56: Mon | Applications of Information and Communication
@124: 13:00-14:20 | BDS-1A | A | 51 | CSC101 | Mr. Waqas Ali | G-05 | 100 | 50 | AB-II
@56: 02-Nov-2026 | Technologies
@56: Mon | ALL PROGRAM
@124: 14:30-15:50 | A | 128 | HUM430 | French | Sadan Ali | G-05 | 100 | 28 | AB-II
@56: 02-Nov-2026 | 8A
@56: Mon | ALL PROGRAM
@124: 14:30-15:50 | A | 128 | HUM430 | French | Sadan Ali | G-06 | 100 | 50 | AB-II
@56: 02-Nov-2026 | 8A
@56: Mon
@124: 11:30-12:50 | BSE-5B | B | 39 | CSC323 | Operating Systems | Hafiza Sundus Farooq | G-05 | 100 | 3 | AB-II
@56: 02-Nov-2026
@56: Mon
@124: 11:30-12:50 | F | F | 1 | PHY124 | Applied Physics | Muhammad Moosa | G-07 | 70 | 1 | AB-II
@56: 02-Nov-2026
@56: Mon
@124: 13:00-14:20 | BSE-3B | B | 55 | MTH104 | Calculus and Analytic Geometry | Dr. Shumaila Javeed | G-05 | 100 | 48 | AB-II
@56: 02-Nov-2026
@783: Page 2`;

describe("parseMidDatesheet (FA26 layout)", () => {
  const { department, exams } = parseMidDatesheet(SAMPLE);

  it("recovers the department", () => {
    expect(department).toBe("Computer Science");
  });

  it("parses clean rows with correct fields", () => {
    const bae = exams.find((e) => e.code === "CSC325");
    expect(bae).toBeTruthy();
    expect(bae!.date).toBe("2026-11-02");
    expect(bae!.time).toBe("08:30-09:50");
    expect(bae!.prog).toBe("BAE");
    expect(bae!.sem).toBe(5);
    expect(bae!.sec).toBe("B");
    expect(bae!.rooms.sort()).toEqual(["107", "110"]);
    expect(bae!.instructor).toContain("Raja");
  });

  it("merges one-exam-many-room rows into a single exam", () => {
    const matches = exams.filter(
      (e) => e.code === "CSC325" && e.time === "08:30-09:50",
    );
    expect(matches.length).toBe(1);
  });

  it("handles rows whose instructor drifted into the date column", () => {
    const drift = exams.find((e) => e.code === "HUM102");
    expect(drift).toBeTruthy();
    expect(drift!.course).toBeTruthy();
    expect(drift!.sec).toBe("A");
    expect(drift!.rooms).toEqual(["105"]);
  });

  it("keeps ALL PROGRAM rows usable", () => {
    const french = exams.filter((e) => e.code === "HUM430");
    expect(french.length).toBe(1);
    expect(french[0].prog).toBe("ALL");
    expect(french[0].sem).toBe(8);
    expect(french[0].rooms.sort()).toEqual(["G-05", "G-06"]);
  });

  it("maps slot and course title for a normal row", () => {
    const os = exams.find((e) => e.code === "CSC323");
    expect(os!.time).toBe("11:30-12:50");
    expect(os!.course.toLowerCase()).toContain("operating");
    expect(os!.sec).toBe("B");
  });

  it("emits at most one exam per (date, slot, class, code)", () => {
    const seen = new Set<string>();
    for (const e of exams) {
      const k = `${e.date}|${e.time}|${e.prog}|${e.sem}|${e.sec}|${e.code}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it("excludes header/noise lines", () => {
    expect(exams.every((e) => e.code)).toBe(true);
    expect(exams.some((e) => e.date === "")).toBe(false);
  });
});

describe("FA26 quirks found in the real v1 PDF", () => {
  const DRIFT = `@56: Mon | Mehmood Anwar (Hybrid
@124: 08:30-09:50 | BCS-2A | A | 52 | HUM120 | Expository Writing | 107 | 50 | 14 | AB-II
@56: 02-Nov-2026 | HUM102)
@56: Mon | Mehmood Anwar (Hybrid
@124: 08:30-09:50 | BCS-2A | A | 52 | HUM120 | Expository Writing | 110 | 50 | 25 | AB-II
@56: 02-Nov-2026 | HUM102)`;

  it("reassembles a wrapped instructor across three lines", () => {
    const { exams } = parseMidDatesheet(DRIFT);
    expect(exams.length).toBe(1);
    expect(exams[0].prog).toBe("BCS");
    expect(exams[0].sem).toBe(2);
    expect(exams[0].sec).toBe("A");
    expect(exams[0].instructor).toBe("Mehmood Anwar (Hybrid HUM102)");
    expect(exams[0].rooms.sort()).toEqual(["107", "110"]);
  });

  const NOCLASS = `@124: 08:30-09:50 | — | A | 1 | HUM102 | Report Writing Skills | 105 | 46 | 1 | AB-II
@56: Mon | Mehreen Fatima (Hybrid
@56: 02-Nov-2026
@56: 02-Nov-2026 | HUM102)
@180: HUM102 | Report Writing Skills | Mehreen Fatima (Hybrid HUM102)`;

  it("recovers a class token that wrapped away from its row", () => {
    const { exams } = parseMidDatesheet(NOCLASS);
    const e = exams.find((x) => x.code === "HUM102");
    expect(e).toBeTruthy();
  });

  const REPEATERS = `@124: 08:30-09:50 | BS-R | R | 59 | CSC103 | Programming Fundamentals | Sadia Asif Malik | 107 | 50 | 25 | AB-II
@56: 02-Nov-2026
@56: Mon
@124: 10:00-11:20 | Phy-R | F | 6 | PHY121 | Applied Physics for Engineers | Dr. Muhammad Zain Mobeen | G-08 | 100 | 6 | AB-II
@56: 02-Nov-2026
@56: Mon
@124: 11:30-12:50 | F | F | 1 | PHY124 | Applied Physics | Muhammad Moosa | G-07 | 70 | 1 | AB-II
@56: 02-Nov-2026`;

  it("parses repeater class tokens (BS-R, Phy-R, F)", () => {
    const { exams } = parseMidDatesheet(REPEATERS);
    expect(exams.map((e) => `${e.prog}:${e.sec}`).sort()).toEqual([
      "BS:R",
      "F:F",
      "PHY:F",
    ]);
    expect(exams.every((e) => e.sem === 0)).toBe(true);
  });

  const COMBINED = `@124: 08:30-09:50 | BCS-6AB | A | 74 | CSC303 | Mobile Application Development | Mr. Adnan Karamat | 110 | 50 | 25 | AB-II
@56: 04-Nov-2026`;

  it("accepts combined-section tokens (BCS-6AB) with the Sec column winning", () => {
    const { exams } = parseMidDatesheet(COMBINED);
    expect(exams.length).toBe(1);
    expect(exams[0].prog).toBe("BCS");
    expect(exams[0].sem).toBe(6);
    expect(exams[0].sec).toBe("A");
  });
});

describe("parseClassToken", () => {
  it("splits BAE-5B", () =>
    expect(parseClassToken("BAE-5B")).toEqual({
      prog: "BAE",
      sem: 5,
      sec: "B",
    }));
  it("splits ALL PROGRAM 8A", () =>
    expect(parseClassToken("ALL PROGRAM 8A")).toEqual({
      prog: "ALL",
      sem: 8,
      sec: "A",
    }));
  it("splits BCS-12", () =>
    expect(parseClassToken("BCS-12")).toEqual({
      prog: "BCS",
      sem: 12,
      sec: "",
    }));
  it("splits combined-section BCS-6AB", () =>
    expect(parseClassToken("BCS-6AB")).toEqual({
      prog: "BCS",
      sem: 6,
      sec: "AB",
    }));
  it("splits repeater tokens BS-R and Phy-R", () => {
    expect(parseClassToken("BS-R")).toEqual({ prog: "BS", sem: 0, sec: "R" });
    expect(parseClassToken("Phy-R")).toEqual({
      prog: "PHY",
      sem: 0,
      sec: "R",
    });
  });
});
