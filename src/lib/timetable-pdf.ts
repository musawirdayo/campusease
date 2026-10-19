import type { Picked } from "@/lib/timetable";
import { DAY_FULL, fmt12 } from "@/lib/timetable";
import { buildGridLayout, fmtMin, ampm } from "@/lib/timetable-layout";

// Print palette (matches the on-screen course colours)
const INK: [number, number, number][] = [
  [37, 87, 176],
  [22, 125, 92],
  [180, 98, 20],
  [128, 52, 156],
  [18, 120, 140],
  [110, 120, 20],
  [170, 40, 90],
  [70, 80, 105],
];
const CLASH: [number, number, number] = [200, 40, 40];
const tint = (c: [number, number, number], k = 0.9) =>
  c.map((v) => Math.round(v + (255 - v) * k)) as [number, number, number];

/** A4 landscape PDF: days down the side, the student's time slots across, full course names. */
export async function downloadTimetablePdf(picks: Picked[], label: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const g = buildGridLayout(picks);
  const W = 297,
    H = 210,
    M = 10;
  const dayW = 24,
    headH = 10;
  const gridW = W - M * 2 - dayW;

  // Column widths: proportional to duration, free gaps kept narrow
  const weights = g.cols.map((c) =>
    c.free ? Math.min(c.end - c.start, 20) : c.end - c.start,
  );
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const colW = weights.map((w) => (w / total) * gridW);
  const colX = colW.map(
    (_, i) => M + dayW + colW.slice(0, i).reduce((a, b) => a + b, 0),
  );

  // Font scale: shrink until the whole week fits on one page
  const top = 30,
    bottom = H - 26;
  let fs = 8.5;
  const measure = (size: number) => {
    let sum = 0;
    const heights = g.rows.map(({ lanes }) =>
      lanes.map((lane) => {
        let h = 0;
        for (const c of lane) {
          const w =
            colW.slice(c.col, c.col + c.span).reduce((a, b) => a + b, 0) - 4;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(size);
          const t = doc.splitTextToSize(c.pick.title, w).length;
          const lh = size * 0.42;
          h = Math.max(h, 3 + lh * 1.0 + t * lh + 3 * lh * 0.9 + 3);
        }
        return Math.max(h, 16);
      }),
    );
    heights.forEach((ls) => ls.forEach((h) => (sum += h)));
    return { heights, sum };
  };
  let m = measure(fs);
  while (m.sum > bottom - top - headH && fs > 5.5) {
    fs -= 0.25;
    m = measure(fs);
  }
  // If there's spare room, let rows breathe
  const stretch = Math.min(1.6, (bottom - top - headH) / m.sum);
  const lh = fs * 0.42;

  // Header
  doc.setTextColor(20, 24, 35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("My weekly class timetable", M, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(95, 100, 115);
  doc.text(label, M, 22);
  doc.text(
    `CampusEase · generated ${new Date().toLocaleDateString("en-GB")}`,
    W - M,
    16,
    { align: "right" },
  );
  doc.setDrawColor(20, 24, 35);
  doc.setLineWidth(0.6);
  doc.line(M, 25, W - M, 25);

  // Column headers
  doc.setLineWidth(0.2);
  doc.setDrawColor(200, 204, 212);
  doc.setFillColor(240, 242, 246);
  doc.rect(M, top, W - M * 2, headH, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(95, 100, 115);
  doc.text("DAY", M + 2, top + 6);
  g.cols.forEach((c, i) => {
    const cx = colX[i] + colW[i] / 2;
    if (c.free) {
      doc.setFontSize(5.5);
      doc.text("FREE", cx, top + 6, { align: "center" });
      return;
    }
    doc.setFontSize(8);
    doc.setTextColor(20, 24, 35);
    doc.text(`${fmtMin(c.start)} – ${fmtMin(c.end)}`, cx, top + 5, {
      align: "center",
    });
    doc.setFontSize(5.5);
    doc.setTextColor(120, 125, 140);
    doc.text(
      ampm(c.start) === ampm(c.end)
        ? ampm(c.start)
        : `${ampm(c.start)}–${ampm(c.end)}`,
      cx,
      top + 8.2,
      { align: "center" },
    );
  });

  // Rows
  let y = top + headH;
  g.rows.forEach(({ day, lanes }, ri) => {
    const laneH = m.heights[ri].map((h) => h * stretch);
    const rowH = laneH.reduce((a, b) => a + b, 0);
    if (ri % 2) {
      doc.setFillColor(249, 250, 252);
      doc.rect(M, y, W - M * 2, rowH, "F");
    }
    // free-slot shading
    g.cols.forEach((c, i) => {
      if (c.free) {
        doc.setFillColor(236, 238, 242);
        doc.rect(colX[i], y, colW[i], rowH, "F");
      }
    });
    // grid lines
    doc.setDrawColor(210, 214, 222);
    doc.line(M, y, W - M, y);
    colX.forEach((x) => doc.line(x, y, x, y + rowH));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(20, 24, 35);
    doc.text(DAY_FULL[day], M + 2, y + rowH / 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120, 125, 140);
    const n = lanes.flat().length;
    doc.text(`${n} class${n === 1 ? "" : "es"}`, M + 2, y + rowH / 2 + 3.5);

    let ly = y;
    lanes.forEach((lane, li) => {
      for (const c of lane) {
        const ink = c.clash ? CLASH : INK[c.color];
        const x = colX[c.col] + 1;
        const w =
          colW.slice(c.col, c.col + c.span).reduce((a, b) => a + b, 0) - 2;
        const h = laneH[li] - 2;
        doc.setFillColor(...tint(ink, c.clash ? 0.86 : 0.9));
        doc.setDrawColor(...tint(ink, 0.55));
        doc.roundedRect(x, ly + 1, w, h, 1.2, 1.2, "FD");
        doc.setFillColor(...ink);
        doc.rect(x, ly + 1, 1.1, h, "F");
        const tx = x + 2.6,
          tw = w - 4;
        let ty = ly + 1 + lh + 1.4;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fs * 0.85);
        doc.setTextColor(...ink);
        const tags = [
          c.session.kind === "lab" ? "LAB" : "",
          c.clash ? "CLASH" : "",
        ]
          .filter(Boolean)
          .join(" · ");
        doc.text(c.pick.code, tx, ty);
        if (tags) doc.text(tags, x + w - 1.5, ty, { align: "right" });
        ty += lh * 1.05;
        doc.setFontSize(fs);
        doc.setTextColor(20, 24, 35);
        const title = doc.splitTextToSize(c.pick.title, tw);
        doc.text(title, tx, ty);
        ty += title.length * lh;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fs * 0.82);
        doc.setTextColor(70, 75, 90);
        const lines = [
          `${fmt12(c.session.start)} – ${fmt12(c.session.end)}`,
          `${c.session.room || "Room TBA"} · ${c.pick.cls}`,
          c.session.instructor || "",
        ].filter(Boolean);
        for (const l of lines) {
          doc.text(doc.splitTextToSize(l, tw)[0], tx, ty);
          ty += lh * 0.92;
        }
      }
      ly += laneH[li];
    });
    y += rowH;
  });
  doc.setDrawColor(200, 204, 212);
  doc.rect(M, top, W - M * 2, y - top);

  // Course key
  const ky = Math.min(y + 6, H - 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(95, 100, 115);
  doc.text("COURSES", M, ky);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 24, 35);
  const perCol = Math.ceil(picks.length / 3) || 1;
  picks.forEach((p, i) => {
    const kx = M + Math.floor(i / perCol) * ((W - M * 2) / 3);
    const yy = ky + 4 + (i % perCol) * 3.4;
    if (yy > H - 8) return;
    doc.setFillColor(...INK[i % INK.length]);
    doc.rect(kx, yy - 2, 2, 2, "F");
    doc.text(
      doc.splitTextToSize(
        `${p.code}  ${p.title}  (${p.cls})`,
        (W - M * 2) / 3 - 6,
      )[0],
      kx + 3.5,
      yy,
    );
  });

  doc.setFontSize(6.5);
  doc.setTextColor(120, 125, 140);
  doc.text(
    "Always double-check with your department's official timetable.",
    M,
    H - 5,
  );
  doc.text("CampusEase · Made by Musawir", W - M, H - 5, { align: "right" });
  doc.save("CampusEase-weekly-timetable.pdf");
}
