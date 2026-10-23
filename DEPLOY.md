# Deploying CampusEase (GitHub → Vercel)

The app is a TanStack Start (Nitro-based) full-stack app. It deploys to Vercel
zero-config once the repo is on GitHub: the build switches to Nitro's `vercel`
preset automatically (see `vite.config.ts` — Vercel always sets `VERCEL=1`).

Local / Cloudflare builds keep working unchanged.

## 1 · Push the repo to GitHub

```bash
git remote add origin git@github.com:YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

(Create an empty repo on github.com first — no README/license, we already have
our first commit. If only HTTPS links are available use
`https://github.com/YOUR-USERNAME/YOUR-REPO.git` instead.)

## 2 · Create the Vercel project

Dashboard → **Add New… → Project → Import** the repo → confirm the framework
preset says **TanStack Start** (pinned in `vercel.json`) → Deploy.
(Team plan deploys need the linked GitHub account; pushes to `main` then
deploy production automatically and any other branch gets a preview URL.)

## 3 · Set environment variables (Project → Settings → Environment Variables)

| Variable                                                   | Environments         | Value source                                                                                           |
| ---------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`                                        | Production + Preview | Supabase → Project Settings → API → **Project URL**                                                    |
| `VITE_SUPABASE_PUBLISHABLE_KEY`                            | Production + Preview | same page → **anon / publishable key**                                                                 |
| `SUPABASE_URL`                                             | Production + Preview | same Project URL                                                                                       |
| `SUPABASE_PUBLISHABLE_KEY`                                 | Production + Preview | same publishable key                                                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`                                | Production + Preview | same page → **service_role key** (secret — needed for student-schedule storage + admin AI settings)    |
| `AI_API_KEY`                                               | Production + Preview | your OpenAI/Gemini/OpenRouter key (or set it from the admin panel later — the DB config wins once set) |
| `AI_BASE_URL`                                              | Production + Preview | e.g. `https://api.openai.com/v1`                                                                       |
| `AI_MODEL`                                                 | Production + Preview | e.g. `gemini-2.5-flash` / `gpt-4o-mini`                                                                |
| `VITE_SITE_URL`                                            | Production           | your final domain, e.g. `https://campusease.vercel.app`                                                |
| `VITE_GA_MEASUREMENT_ID` · `VITE_GOOGLE_SITE_VERIFICATION` | optional             | analytics / search-console                                                                             |

`VITE_*` values get baked into the client bundle at build time — they are the
public Supabase values only. Never put the service_role or AI keys behind a
`VITE_` prefix.

Add the variables **before** the first production deploy (or re-deploy after
adding them).

## 3.5 · Accessing the admin area on the deployed site

`/admin` needs **sensitive env vars set AND the owner account granted the admin
role** — see §3 above and `supabase/setup.sql` step 6. To reach it:

1. Scroll to the footer of any page and click **Admin** (or go straight to
   `/auth`). On desktop you can also type `admin` on any page.
2. Sign in with your owner account — it must have the `admin` role in
   Supabase, otherwise the workspace tools refuse to load ("Owner access
   required").
3. You land on `/admin`: the publisher (upload / publish / edit / archive /
   delete any schedule document), `/admin/settings` (AI parser config) and
   `/admin/messages` (contact inbox).

   Nobody else can get admin rights: `user_roles` has RLS with no write
   policies (self-grants are impossible even via direct API calls) and every
   admin server function re-checks the role server-side. The one thing left
   to close yourself, after your owner account works:

   - Supabase dashboard → Authentication → Providers → Email → turn OFF
     **"Allow new users to sign up"** (only you ever need an account).
   - Run [`supabase/lock-admin-access.sql`](./supabase/lock-admin-access.sql)
     once — it deletes any admin rows that aren't yours and locks the roles
     table down further.

If the deployed site shows "Page not found" for any route that works locally,
check the Vercel dashboard that the _latest_ deployment built from the current
commit — stale deployments from before new routes existed return 404s.

## 4 · Supabase side (one-time, already in the SQL files)

1. Run `supabase/add-student-schedules.sql` and then
   `supabase/cleanup-obsolete-datesheets.sql` (review its SELECT first) in the
   Supabase SQL editor.
2. Authentication → **URL Configuration**: set **Site URL** to your Vercel
   domain and add it under Redirect URLs, so sign-ups/sign-ins work from the
   deployed site.

## 5 · Verify the deployment

- `/` renders, `/classes` and `/exams` load
- `/admin` → sign in → owner console works (needs the admin role in Supabase —
  see `supabase/setup.sql` step 6)
- Upload a small PDF on `/admin` → rows appear (this exercises the AI parse +
  Supabase service key on Vercel)

## Recurring releases

Just `git push` — Vercel deploys `main` to production; every fresh draft doc
published from `/admin` goes live instantly without a redeploy (that flow is
DB-driven).
