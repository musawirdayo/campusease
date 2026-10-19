import { createFileRoute } from "@tanstack/react-router";

function baseUrl(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:8080";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const base = baseUrl(request);
        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /admin",
          "Disallow: /auth",
          "Disallow: /api/",
          "",
          `Sitemap: ${base}/sitemap.xml`,
          "",
        ].join("\n");
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
