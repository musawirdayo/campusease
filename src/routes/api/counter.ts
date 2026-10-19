import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function db() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const H = { "content-type": "application/json", "cache-control": "no-store" };

export const Route = createFileRoute("/api/counter")({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await db()
          .from("app_counter")
          .select("count")
          .eq("id", 1)
          .maybeSingle();
        return new Response(
          JSON.stringify({ count: Number(data?.count ?? 0) }),
          { headers: H },
        );
      },
      POST: async () => {
        const { data, error } = await db().rpc("bump_counter");
        if (error)
          return new Response(
            JSON.stringify({ error: "Counter unavailable" }),
            { status: 500, headers: H },
          );
        return new Response(JSON.stringify({ count: Number(data) }), {
          headers: H,
        });
      },
    },
  },
});
