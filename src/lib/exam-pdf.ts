//
// A4 portrait PDF of a student's personal exam datesheet, drawn with jsPDF.
// This is the primary print path for /exams: jsPDF bakes in a fixed paper
// layout, so the result is identical on a desktop or a phone — unlike
// window.print(), whose CSS output mobile browsers render unpredictably.
//
// DESIGN (v3, "official department sheet"):
//   · restrained letterspaced masthead over a clean double divider,
//   · thin-bordered student panel in a precise two-column grid (values
//     auto-fit their cell so nothing ever collides with a border),
//   · fixed-width schedule grid — every column has a defined width and
//     every cell the same alignment — with full-width day separator rows
//     and hairline row rules,
//   · notes + signature footer, page numbers when the sheet spans pages.
//// The type scale auto-shrinks so the whole term fits one page; only an
// oversized schedule (larger than any real one in the dataset) continues
// onto a second, cleanly paginated page.
//
// CONSTRAINT: ZERO fill operations. Several phone PDF viewers mangle filled
// rectangles (users got solid-black unreadable rows), so every element is
// text, rules (strokes) or borders on the white page — nothing that any
// viewer can paint as a dark block.
//

import type { CourseDetail, Paper, StudentRec } from "@/lib/exam-data";
import { dateView, i12, studentMeta, ordinalSem } from "@/lib/exam-data";
import { EXAM_DEPT, EXAM_SOURCE, EXAM_TERM } from "@/lib/exam-meta";

// ─── Page geometry (A4 portrait, mm) ────────────────────────────────────
const W = 210;
const H = 297;
const M = 12;
const CW = W - M * 2; // 186 mm usable

/** Schedule columns left→right, widths sum exactly to CW — a fixed grid,
 *  not content-dependent sizing. Proportions (of CW):
 *  TIME 14% · CODE 11% · TITLE 37% · CLASS 10% · ROOM 10% · SEAT 18%. */
const COLW = [26, 20.5, 68.5, 18.6, 18.6, 33.8];
const COLX = COLW.map(
  (_, i) => M + COLW.slice(0, i).reduce((a, b) => a + b, 0),
);
const PAD = 2.0; // horizontal cell text padding
const TITLE_W = COLW[2] - PAD * 2;

// ─── Ink palette (grays only — text and strokes, never fills) ───────────
type RGB = [number, number, number];
const INK: RGB = [23, 29, 43]; // deep charcoal-navy
const SOFT: RGB = [98, 108, 126]; // muted slate
const DARK: RGB = [55, 61, 72];
const RULE: RGB = [216, 221, 230]; // subtle cool gray hairlines
const HEAVY: RGB = [23, 29, 43];

type Row = {
  p: Paper;
  clash: boolean;
  window?: string; // "1st" | "2nd" clash-room sitting
  start: string; // "8:30 AM"
  end: string; // "– 9:50 AM"
  code: string;
  title: string;
  inst: string;
  cls: string;
  room: string;
  seat: string;
};

type DayGroup = { date: string; label: string; rows: Row[] };

// ─── Cell/copy preparation ──────────────────────────────────────────────

/** Clash facts derived from the seat string itself (some first-sitting rows
 *  come without a clashSession flag but still sit in the Clash Room). The
 *  seat is compacted for the narrow column; `window` feeds the time tag. */
function seatMeta(p: Paper): { clash: boolean; seat: string; window?: string } {
  const m = p.seat.match(/^CR-(\d+) (\w+) /);
  if (m)
    return {
      clash: true,
      seat: `CR-${m[1].padStart(2, "0")} · ${m[2]} sitting`,
      window: p.clashSession ?? m[2],
    };
  return {
    clash: !!p.clashSession,
    seat: p.seat || "—",
    window: p.clashSession,
  };
}

function prepRows(
  papers: Paper[],
  detailMap: Map<string, CourseDetail>,
): Row[] {
  return papers.map((p) => {
    const meta = seatMeta(p);
    const [start, end] = i12(p.effectiveSlot ?? p.slot).split("–");
    return {
      p,
      clash: meta.clash,
      window: meta.window,
      start: start ?? "",
      end: end ? `– ${end.trim()}` : "",
      code: p.code || p.title,
      title: p.title,
      inst: detailMap.get(p.code)?.instructors.join(" · ") ?? "",
      cls: p.cls,
      room: p.room || "Room TBA",
      seat: meta.seat,
    };
  });
}

/** Build the one-page (or cleanly paginated) datesheet PDF document. */
export async function buildExamDatesheet({
  student,
  papers,
  detailMap,
}: {
  student: StudentRec;
  papers: Paper[];
  detailMap: Map<string, CourseDetail>;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const ink = (c: RGB) => doc.setTextColor(...c);
  const setF = (style: "normal" | "bold" | "italic", size: number) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };
  const wrap = (
    text: string,
    w: number,
    style: "normal" | "bold" | "italic",
    size: number,
  ) => {
    setF(style, size);
    return doc.splitTextToSize(String(text ?? ""), w) as string[];
  };
  const lh = (size: number) => size * 0.42;
  const rule = (color: RGB, width: number, y: number, x0 = M, x1 = W - M) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
    doc.line(x0, y, x1, y);
  };
  /** Shrink a font until its text fits one line in `w` mm (auto-fit panel
   *  values — long names/regs never collide with a border or the divider). */
  const fitSize = (
    text: string,
    w: number,
    style: "normal" | "bold" | "italic",
    max: number,
    min: number,
  ) => {
    let size = max;
    setF(style, size);
    while (size > min && doc.getTextWidth(String(text ?? "")) > w) {
      size -= 0.3;
      setF(style, size);
    }
    return size;
  };
  const center = (
    t: string,
    y: number,
    style: "normal" | "bold" | "italic",
    size: number,
    c: RGB,
    charSpace = 0,
  ) => {
    setF(style, size);
    ink(c);
    if (charSpace) {
      // jsPDF aligns "center" WITHOUT including letterspacing (and applies
      // charSpace in document units — mm), which pushes letterspaced lines
      // far right of center. Compute the full visual width manually.
      const w = doc.getTextWidth(t) + (t.length - 1) * charSpace;
      doc.text(t, W / 2 - w / 2, y, { charSpace });
    } else {
      doc.text(t, W / 2, y, { align: "center" });
    }
  };

  // ─── Source data ──────────────────────────────────────────────────────
  const rows = prepRows(papers, detailMap);
  const clashCount = rows.filter((r) => r.clash).length;
  const dates = papers
    .map((p) => p.date)
    .filter(Boolean)
    .sort();
  const meta = studentMeta(student);

  // ─── Footer copy (fixed height, measured first) ───────────────────────
  const noteA =
    `Note — Clash Room: students with two papers at the same time sit both ` +
    `papers there one after the other, so the seat column shows the room and ` +
    `the sitting window.` +
    (clashCount
      ? ` This schedule includes ${clashCount} clash-room sitting${clashCount === 1 ? "" : "s"} — arrive 15 minutes early.`
      : "");
  const noteB = `Source: the official ${EXAM_DEPT} seating plan — ${EXAM_SOURCE}. Always verify against the posted hard copy.`;
  const noteLines = [
    ...wrap(noteA, CW - 2, "normal", 6.6),
    ...wrap(noteB, CW - 2, "normal", 6.6),
  ];
  const noteH = noteLines.length * lh(6.6) + 2.5;
  const sigY = H - 9;
  const tableBottomMax = sigY - 5 - noteH - 7; // room for rule + notes + signature

  // ─── Masthead ──────────────────────────────────────────────────────────
  center("COMSATS UNIVERSITY ISLAMABAD", 17, "bold", 9.5, SOFT, 1.3);
  center("MIDTERM EXAMINATION", 25, "bold", 16, INK, 0.7);
  center("PERSONAL DATE SHEET", 31, "bold", 10, DARK, 1.4);
  center(EXAM_TERM.toUpperCase(), 36, "normal", 7.8, SOFT);
  rule(HEAVY, 0.9, 39.6);
  rule(RULE, 0.25, 41.2);

  // ─── Student panel — precise two-column grid, thin border ─────────────
  const py = 46;
  const ph = 18.5;
  const leftW = CW / 2; // perfectly equal halves
  const HALF_W = leftW;
  const panelCell = (
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
    vMax: number,
    vMin: number,
  ) => {
    setF("normal", 5.2);
    ink(SOFT);
    doc.text(label.toUpperCase(), x + 2.6, y + 3.6, { charSpace: 0.6 });
    fitSize(value, w - 5.2, "bold", vMax, vMin); // leaves the font set
    ink(INK);
    doc.text(String(value ?? ""), x + 2.6, y + 8.4);
  };
  doc.setDrawColor(...HEAVY);
  doc.setLineWidth(0.25); // thin, even frame — never thick
  doc.rect(M, py, CW, ph);
  rule(RULE, 0.2, py + ph / 2);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(M + leftW, py, M + leftW, py + ph); // vertical split
  panelCell(
    M,
    py,
    HALF_W,
    "Student name",
    student.name || "Unnamed student",
    11,
    7,
  );
  panelCell(
    M + leftW,
    py,
    HALF_W,
    "Registration number",
    student.reg,
    8.6,
    6.5,
  );
  panelCell(
    M,
    py + ph / 2,
    HALF_W,
    "Program · semester · section",
    [
      meta.prog,
      meta.sem ? `${ordinalSem(meta.sem)} semester` : "",
      meta.sec ? `section ${meta.sec}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "—",
    8.8,
    6.5,
  );
  panelCell(
    M + leftW,
    py + ph / 2,
    HALF_W,
    "Intake · papers · exam window",
    `${meta.intake || "—"} · ${rows.length} papers${
      dates[0]
        ? ` · ${dateView(dates[0])} – ${dateView(dates[dates.length - 1])}`
        : ""
    }`,
    7.6,
    6.2,
  );

  // ─── Schedule table ───────────────────────────────────────────────────
  const ty = py + ph + 7.5;
  const HEAD_H = 7.4;

  /** Exam days in drawing order, each with its full-width group row label. */
  const groups: DayGroup[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.p.date) last.rows.push(r);
    else
      groups.push({
        date: r.p.date,
        label:
          new Date(`${r.p.date}T00:00:00`).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }) || r.p.date,
        rows: [r],
      });
  }

  /** Paper-row height at a given type scale. */
  const rowH = (r: Row, s: number) => {
    const titleL = wrap(r.title, TITLE_W, "normal", 9 * s).length;
    const instL = r.inst ? wrap(r.inst, TITLE_W, "italic", 6.3 * s).length : 0;
    const hTime =
      lh(8.2 * s) + lh(7 * s) + (r.clash ? lh(5.7 * s) + 0.3 : 0) + 0.4; // two-line time + optional clash tag
    const hTitle =
      titleL * lh(9 * s) + (r.inst ? instL * lh(6.3 * s) + 0.6 : 0);
    const hOther =
      Math.max(
        wrap(r.seat, COLW[5] - PAD * 2, "bold", 7.4 * s).length,
        wrap(r.room, COLW[4] - PAD * 2, "normal", 7.4 * s).length,
        1,
      ) * lh(7.4 * s);
    return Math.max(7.8, 2.9 + Math.max(hTime, hTitle, hOther));
  };
  const DAY_H = 7.0;
  const tableH = (s: number) =>
    HEAD_H +
    groups.reduce(
      (a, g) => a + DAY_H + 1.6 + g.rows.reduce((b, r) => b + rowH(r, s), 0),
      0,
    );

  // Shrink the type scale until the table ends above the footer.
  let s = 1;
  let tbH = tableH(s);
  while (ty + tbH > tableBottomMax && s > 0.66) {
    s -= 0.04;
    tbH = tableH(s);
  }

  /** Pack day groups onto pages (one page in every real-world case; the
   *  second page only exists as a clean fallback for oversized schedules). */
  const HEAD_Y2 = 14.5; // table header position on continuation pages
  const pages: { headY: number; groups: DayGroup[] }[] = [];
  {
    let y = ty + HEAD_H;
    let cur: DayGroup[] = [];
    for (const g of groups) {
      const gh = DAY_H + 1.6 + g.rows.reduce((b, r) => b + rowH(r, s), 0);
      if (cur.length && y + gh > tableBottomMax) {
        pages.push({ headY: ty, groups: cur });
        cur = [];
        y = HEAD_Y2 + HEAD_H;
      }
      cur.push(g);
      y += gh;
    }
    if (cur.length)
      pages.push({
        headY: pages.length === 0 ? ty : HEAD_Y2,
        groups: cur,
      });
  }
  const multiPage = pages.length > 1;

  /** Column header row, drawn at the top of every page. */
  const drawTableHead = (headY: number) => {
    rule(RULE, 0.25, headY);
    setF("normal", 5.6);
    ink(SOFT);
    ["Time", "Course", "Course title", "Class", "Room", "Seat"].forEach(
      (h, i) =>
        doc.text(h.toUpperCase(), COLX[i] + PAD, headY + 4.6, {
          charSpace: 0.45,
        }),
    );
    rule(HEAVY, 1.1, headY + HEAD_H);
  };

  let yEnd = ty;
  pages.forEach((pg, pi) => {
    if (pi > 0) doc.addPage();
    const headY = pg.headY;
    drawTableHead(headY);
    const sepTop = headY;
    let y = headY + HEAD_H;

    for (const g of pg.groups) {
      // Day row: muted letterspaced label + paper count, thin rule below
      setF("bold", 7.2 * s);
      ink(INK);
      doc.text(g.label.toUpperCase(), M + PAD, y + 4.4, { charSpace: 0.7 });
      setF("normal", 6.4 * s);
      ink(SOFT);
      doc.text(
        `${g.rows.length} paper${g.rows.length === 1 ? "" : "s"}`,
        W - M - PAD,
        y + 4.4,
        { align: "right" },
      );
      y += DAY_H;
      rule(RULE, 0.3, y);
      y += 1.6;

      for (const r of g.rows) {
        const h = rowH(r, s);
        const firstBase = y + 2.4; // top of the text block
        // hairline separator under every paper row (no fills anywhere)
        rule(RULE, 0.15, y + h);
        // Time: start bold over "– end" soft, + clash tag when clash-room
        setF("bold", 8.2 * s);
        ink(INK);
        doc.text(r.start, COLX[0] + PAD, firstBase);
        setF("normal", 7 * s);
        ink(SOFT);
        doc.text(r.end, COLX[0] + PAD, firstBase + lh(8.2 * s));
        if (r.clash) {
          setF("bold", 5.7 * s);
          ink(DARK);
          doc.text(
            `[Clash · ${r.window ?? "clash"} sitting]`,
            COLX[0] + PAD,
            firstBase + lh(8.2 * s) + lh(7 * s) + 0.6,
          );
        }
        // Course code · Title (primary) · instructor beneath (muted italic)
        setF("bold", 7.8 * s);
        ink(INK);
        doc.text(r.code, COLX[1] + PAD, firstBase + lh(8.2 * s) * 0.82);
        setF("normal", 9 * s);
        ink(INK);
        let tl = firstBase;
        wrap(r.title, TITLE_W, "normal", 9 * s).forEach((t) => {
          doc.text(t, COLX[2] + PAD, tl);
          tl += lh(9 * s);
        });
        if (r.inst) {
          setF("italic", 6.3 * s);
          ink(SOFT);
          wrap(r.inst, TITLE_W, "italic", 6.3 * s).forEach((t) => {
            doc.text(t, COLX[2] + PAD, tl);
            tl += lh(6.3 * s);
          });
        }
        // Class · Room · Seat (seat is the actionable info — bold dark)
        setF("normal", 7.4 * s);
        ink(SOFT);
        doc.text(r.cls, COLX[3] + PAD, firstBase + lh(8.2 * s) * 0.82);
        doc.text(r.room, COLX[4] + PAD, firstBase + lh(8.2 * s) * 0.82);
        setF("bold", 7.4 * s);
        ink(INK);
        wrap(r.seat, COLW[5] - PAD * 2, "bold", 7.4 * s).forEach((t, i) =>
          doc.text(
            t,
            COLX[5] + PAD,
            firstBase + lh(8.2 * s) * (i * 0.82 + 0.82),
          ),
        );
        y += h;
      }
    }

    // Column separators across this page's schedule body
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.12);
    for (let i = 1; i < COLX.length; i++) doc.line(COLX[i], sepTop, COLX[i], y);
    rule(HEAVY, 1.1, y);
    rule(RULE, 0.25, y + 1.4); // closing hairline, mirrors the masthead
    yEnd = y;
  });

  // ─── Notes + signature footer (last page) ─────────────────────────────
  let ny = yEnd + 6.5;
  rule(RULE, 0.25, ny);
  ny += 3.6;
  setF("normal", 6.6);
  ink(SOFT);
  noteLines.forEach((t) => {
    doc.text(t, M, ny);
    ny += lh(6.6);
  });

  setF("normal", 6.4);
  ink(SOFT);
  if (multiPage) {
    // Page numbers only when the sheet actually spans pages
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.text(
        `CampusEase · generated ${new Date().toLocaleDateString("en-GB")}`,
        M,
        sigY,
      );
      doc.text(`Page ${i} of ${total}`, W / 2, sigY, { align: "center" });
    }
    doc.setPage(total);
  } else {
    doc.text(
      `CampusEase · generated ${new Date().toLocaleDateString("en-GB")}`,
      M,
      sigY,
    );
    doc.text("Made by Musawir", W - M, sigY, { align: "right" });
  }

  return doc;
}

export async function downloadExamDatesheetPdf(opts: {
  student: StudentRec;
  papers: Paper[];
  detailMap: Map<string, CourseDetail>;
}) {
  const doc = await buildExamDatesheet(opts);
  doc.save("CampusEase-exam-datesheet.pdf");
}
