-- CampusEase · server-side student schedule persistence.
-- Students are anonymous: the device token (httpOnly cookie) is the only key,
-- the service-role key does all reads/writes. No data lives in the browser.
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

-- Only the service role touches this table; anon/authenticated get nothing.
GRANT ALL ON public.student_schedules TO service_role;
ALTER TABLE public.student_schedules ENABLE ROW LEVEL SECURITY;
