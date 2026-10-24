import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  deviceCookieHeader,
  deviceFrom,
  withDeviceCookie,
} from "@/lib/device-cookie.server";

// Students are anonymous: the "account" is a device token in an httpOnly
// cookie. All schedule data lives server-side (student_schedules table) and
// is fetched fresh every session — nothing schedule-related persists in the
// browser beyond that random, non-identifying token.
const KINDS = new Set(["classes", "datesheet"]);
const MAX_BYTES = 200_000;

function db() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.SUPABASE_URL) return null;
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

const json = (
  body: unknown,
  opts: { status?: number; headers?: Record<string, string> } = {},
) =>
  new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
  });

export const Route = createFileRoute("/api/student-schedules")({
  server: {
    handlers: {
      // Lazily creates the device cookie and returns every saved schedule.
      GET: async ({ request }) => {
        const client = db();
        if (!client)
          return json(
            { error: "Persistence unavailable (service key not configured)." },
            { status: 503 },
          );
        const { token, fresh } = deviceFrom(request);
        const headers = withDeviceCookie({}, deviceCookieHeader(token, fresh));

        const { data, error } = await client
          .from("student_schedules")
          .select("kind, data, updated_at")
          .eq("device_token", token);
        if (error)
          return json(
            { error: "Could not load your saved schedules." },
            { status: 500, headers: hk(headers) },
          );
        const rows = (data ?? []).filter((r) => KINDS.has(r.kind));
        return json({ schedules: rows }, { headers: hk(headers) });
      },

      POST: async ({ request }) => {
        const client = db();
        if (!client)
          return json(
            { error: "Persistence unavailable (service key not configured)." },
            { status: 503 },
          );
        const body = (await request.json().catch(() => ({}))) as {
          kind?: string;
          data?: unknown;
        };
        if (!body.kind || !KINDS.has(body.kind))
          return json({ error: "Unknown schedule kind." }, { status: 400 });
        const payload = JSON.stringify(body.data ?? null);
        if (payload.length > MAX_BYTES)
          return json({ error: "Schedule too large." }, { status: 413 });

        const { token, fresh } = deviceFrom(request);
        const headers = withDeviceCookie({}, deviceCookieHeader(token, fresh));

        const { error } = await client.from("student_schedules").upsert(
          {
            device_token: token,
            kind: body.kind,
            data: body.data ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "device_token,kind" },
        );
        if (error)
          return json(
            { error: "Could not save the schedule — try again." },
            { status: 500, headers: hk(headers) },
          );
        return json({ ok: true }, { headers: hk(headers) });
      },

      DELETE: async ({ request }) => {
        const client = db();
        if (!client)
          return json(
            { error: "Persistence unavailable (service key not configured)." },
            { status: 503 },
          );
        const url = new URL(request.url);
        const kind = url.searchParams.get("kind");
        const { token, fresh } = deviceFrom(request);
        const headers = withDeviceCookie({}, deviceCookieHeader(token, fresh));
        if (kind && !KINDS.has(kind))
          return json({ error: "Unknown schedule kind." }, { status: 400 });
        const q = client
          .from("student_schedules")
          .delete()
          .eq("device_token", token);
        const { error } = await (kind ? q.eq("kind", kind) : q);
        if (error)
          return json(
            { error: "Could not delete the schedule — try again." },
            { status: 500, headers: hk(headers) },
          );
        return json({ ok: true }, { headers: hk(headers) });
      },
    },
  },
});

function hk(headers: Record<string, string>): Record<string, string> {
  return headers;
}
