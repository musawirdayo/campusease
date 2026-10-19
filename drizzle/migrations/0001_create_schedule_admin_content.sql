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
