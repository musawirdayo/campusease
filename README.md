# CampusEase 🎓

Your semester without the clashes. CampusEase is a university utility web app that
turns any department's messy timetable PDF into a clean, personal, clash-checked
schedule — for classes **and** exams.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/musawirdayo/campusease)

## What it does

| Route | Purpose |
| --- | --- |
| `/` | Landing page with a live "what's on right now" preview from the built-in CS timetable |
| `/classes` | Weekly class-timetable builder — pick your courses, auto-resolver suggests clash-free sections, per-day stats, print / save as PDF |
| `/exams` | Personal exam datesheet — upload your department's PDF (or use a published doc) for just *your* exams, with exam-clash warnings, repeat/custom picking, print |
| `/contact` | Public contact form → admin inbox |
| `/admin` + `/admin/settings`, `/admin/messages` | Owner workspace: publish/archive schedules, AI parser configuration, contact inbox |
| `/api/parse-timetable`, `/api/parse-datesheet` | Server-side PDF-text → structured rows (AI with a deterministic rules fallback) |
| `/api/student-schedules` | Server-side persistence of each student's schedule (anonymous device cookie, no account needed) |
| `/api/counter` | Shared "timetables generated" counter |

Key features:

- **Clash detection** — overlapping classes in the weekly grid and overlapping
  exam slots on the same day are flagged everywhere (student pages and the
  admin review panel before publishing).
- **Built-in Computer Science data** — the official CS weekly timetable and the
  FA26 mid-datesheet ship as in-code datasets, so students don't need to
  upload anything for CS.
- **AI parser with fallback** — any department's PDF layout works through a
  strict JSON-schema AI call; if the AI fails, a deterministic rules parser
  for the standard mid-datesheet layout takes over, and the response is labelled
  so the UI can tell you which engine produced it.
- **No student accounts** — schedules persist server-side against an anonymous
  `httpOnly` device cookie; nothing sensitive lives in localStorage.
- **Owner self-service** — new departments/semesters need no code changes:
  paste parser JSON rows, review with the built-in clash audit, publish, or
  clone an old document as a new version for semester rollover.

## Tech stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19, Vite,
  file-based router, Nitro SSR)
- **Styling:** Tailwind CSS 4 + shadcn-style components
- **Database & auth:** [Supabase](https://supabase.com) (Postgres, RLS)
- **AI:** any OpenAI-compatible chat-completions endpoint (Gemini, OpenAI,
  OpenRouter …)
- **PDF:** pdf.js for browser-side text extraction, jsPDF for printing
- **Tests:** Vitest (`src/lib/__tests__`)

## Getting started

```bash
npm install            # or: bun install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

### Environment variables

All values are documented in [.env.example](./.env.example). Minimum for a
working app:

| Variable | Where to get it |
| --- | --- |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | same page → anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → service_role key (**secret**, server only) |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | any OpenAI-compatible provider (also configurable later in the admin panel — DB settings win once set) |
| `VITE_SITE_URL` | your production URL (optional in dev) |

`VITE_*` variables are baked into the client bundle — never put secrets behind
`VITE_`. The `service_role` and `AI_*` keys are used server-side only.

### Supabase setup

Public schema SQL lives in [`supabase/`](./supabase) — run these in the
Supabase SQL editor once:

1. `supabase/setup.sql` (schema, auth, admin role)
2. `supabase/add-student-schedules.sql` (server-side schedule persistence)
3. `supabase/cleanup-obsolete-datesheets.sql` (review the SELECT first)

## Scripts

```bash
npm run dev            # dev server
npm run build          # production build (Nitro; Vercel preset when VERCEL=1)
npm run preview        # preview the build
npm run lint           # eslint (prettier enforced, `npx eslint . --fix`)
npx tsc --noEmit       # typecheck
npx vitest run         # unit tests
```

## Deployment

The app deploys to **Vercel zero-config** — `vercel.json` pins the TanStack
Start framework preset, and the build automatically switches to Nitro's
`vercel` preset. Full walkthrough (env vars, Supabase URL configuration,
post-deploy checks) is in [DEPLOY.md](./DEPLOY.md).

Short version:

1. Push to `main` → Vercel deploys production automatically (import once at
   [vercel.com](https://vercel.com), framework preset **TanStack Start**).
2. Set the environment variables **before** the first production deploy.
3. In Supabase → Auth URL Configuration, add your Vercel domain as Site URL +
   Redirect URL so sign-ups work from the deployed site.
4. Any other branch gets a preview URL; published schedule documents go live
   from `/admin` without a redeploy (DB-driven).

## Project structure

```
src/
  routes/            # TanStack Start file routes (/, /classes, /exams, /admin/…, /api/…)
  components/        # App navigation, WeekGrid, shadcn-style ui/
  lib/
    timetable.ts     # weekly grid math: clashes, dedupe, auto-resolver
    exam-utils.ts    # exam clash detection + row/date normalization + audit
    cs-timetable.ts  # built-in CS weekly timetable dataset
    cs-datesheet.ts  # built-in CS FA26 exam datesheet dataset
    datesheet-local.ts # deterministic rules fallback parser
    ai-json.server.ts  # strict JSON-schema AI calls with bounded retries
    student-schedules.ts # useSaved() persistence hook
    __tests__/       # Vitest unit tests
supabase/            # one-time SQL setup scripts
drizzle/             # migration snapshots (schema is managed via supabase/*.sql)
```

## Project docs

- **[PROJECT_NOTES.md](./PROJECT_NOTES.md)** — the living handoff document:
  architecture decisions, session change log, known limitations, and the active
  roadmap (§7).
- **[DEPLOY.md](./DEPLOY.md)** — deployment walkthrough.
- **[roadmap.md](./roadmap.md)** — shortlist referencing PROJECT_NOTES §7.
