// Layout-preserving PDF text extraction (browser only). Timetables are grids, so we keep
// rows (by y) and columns (by x gaps) instead of flattening text into one line.
const V = "4.7.76";
const CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.min.mjs`;
const WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.worker.min.mjs`;

type Item = { str: string; x: number; y: number; w: number };

// Minimal structural types for the CDN-loaded pdf.js build.
type PdfJsLike = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (i: number) => Promise<{
        getTextContent: () => Promise<{
          items: { str?: string; transform: number[]; width: number }[];
        }>;
      }>;
    }>;
  };
};

export async function extractPdfPages(file: File): Promise<string[]> {
  const pdfjs = (await import(/* @vite-ignore */ CDN)) as unknown as PdfJsLike;
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const items: Item[] = tc.items
      .filter(
        (s): s is { str: string; transform: number[]; width: number } =>
          typeof s.str === "string" && s.str.trim().length > 0,
      )
      .map((s) => ({
        str: s.str.trim(),
        x: s.transform[4],
        y: s.transform[5],
        w: s.width,
      }));
    // group into rows with tolerance
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Item[][] = [];
    for (const it of items) {
      const r = rows.find((r) => Math.abs(r[0].y - it.y) < 3);
      if (r) r.push(it);
      else rows.push([it]);
    }
    const lines = rows.map((r) => {
      r.sort((a, b) => a.x - b.x);
      let out = "",
        lastEnd = -1;
      for (const it of r) {
        if (lastEnd >= 0) out += it.x - lastEnd > 6 ? ` | ` : " ";
        out += `${it.str}`;
        lastEnd = it.x + it.w;
      }
      return `@${Math.round(r[0].x)}: ${out}`;
    });
    pages.push(lines.join("\n"));
  }
  return pages;
}
