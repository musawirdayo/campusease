import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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

/** Anon-key client used for the public submission (RLS allows INSERT only). */
function anonymousDb() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  read: boolean;
  created_at: string;
};

const submitInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(10).max(4000),
});

export const submitContact = createServerFn({ method: "POST" })
  .inputValidator((input) => submitInput.parse(input))
  .handler(async ({ data }) => {
    const { error } = await anonymousDb().from("contact_messages").insert({
      name: data.name,
      email: data.email,
      message: data.message,
    });
    if (error)
      throw new Error(
        "Could not send your message right now. Please email us directly instead.",
      );
    return { ok: true };
  });

export const getContactMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("contact_messages")
      .select("id,name,email,message,read,created_at")
      .order("read", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data as ContactMessage[];
  });

export const markContactRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("contact_messages")
      .update({ read: true })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
