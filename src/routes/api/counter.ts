import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { clientIp, rateLimit } from "@/lib/rate-limit.server";

// ─── The "personal timetables generated" counter ─────────────────────────
// Every successful weekly schedule or exam profile generation increments the
// aggregate counter. It is event-based, with no per-device/day deduplication.
const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });

function db() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.SUPABASE_URL) return null;
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

const H = { "content-type": "application/json", "cache-control": "no-store" };
const unavailable = () =>
  json({ error: "Counter temporarily unavailable." }, 503, H);

export const Route = createFileRoute("/api/counter")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = clientIp(request);
        const burst = rateLimit(`counter:${ip}`, 30, 60_000);
        if (!burst.ok)
          return json({ error: "Too many requests." }, 429, {
            ...H,
            "retry-after": String(burst.retryAfter),
          });

        const client = db();
        if (!client) return unavailable();
        const { data, error } = await client
          .from("app_counter")
          .select("count")
          .eq("id", 1)
          .maybeSingle();
        if (error || !data) return unavailable();
        return json({ count: Number(data.count) }, 200, H);
      },

      POST: async ({ request }) => {
        const ip = clientIp(request);
        const burst = rateLimit(`counter:${ip}`, 30, 60_000);
        if (!burst.ok)
          return json({ error: "Too many requests." }, 429, {
            ...H,
            "retry-after": String(burst.retryAfter),
          });

        const client = db();
        if (!client) return unavailable();

        const { data, error } = await client.rpc("bump_counter");
        if (error || data === null) return unavailable();
        return json({ count: data ?? 0, counted: true }, 200, H);
      },
    },
  },
});
