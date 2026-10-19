import { createFileRoute } from "@tanstack/react-router";

function baseUrl(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:8080";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

const PAGES = [
  { path: "/", priority: "1.0", freq: "weekly" },
  { path: "/classes", priority: "0.9", freq: "weekly" },
  { path: "/exams", priority: "0.9", freq: "weekly" },
  { path: "/contact", priority: "0.5", freq: "yearly" },
  { path: "/policy", priority: "0.3", freq: "yearly" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const base = baseUrl(request);
        const today = new Date().toISOString().slice(0, 10);
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(
          (page) =>
            `  <url><loc>${new URL(page.path, base).href}</loc><lastmod>${today}</lastmod><changefreq>${page.freq}</changefreq><priority>${page.priority}</priority></url>`,
        ).join("\n")}\n</urlset>\n`;
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
