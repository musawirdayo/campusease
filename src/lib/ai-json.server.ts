// Shared strict-JSON AI call through an OpenAI-compatible provider, with bounded retry on 429/5xx.
// Configuration order: AI_API_KEY/AI_BASE_URL/AI_MODEL env vars → app_settings table
// (managed from the admin panel, read with the service-role key) → not configured.
// Service-role key stays server-only — it is never sent to the browser.

const ENV_KEY = process.env.AI_API_KEY;
const ENV_BASE = process.env.AI_BASE_URL?.replace(/\/+$/, "");
const ENV_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

export type AiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  source: "env" | "database" | "none";
};

type Cached = { value: AiConfig; expiresAt: number };
let cachedConfig: Cached | undefined;
const CACHE_MS = 30_000;

/** Clears the cached config (used by the admin "save" flow so tests reflect edits immediately). */
export function clearAiConfigCache() {
  cachedConfig = undefined;
}

async function resolveConfig(): Promise<AiConfig> {
  if (cachedConfig && cachedConfig.expiresAt > Date.now())
    return cachedConfig.value;

  if (ENV_KEY && ENV_BASE) {
    const value: AiConfig = {
      apiKey: ENV_KEY,
      baseUrl: ENV_BASE,
      model: ENV_MODEL,
      source: "env",
    };
    cachedConfig = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await db.from("app_settings").select("key,value");
    if (!error && Array.isArray(data)) {
      const map = Object.fromEntries(data.map((row) => [row.key, row.value]));
      const settingsKey = map.ai_api_key;
      const settingsBase = map.ai_base_url?.replace(/\/+$/, "");
      if (settingsKey && settingsBase) {
        const value: AiConfig = {
          apiKey: settingsKey,
          baseUrl: settingsBase,
          model: map.ai_model || ENV_MODEL,
          source: "database",
        };
        cachedConfig = { value, expiresAt: Date.now() + CACHE_MS };
        return value;
      }
    }
  }

  return { apiKey: "", baseUrl: "", model: ENV_MODEL, source: "none" };
}

export async function aiJson<T>(opts: {
  system: string;
  user: string;
  schema: object;
  name: string;
}): Promise<
  { ok: true; data: T } | { ok: false; status: number; error: string }
> {
  const config = await resolveConfig();
  if (!config.apiKey || !config.baseUrl) {
    return {
      ok: false,
      status: 500,
      error:
        "AI is not configured yet. The owner can set it in the admin panel (or via AI_API_KEY/AI_BASE_URL).",
    };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        // Hard cap: a stalled provider must never hang the request forever.
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: opts.name, strict: true, schema: opts.schema },
          },
        }),
      });
    } catch (error) {
      // Timeout/abort/network — retry while attempts remain, then fail fast.
      if (attempt < 2) {
        await new Promise((r) =>
          setTimeout(r, 1200 * 2 ** attempt + Math.random() * 400),
        );
        continue;
      }
      return {
        ok: false,
        status: 504,
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "AI took too long to respond (~90s). Retrying with fewer pages at a time may help."
            : "Could not reach the AI provider.",
      };
    }
    if (res.ok) {
      const j = await res.json();
      try {
        return {
          ok: true,
          data: JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as T,
        };
      } catch {
        return {
          ok: false,
          status: 502,
          error: "AI returned unreadable output.",
        };
      }
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get("retry-after")) || 0;
      await new Promise((r) =>
        setTimeout(
          r,
          ra ? ra * 1000 : 1200 * 2 ** attempt + Math.random() * 400,
        ),
      );
      continue;
    }
    const body = await res
      .json()
      .catch(() => ({}) as { message?: string; error?: { message?: string } });
    const msg =
      res.status === 402
        ? "AI credits exhausted. Please contact the admin."
        : body?.error?.message || body?.message || `AI error ${res.status}`;
    return { ok: false, status: res.status, error: msg };
  }
  return {
    ok: false,
    status: 429,
    error: "AI is busy right now. Please try again in a minute.",
  };
}
