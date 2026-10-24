import { createFileRoute } from "@tanstack/react-router";
import {
  findStudentExact,
  findStudentSuggestions,
} from "@/lib/exam-dataset.server";
import { clientIp, rateLimit } from "@/lib/rate-limit.server";

// GET ?reg=... returns one selected profile. GET ?q=... returns up to eight
// name/roll suggestions, without papers, rooms, or seats. Those details are
// returned only after a student is selected and their exact profile loads.
//
// Rate limits (per IP): 30/min and 300/day — generous enough for repeated
// professor/spelling retries, tight enough to stop bulk scraping.
const H = { "content-type": "application/json", "cache-control": "no-store" };

const tooMany = (retryAfter: number) =>
  new Response(
    JSON.stringify({
      error: "Too many lookups — please wait a moment and try again.",
    }),
    { status: 429, headers: { ...H, "retry-after": String(retryAfter) } },
  );

export const Route = createFileRoute("/api/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = clientIp(request);
        const burst = rateLimit(`lookup:${ip}`, 30, 60_000);
        if (!burst.ok) return tooMany(burst.retryAfter);
        const day = rateLimit(`lookup-day:${ip}`, 300, 86_400_000);
        if (!day.ok) return tooMany(3600);

        const params = new URL(request.url).searchParams;
        const query = params.get("q")?.trim();
        if (query) {
          return new Response(
            JSON.stringify({ suggestions: findStudentSuggestions(query) }),
            { headers: H },
          );
        }
        const core = params.get("reg")?.trim() ?? "";
        const r = findStudentExact(core); // normalizes internally
        return new Response(JSON.stringify(r), { headers: H });
      },
    },
  },
});
