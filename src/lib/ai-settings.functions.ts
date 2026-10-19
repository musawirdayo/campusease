import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { aiJson, clearAiConfigCache } from "./ai-json.server";

async function assertAdmin(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Owner access required");
}

type SettingRow = { key: string; value: string; updated_at: string };

export type AiSettingsView = {
  baseUrl: string;
  model: string;
  keyMasked: string;
  configuredInDatabase: boolean;
  configuredInEnvironment: boolean;
  updatedAt: string | null;
};

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("key,value,updated_at");
    if (error) throw error;
    const rows = (data ?? []) as SettingRow[];
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    const updated =
      rows
        .map((r) => r.updated_at)
        .sort()
        .at(-1) ?? null;
    return {
      baseUrl: byKey.ai_base_url?.value ?? "",
      model: byKey.ai_model?.value ?? "",
      keyMasked: maskKey(byKey.ai_api_key?.value ?? ""),
      configuredInDatabase: Boolean(
        byKey.ai_api_key?.value && byKey.ai_base_url?.value,
      ),
      configuredInEnvironment: Boolean(
        process.env.AI_API_KEY && process.env.AI_BASE_URL,
      ),
      updatedAt: updated,
    } as AiSettingsView;
  });

const saveInput = z.object({
  apiKey: z.string().trim().max(400).optional(),
  baseUrl: z.string().trim().max(400).optional(),
  model: z.string().trim().max(120).optional(),
});

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const rows = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => ({
        key:
          field === "apiKey"
            ? "ai_api_key"
            : field === "baseUrl"
              ? "ai_base_url"
              : "ai_model",
        value: value ?? "",
        updated_at: new Date().toISOString(),
      }));
    if (!rows.length) return { ok: true };
    const { error } = await context.supabase
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw error;
    clearAiConfigCache();
    return { ok: true };
  });

const PING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } },
};

export const testAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    clearAiConfigCache();
    const result = await aiJson<{ reply: string }>({
      name: "ping",
      system: "Reply with the single word: pong",
      user: "ping",
      schema: PING_SCHEMA,
    });
    if (result.ok)
      return { ok: true as const, sample: result.data.reply ?? "pong" };
    return { ok: false as const, error: result.error };
  });
