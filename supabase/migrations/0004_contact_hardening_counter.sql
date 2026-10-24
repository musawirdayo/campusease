-- CampusEase · migration 0004 — contact hardening + generation counter.
-- Run in Supabase Studio → SQL Editor.

-- ── 1) Contact messages: length constraints at the DB layer ─────────────
-- The anon RLS policy used to be WITH CHECK (true), so anyone with the
-- public key could INSERT rows of any shape or size, bypassing the app's
-- zod validation entirely. Now the policy itself enforces sane sizes.
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_name_len CHECK (char_length(name) <= 120);
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_email_len CHECK (char_length(email) <= 200);
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_email_fmt
    CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_name_not_blank CHECK (btrim(name) <> '');

-- Recreate the anon INSERT policy with the same constraints the app enforces.
DROP POLICY IF EXISTS "Anyone can submit a message" ON public.contact_messages;
CREATE POLICY "Anyone can submit a message" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(name) <= 120 AND char_length(trim(name)) > 0
    AND char_length(email) <= 200
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND char_length(message) <= 4000 AND char_length(message) > 0
  );

-- ── 2) Generation counter ────────────────────────────────────────────────
-- public.bump_counter() increments app_counter for every generated schedule.
-- There is intentionally no per-device/day deduplication.
