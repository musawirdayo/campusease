-- CampusEase · full database setup for a fresh (self-managed) Supabase project.
-- Run this ONCE in Supabase Studio → SQL Editor → New query.
-- It recreates everything from the original Drizzle migrations:
--   0000  app_counter + bump_counter
--   0001  app_role enum, user_roles, has_role, departments, schedule_documents (with RLS)
--   0002  signup trigger that grants the admin role to the owner email

-- ============================================================
-- 1 · Public usage counter (0000_migration.sql)
-- ============================================================
CREATE TABLE public.app_counter (id int PRIMARY KEY, count bigint NOT NULL DEFAULT 0);
GRANT SELECT ON public.app_counter TO anon, authenticated;
GRANT ALL ON public.app_counter TO service_role;
ALTER TABLE public.app_counter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read counter" ON public.app_counter FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.app_counter (id, count) VALUES (1, 2350);

CREATE OR REPLACE FUNCTION public.bump_counter() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.app_counter SET count = count + 1 WHERE id = 1 RETURNING count;
$$;
GRANT EXECUTE ON FUNCTION public.bump_counter() TO anon, authenticated;

-- ============================================================
-- 2 · Roles, departments, schedule documents (0001_create_schedule_admin_content.sql)
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read departments" ON public.departments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage departments" ON public.departments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.schedule_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('timetable', 'datesheet')),
  title text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_filename text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
GRANT SELECT ON public.schedule_documents TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.schedule_documents TO authenticated;
GRANT ALL ON public.schedule_documents TO service_role;
ALTER TABLE public.schedule_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published schedules" ON public.schedule_documents FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "Authenticated reads published schedules" ON public.schedule_documents FOR SELECT TO authenticated USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins create schedules" ON public.schedule_documents FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "Admins update schedules" ON public.schedule_documents FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete schedules" ON public.schedule_documents FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX schedule_documents_public_idx ON public.schedule_documents (kind, status, published_at DESC);
CREATE INDEX schedule_documents_department_idx ON public.schedule_documents (department_id, kind);

-- ============================================================
-- 3 · Auto-assign the admin role to the owner on signup (0002_assign_owner_admin_role.sql)
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_campusease_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(new.email) = lower('abdulmusawirdayo35@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER assign_campusease_owner_role_after_signup
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.assign_campusease_owner_role();

-- ============================================================
-- 4 · AI settings (managed from the admin panel; the server reads them with the
--     service-role key when AI_* env vars are absent)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage app settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 5 · Contact-form inbox (public submissions, owner inbox)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL CHECK (char_length(message) <= 4000),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT ON public.contact_messages TO authenticated;
GRANT UPDATE ON public.contact_messages TO authenticated;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit a message" ON public.contact_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read messages" ON public.contact_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins mark messages read" ON public.contact_messages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX contact_messages_inbox_idx ON public.contact_messages (read, created_at DESC);

-- ============================================================
-- 6 · How to give yourself the admin role (pick ONE, after signing up at /auth):
--
--    a) If you signed up with the owner email above, the trigger already did it.
--    b) Otherwise run, replacing EMAIL below:
--       INSERT INTO public.user_roles (user_id, role)
--       SELECT id, 'admin' FROM auth.users WHERE email = 'EMAIL'
--       ON CONFLICT (user_id, role) DO NOTHING;
-- ============================================================

-- ============================================================
-- 7 · Server-side student schedule persistence (anon device token + service role)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('classes', 'datesheet')),
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_token, kind)
);
CREATE INDEX IF NOT EXISTS student_schedules_device_idx
  ON public.student_schedules (device_token);
GRANT ALL ON public.student_schedules TO service_role;
ALTER TABLE public.student_schedules ENABLE ROW LEVEL SECURITY;
