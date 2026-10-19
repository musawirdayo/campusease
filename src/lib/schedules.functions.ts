import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

const scheduleInput = z.object({
  id: z.string().uuid().optional(),
  department: z.string().trim().min(2).max(100),
  kind: z.enum(["timetable", "datesheet"]),
  title: z.string().trim().min(2).max(140),
  version: z.string().trim().min(1).max(60),
  status: z.enum(["draft", "published", "archived"]),
  data: z.array(z.record(z.unknown())).min(1),
  sourceFilename: z.string().max(240).optional(),
});

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

export const getAdminSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("schedule_documents")
      .select(
        "id, kind, title, version, status, source_filename, updated_at, departments(name)",
      )
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  });

export const saveSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => scheduleInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const slug = data.department
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const { data: department, error: departmentError } = await context.supabase
      .from("departments")
      .upsert({ name: data.department, slug }, { onConflict: "slug" })
      .select("id")
      .single();
    if (departmentError || !department)
      throw departmentError ?? new Error("Department could not be saved");
    const payload = {
      department_id: department.id,
      kind: data.kind,
      title: data.title,
      version: data.version,
      status: data.status,
      data: data.data as Json,
      source_filename: data.sourceFilename ?? null,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
      published_at:
        data.status === "published" ? new Date().toISOString() : null,
    };
    const query = data.id
      ? context.supabase
          .from("schedule_documents")
          .update(payload)
          .eq("id", data.id)
      : context.supabase.from("schedule_documents").insert(payload);
    const { error } = await query;
    if (error) throw error;
    return { ok: true, id: data.id };
  });

export const getSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: doc, error } = await context.supabase
      .from("schedule_documents")
      .select(
        "id, kind, title, version, status, data, source_filename, department_id, departments(name)",
      )
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return doc;
  });

export const getDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("departments")
      .select("name, slug")
      .order("name");
    if (error) throw error;
    return data;
  });

export const setStatusSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "published"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("schedule_documents")
      .update({
        status: data.status,
        updated_at: new Date().toISOString(),
        published_at:
          data.status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const archiveSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("schedule_documents")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
        published_at: null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const removeSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("schedule_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
