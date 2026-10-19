# CampusEase — Project Notes / AI-Takeover Handoff

> **Read this first.** This file is the single source of truth for any AI (or human)
> takeover. It explains the architecture, what changed recently, what is
> **pending on the owner**, and the future roadmap. Keep it updated after every
> major change.

---

## 1. What this project is

CampusEase is a university utility web app (COMSATS-style) for students:

| Route    | Purpose |
| -------- | ------- |
| `/`      | Landing page |
| `/classes` | Weekly class-timetable builder: pick courses (any source), personal grid, clash warnings, PDF download/print |
| `/exams` | Personal exam datesheet: load a department datesheet PDF or a published doc, pick your class (or repeater custom picks), see your exams + **exam clash warnings**, print |
| `/admin` (hidden; type `admin` on any page or go to `/auth`) | Owner workspace, split into three pages since this pass: Publisher (PDF/JSON/built-in ingest, row review, publish/archive) at `/admin`, `/admin/settings` (AI parser config), `/admin/messages` (contact inbox) |
| `/contact` | Public contact form → admin inbox |
| `/api/parse-timetable`, `/api/parse-datesheet` | Server PDF-text → structured rows (AI, with deterministic fallback) |
| `/api/counter` | Shared "timetables generated" counter (used by BOTH /classes and /exams) |
| `/api/student-schedules` | Server-side persistence of students' schedules |

**Stack:** TanStack Start (React 19, Vite, file routes), Tailwind 4 +
shadcn-style `src/components/ui`, Supabase (Postgres + auth + RLS), deployed to
Cloudflare Workers (wrangler). Drizzle config exists but real schema is applied
via `supabase/setup.sql` (idempotent sections). Tests: Vitest in
`src/lib/__tests__`. Typecheck: `npx tsc --noEmit`. Lint: `npx eslint .`
(prettier is enforced via eslint — run `npx eslint . --fix` after edits).

## 2. Architecture decisions you must respect

- **AI parser is the primary path** and is REQUIRED by the owner:
  layouts change across departments. Config lives in `.env.local`
  (`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`) and can also be managed from the
  admin panel (stored in `app_settings` server-side; service-role key reads it).
  Currently: **Gemini** through its OpenAI-compatible endpoint
  (`https://generativelanguage.googleapis.com/v1beta/openai`,
  model `gemini-flash-latest`). `src/lib/ai-json.server.ts` does strict
  JSON-schema calls with bounded retries — reuse it for any new AI feature.
- **Deterministic fallback:** `src/lib/datesheet-local.ts` parses the FA26
  mid-datesheet layout (see §4) without AI. It only activates when AI fails,
  and the API labels the response `source: "rules-fallback"` so the UI can say so.
- **All student data is server-side.** The browser holds only an anonymous
  device token in an httpOnly cookie (`ce_device`). Anything a student builds
  (class picks, uploaded custom timetable, generated datesheet) is saved to the
  `student_schedules` table (one row per device per "kind": `classes`,
  `datesheet`) via `/api/student-schedules`. Client hook: `useSaved()` in
  `src/lib/student-schedules.ts`. **Never** add new localStorage persistence
  for student data.
- **The old hardcoded `CS_EXAMS` dataset is deleted** (Spring 2026 exams are
  over). Exams now come only from loaded PDFs or published datesheet documents.
  `CS_CLASSES`/`CS_SESSIONS`/`CS_TT_VERSION` (weekly timetable, Fall 2026) are
  still hardcoded in `src/lib/cs-timetable.ts` — they remain valid until the
  department publishes a new timetable; admin can publish DB docs too.
- **Clash rules:** weekly classes → `findClashes()` in `src/lib/timetable.ts`;
  exams → `findExamClashes()` in `src/lib/exam-utils.ts` (same-day, overlapping
  time windows, different course codes). Exams merge one-row-per-room into one
  row per (date, slot, class, code) with all rooms collected.
- **Row normalization:** published DB documents store raw admin-reviewed rows;
  `src/lib/published.ts` maps them to `ClassSession[]` / `Exam[]`. Dates may be
  "02-Nov-2026" or ISO — always normalize with `normalDate()`/`normalSlot()`
  from `exam-utils.ts` before displaying or clashing.

## 3. The current datesheet layout (FA26 midterms)

`Mids D-Sheet CS v1.pdf` format — "Mid DateSheet FA26":

```
Date | Time | Class | Sec | ST | Course | Title | Instructor | Room | Cap. | Occ. | Block
08:30-09:50 | BAE-5B | B | 37 | CSC325 | Computer Organization… | Raja… | 107 | 50 | 22 | AB-II
```

- One row per (class, room) — SAME exam repeated across rooms; merge them.
- Merged Date cell is re-emitted as its own text line ("02-Nov-2026"); day
  ("Mon") too. `src/lib/datesheet-local.ts:parseMidDatesheet()` has all known
  text-extraction quirks documented in its header comment.
- Midterm slots are ~80 min (08:30-09:50, 11:30-12:50, 13:00-14:20, 14:30-15:50).
- A v1 datesheet CAN contain genuine clashes (e.g. BAI-4A has CSC262 and
  CSC462 in the same slot) — the app must keep surfacing them (ClashBanner on
  /exams). The university publishes a v2 later; nothing special to do besides
  loading the new PDF.

## 4. What changed in the Oct 2026 session (this takeover)

**Exam-datesheet overhaul (latest pass):**
1. **Built-in official CS v1 datesheet** — new `src/lib/cs-datesheet.ts`
   (319 exam rows, `CS_DATESHEET_EXAMS`) generated from the real
   `Mids D-Sheet CS v1.pdf` with the deterministic parser and verified page by
   page. /exams shows a "Computer Science (official)" source card that loads
   instantly — students generate their personal datesheet without uploading
   anything. If a newer datesheet is published from /admin it takes priority
   (published-first default). Regenerate via: extract page text
   (see §8) → run `parseMidDatesheet` over the joined text → paste into the
   file (the old generation script was a one-off; the parser is now verified).
2. **Deterministic parser fixes** (all verified against the full 35-page PDF):
   wrapped instructor/class recovery ("Mehmood Anwar (Hybrid" + "HUM102)"),
   full class-token recovery from drifted fragments, repeater tokens
   `BS-R`/`Phy-R` → prog BS/PHY sec R, combined-section tokens `BCS-6AB`,
   Natural above→below fragment order. Empty-class rows: 29 → 1 (the only
   remaining one is unreadable in the source PDF).
3. **Consistency audit** — `auditExams()` in `src/lib/exam-utils.ts`
   (duplicates with identical rooms, same exam in different slots,
   unreadable-class rows, clashes). Used by /admin review panel (amber
   issue list + red clash list) and returned as `warnings` by
   `/api/parse-datesheet`.
4. **Student flow** — /exams default source = published doc if any, else the
   built-in CS sheet; parse failures now link to /contact so the owner can
   add the datesheet manually.
5. **Admin flow** — "+ Paste JSON rows" (paste the parser's JSON output for
   any department), "Import built-in CS datesheet (v1)", startup rows still
   via PDF+AI.

1. **AI parser works again.** Root causes fixed:
   - `.env.local` had an API key but EMPTY `AI_BASE_URL`/`AI_MODEL` → restored;
   - old agentrouter.org key was rejected (401) → switched to Gemini key the
     owner provided; verified strict JSON-schema output + `/api/parse-datesheet`
     end-to-end against the real new-layout PDF.
   - Validation layer now accepts "02-Nov-2026" style dates and merges
     one-exam-many-room rows (`cleanExams` in the route).
2. **Old exam schedules deleted** — `src/lib/cs-exams.ts` removed; /exams
   rebuilt around published docs + PDF upload; repeater/custom builder now
   works on ANY loaded datesheet (not just CS). `supabase/cleanup-obsolete-datesheets.sql`
   archives/deletes the stale published datesheets in the DB (owner must run it).
3. **Exam clash detection** — red banner + per-row "Clash" markers on /exams
   (`src/lib/exam-utils.ts` + tests).
4. **Server-side persistence** — new `student_schedules` table
   (`supabase/add-student-schedules.sql` — owner must run once), API route
   `/api/student-schedules` (device cookie + service-role), `useSaved()` hook;
   /classes and /exams now save/restore every session (no localStorage).
5. **Shared counter** — /classes now bumps the same `/api/counter` as /exams.
6. **UI/UX consistency** — /classes uses the same stepper language
   (Step 1/2/3), stats row, confirm checkbox and "Print / Save PDF" as /exams.
7. **WeekGrid redesign** (`src/components/WeekGrid.tsx`) — compact columns
   (min 72px course / 18px gap, gap hatch), cleaner cards, hover shadow,
   striped red cells for clashes, phone view unchanged in spirit.
8. **Admin improvements** (`src/routes/_authenticated/admin.tsx`) —
   Publish/Unpublish toggle (`setStatusSchedule` in
   `schedules.functions.ts`), document filter box, delete requires
   confirmation, archive requires confirmation, CS import limited to
   timetables.
9. **Hygiene** — removed a real API key from `.env.example`, one pre-existing
   lint error fixed in `previewAuthStorage.ts`.
10. **Admin clash audit** — when a datesheet is loaded in /admin (parsed or
    opened from DB), the review panel computes `findExamClashes` over the rows
    and shows a red warning with every offending pair (or a green
    "no overlaps" confirmation) BEFORE publishing; mirrors what students see.
11. **Roadmap re-check** — the weekly-class PDF (`timetable-pdf.ts`) already
    renders a polished A4-landscape grid with hour headers, clash tags and a
    course key — the old "grid PDF" roadmap goal is considered DONE, pending
    only real-data eyeballing by the owner. Landing page exam card now
    advertises clash warnings.

**Third pass — timetable algorithm, /classes UX, admin multipage:**
1. **Timetable algorithm** (`src/lib/timetable.ts`) — `dedupeSessions()` removes
   exact duplicate sessions (verified: same course/day/room AND same time is the
   real rule keys off) while hand-edited start times stay distinct;
   `autoResolve()` now skips clash-suggestion paths that would overwrite
   manually edited sessions; new `dayStats()` per-day load summary. Tests in
   `src/lib/__tests__/timetable.test.ts` (15 cases).
2. **/classes UI/UX** (`src/routes/classes.tsx`) — search results as proper
   cards with explicit add affordance, uploaded-session dedupe, clearer
   "my courses" list, per-day stats in the confirmation summary, empty state.
3. **Admin multipage** — `admin.tsx` is now a layout (header, sign-out, three
   nav cards, `<Outlet/>`); the old single-page body is split into
   `admin.index.tsx` (schedule publisher, unchanged behavior),
   `admin.settings.tsx` (AI parser config), `admin.messages.tsx` (contact
   inbox). Child routes registered in the regenerated `routeTree.gen.ts`.

**Owner self-service pass (no more code changes needed for new sheets):**
1. **JSON paste fixed & generalized** — the "Paste JSON rows" textarea only
   rendered for datesheets before (clicking it with a timetable selected did
   nothing — the reported "JSON input does not work"). Now works for BOTH
   kinds with a kind-matched placeholder, and accepts a raw row array OR a
   whole parser result (the `exams`/`sessions` array inside is used).
2. **Row editor shows every field** — columns are now the union of keys across
   all rows (was: first row only, so mixed-shape rows silently hid fields);
   `rooms` is editable as a comma-separated list (stored back as an array;
   both mappings handle either shape).
3. **Timetable clash audit** — the review panel now also audits TIMETABLE
   rows (datesheets already had it): same class section booked at overlapping
   times shows an amber warning list before publishing.
4. **One-click semester rollover** — every saved document has a "New version"
   (clone) button: loads its rows as a brand-new draft with the version
   auto-bumped (`v1.0`→`v1.1`, `v3`→`v4`, `Fall 2026`→`Fall 2027`). Fix rows,
   publish — no doc is touched until then. This closes the roadmap item;
   new departments/sheets no longer need any code edit.

## 5. Pending on the OWNER (do these once)

1. **Run in Supabase → SQL Editor (once):**
   - `supabase/add-student-schedules.sql`
   - then `supabase/cleanup-obsolete-datesheets.sql` (review its SELECT first;
     Option A archives, Option B hard-deletes).
2. **Rotate the leaked AI key** if any old AI key was ever committed — the
   template previously contained a real key in git history.
3. `AI_API_KEY` in `.env.local` is a Google key the owner pasted in chat — it
   will likely need rotation eventually; it is NOT in `.env.example` anymore.

## 6. Known limitations / gotchas

- `student_schedules` GET/POST return 500 until §5.1 SQL is run. Pages still
  work in-memory; they just won't restore.
- Admin "row edit table" derives columns from the first row — rows parsed with
  different shapes (many-room rows are pre-merged, so this is rare) may hide
  extra keys.
- The deterministic parser covers the FA26 mid-datesheet layout only; other
  departments' exotic layouts rely on AI (by design, owner's preference).
- `routeTree.gen.ts` regenerates on `vite dev`/`build` — don't hand-edit.
- PDF text extraction runs in the browser via pdf.js from a CDN
  (`extractPdfPages` in `src/lib/pdf-layout.ts`); a scanned (image-only) PDF
  yields "No exams found".
- RLS: `student_schedules` has NO anon policies; only the service-role key on
  the server touches it. Keep it that way.

## 7. Future implementations (roadmap — pick up here)

- [ ] Datesheet v2 handling: when the university re-issues a datesheet, admin
      publishes the new doc; admins already get a per-document clash audit
      (done) — next: also list clashes across ALL published datesheets in
      a "health" tab.
- [x] ~~Local deterministic parser as a *secondary* engine~~ — parser rewritten
      and verified against the full FA26 PDF; consistency audit shows every
      disagreement/anomaly in admin review instead of a confidence column.
- [x] ~~V1 CS datesheet usable without parsing~~ — shipped as a built-in
      dataset (`src/lib/cs-datesheet.ts`), loaded by default on /exams.
- [ ] Real-data eyeball of `timetable-pdf.ts` grid output (feature done,
      un-verified by owner).
- [ ] Classroom/room-level views: which rooms are free during each slot.
- [ ] Instructor-level timetable search for students ("where is Dr. X now").
- [ ] PWA install + "next class" notification using server-saved schedules.
- [ ] Unit tests for routes (parse-datesheet validation layer) with fixture text.
- [ ] Consider `@tanstack/react-query` for the student-schedules fetch to get
      caching/refetching for free.
- [x] ~~Semester rollover utility in admin: clone documents with a new
      version.~~ — shipped as the "New version" button on every saved doc
      (auto-bumps the version, saves as a new document).

## 8. Verification commands

```bash
npx tsc --noEmit       # typecheck (must be clean)
npx eslint .           # lint (prettier enforced; --fix quick)
npx vitest run         # unit tests (src/lib/__tests__)
npm run dev            # then check / , /classes , /exams render 200
```

To re-test the datesheet parser against the real PDF during a takeover:
run `npm run dev`, then in another shell extract page text with pdfjs-dist
(see the pattern in `src/lib/pdf-layout.ts`, legacy build works in Node) and
POST that text to `/api/parse-datesheet`. There is also a committed vitest
fixture pattern in `src/lib/__tests__/datesheet-local.test.ts` containing
real rows from the FA26 PDF, including the quirky wrapped/drifted variants.
