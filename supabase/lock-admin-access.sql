-- Lock down admin access — run ONCE in Supabase Studio → SQL Editor
-- AFTER your own owner account exists and /admin works for you.
--
-- What already protects admin access (verified in setup.sql):
--   * user_roles has RLS with NO write policies — a signed-in user cannot
--     grant themselves a role, even with direct API calls (deny-by-default);
--     only service_role writes. Every admin server function also calls
--     assertAdmin() server-side.
--   * departments / schedule_documents / app_settings / contact_messages
--     have admin-only RLS write policies.
--
-- The remaining escalation path is the signup trigger that grants 'admin'
-- to anyone who first registers the owner email. Close it like this:
--
--   1) In the Supabase dashboard → Authentication → Providers → Email:
--      turn OFF "Allow new users to sign up". (A dashboard setting — no SQL
--      for it exists. This is the only real wall; do it after your account
--      is confirmed.)
--   2) Run the statements below.
--
-- If (and only if) you need a second owner later, re-enable signups just
-- long enough to register them by the same email rule, then close again.

-- ---------------------------------------------------------------
-- 1 · Check who is admin right now (run as a SELECT first)
-- ---------------------------------------------------------------
-- SELECT u.email, r.role
--   FROM public.user_roles r
--   JOIN auth.users u ON u.id = r.user_id
--  ORDER BY u.email;

-- ---------------------------------------------------------------
-- 2 · Keep exactly one admin: the owner email from the signup trigger.
--     Edit the email below if you changed it in both places
--     (setup.sql §3 trigger AND the /auth page constant).
-- ---------------------------------------------------------------
DELETE FROM public.user_roles
WHERE role = 'admin'
  AND user_id NOT IN (
    SELECT id FROM auth.users
    WHERE lower(email) = 'abdulmusawirdayo35@gmail.com'
  );

-- ---------------------------------------------------------------
-- 3 · Belt-and-suspenders: authenticated users never need to write the
--     roles table (RLS already denies it; this revokes the grant itself).
--     Do NOT revoke writes on departments / schedule_documents — the admin
--     server functions insert/update AS the signed-in user's token and the
--     RLS policies are what protect those.
-- ---------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon;
