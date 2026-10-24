import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarPlus,
  GraduationCap,
  LayoutGrid,
  ListChecks,
  MoveRight,
  ShieldCheck,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { LandingIllustration } from "@/components/LandingIllustration";
import { localDateKey } from "@/lib/exam-data";
import {
  usePublishedDatesheets,
  usePublishedTimetables,
} from "@/lib/published";
import { CS_CLASSES, CS_SESSIONS, CS_TT_VERSION } from "@/lib/cs-timetable";
import {
  EXAM_DATES,
  EXAM_DEPT,
  EXAM_PAPERS,
  EXAM_SOURCE,
  EXAM_STUDENTS,
  EXAM_TERM,
} from "@/lib/exam-meta";
import { fmt12, toMin } from "@/lib/timetable";
import type { Day } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CampusEase — Your personal class & exam timetable" },
      {
        name: "description",
        content:
          "Build a clash-free weekly class timetable for your own courses and get your personal exam schedule — rooms and seats included — straight from the official copies. Free, no sign-up.",
      },
      {
        property: "og:title",
        content: "CampusEase — Your personal class & exam timetable",
      },
      {
        property: "og:description",
        content:
          "Clash-free class timetables and personal exam schedules, read straight from the official copies. Free, no sign-up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const DAYS_ORDER: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Landing() {
  const [now, setNow] = useState(() => new Date());
  // Days/times only after mount — SSR has the server clock, the client must
  // agree on first paint to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  const [generated, setGenerated] = useState<number | null>(null);
  const navigate = useNavigate();
  const [quickSection, setQuickSection] = useState("");
  const [quickReg, setQuickReg] = useState("");

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(new Date()), 30_000);
    let active = true;
    const refreshCounter = () => {
      fetch("/api/counter", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { count?: number } | null) => {
          const count = j?.count;
          if (active && typeof count === "number")
            setGenerated((current) =>
              current === null ? count : Math.max(current, count),
            );
        })
        .catch(() => {});
    };
    refreshCounter();
    const counterInterval = window.setInterval(refreshCounter, 30_000);
    window.addEventListener("focus", refreshCounter);
    return () => {
      active = false;
      clearInterval(t);
      window.clearInterval(counterInterval);
      window.removeEventListener("focus", refreshCounter);
    };
  }, []);

  // Live overlays are client-only truth; on the server we render the static sheet.
  const nowMin = mounted ? now.getHours() * 60 + now.getMinutes() : -1;

  // Next upcoming exam day from the built-in seating dataset.
  const nextExam = useMemo<string | null>(() => {
    const today = localDateKey(now);
    return EXAM_DATES.find((d) => d >= today) ?? null;
  }, [now]);

  // The day sheet shown in the hero: today when classes run, else Wednesday —
  // exactly how the app's phone view behaves. Sunday quietly shows Wednesday.
  const dow = mounted ? now.getDay() : 1; // 0 Sun .. 6 Sat
  const isClassDay = dow >= 1 && dow <= 6;
  const todayKey: Day | null = isClassDay ? DAYS_ORDER[dow - 1] : null;
  const campusNow =
    todayKey === null || nowMin < 0
      ? []
      : CS_SESSIONS.filter(
          (s) =>
            s.day === todayKey &&
            toMin(s.start) <= nowMin &&
            nowMin < toMin(s.end),
        );
  const nextStart =
    todayKey === null || nowMin < 0
      ? null
      : (CS_SESSIONS.filter(
          (s) => s.day === todayKey && toMin(s.start) > nowMin,
        ).sort((a, b) => toMin(a.start) - toMin(b.start))[0]?.start ?? null);
  const previewDay: Day =
    todayKey && CS_SESSIONS.some((s) => s.day === todayKey) ? todayKey : "Wed";
  const isWeekend = mounted && dow === 0;

  // Busiest section on that day = a real slice of the CS timetable, like the app.
  const sampleCls = useMemo(() => {
    const tally = new Map<string, number>();
    for (const s of CS_SESSIONS)
      if (s.day === previewDay) tally.set(s.cls, (tally.get(s.cls) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [previewDay]);

  const { data: timetables = [] } = usePublishedTimetables();
  const { data: datesheets = [] } = usePublishedDatesheets();
  const publishedDocs = [...timetables, ...datesheets];

  return (
    <div className="landing-page min-h-screen bg-background text-foreground">
      <AppNav />
      <main id="main-content">
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="landing-hero mx-auto max-w-[1440px] px-4 pt-8 pb-12 sm:px-6 sm:pt-12 sm:pb-14">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8">
            <div>
              <p className="inline-block border-b border-foreground/20 pb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 fill-mode-both duration-500">
                CampusEase · your campus, in sync
              </p>
              <h1
                style={{ animationDelay: "80ms" }}
                className="landing-hero-title mt-6 text-[2.7rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 fill-mode-both duration-500"
              >
                Your week,
                <br />
                <span className="landing-title-accent text-primary">
                  beautifully planned.
                </span>
              </h1>
              <p
                style={{ animationDelay: "160ms" }}
                className="landing-hero-description mt-6 max-w-md text-base text-muted-foreground sm:text-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 fill-mode-both duration-500"
              >
                CampusEase takes the{" "}
                <span className="font-medium text-foreground">
                  official class and exam schedules
                </span>{" "}
                and turns them into a calm, colour-coded plan with your classes,
                exam rooms, and seats all in one place.
              </p>

              {/* Trust chips — each one a promise this page keeps below */}
              <ul
                style={{ animationDelay: "240ms" }}
                className="landing-trust-list mt-6 flex max-w-md flex-wrap gap-x-5 gap-y-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 fill-mode-both duration-500"
              >
                {[
                  "Built from official copies, never invented",
                  "No sign-up · nothing to install",
                  "Your seats are for your eyes only",
                ].map((chip) => (
                  <li
                    key={chip}
                    className="flex items-start gap-1.5 text-[11.5px] text-foreground/80"
                  >
                    <ShieldCheck
                      className="mt-px size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {chip}
                  </li>
                ))}
              </ul>

              <div
                style={{ animationDelay: "320ms" }}
                className="mt-7 flex flex-wrap items-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 fill-mode-both duration-500"
              >
                <Link
                  to="/classes"
                  className="landing-primary-cta group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Build My Timetable
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Explore Features
                </a>
                <Link
                  to="/exams"
                  className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground/70 transition hover:text-foreground"
                >
                  or open my exam profile
                  <MoveRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              {/* Quick start — pick a section, or type a roll number */}
              <form
                onSubmit={(e) => e.preventDefault()}
                className="landing-quickstart mt-8 max-w-md space-y-3 rounded-2xl border border-border bg-card/80 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="shrink-0 font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    CS section
                  </span>
                  <select
                    value={quickSection}
                    onChange={(e) => setQuickSection(e.target.value)}
                    aria-label="Which section are you in?"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Pick your section…</option>
                    {CS_CLASSES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} · {c.batch}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!quickSection}
                    onClick={() =>
                      navigate({
                        to: "/classes",
                        search: { section: quickSection },
                      })
                    }
                    className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Load it
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="shrink-0 font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Roll no.
                  </span>
                  <input
                    value={quickReg}
                    onChange={(e) => setQuickReg(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && quickReg.trim().length >= 4) {
                        e.preventDefault();
                        navigate({
                          to: "/exams",
                          search: { reg: quickReg.trim() },
                        });
                      }
                    }}
                    placeholder="FA25-BCS-065"
                    spellCheck={false}
                    autoCorrect="off"
                    data-1p-ignore
                    aria-label="Your registration number"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-2 font-mono text-xs tracking-wide focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    disabled={quickReg.trim().length < 4}
                    onClick={() =>
                      navigate({
                        to: "/exams",
                        search: { reg: quickReg.trim() },
                      })
                    }
                    className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open my exams
                  </button>
                </div>
              </form>

              {/* Live department pulse — real data only */}
              <p className="mt-6 flex items-center gap-2.5 text-xs text-muted-foreground">
                {todayKey && campusNow.length > 0 ? (
                  <>
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-2 motion-safe:animate-ping rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-primary" />
                    </span>
                    <span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {campusNow.length}
                      </span>{" "}
                      CS class{campusNow.length === 1 ? "" : "es"} in session
                      right now
                      {nextStart && (
                        <span> · next starts {fmt12(nextStart)}</span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={`size-2 rounded-full ${todayKey && nextStart ? "bg-primary" : "bg-muted-foreground/40"}`}
                    />
                    <span>
                      {todayKey && nextStart
                        ? `Next CS class today at ${fmt12(nextStart)}`
                        : nextExam && mounted
                          ? `Next ${EXAM_DEPT} exam ${nextExam}`
                          : "CS timetable · Fall 2026"}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* ── The original scheduling illustration ── */}
            <LandingIllustration
              sessions={CS_SESSIONS.filter(
                (session) =>
                  session.cls === sampleCls && session.day === previewDay,
              )
                .sort((a, b) => toMin(a.start) - toMin(b.start))
                .slice(0, 3)}
              section={sampleCls || "CS"}
              selectedDay={previewDay}
              version={CS_TT_VERSION}
            />
          </div>
        </section>

        {/* ─── Features: icon-led, real features only ──────────────────── */}
        <section
          id="features"
          className="border-t border-foreground/15 scroll-mt-20"
        >
          <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 sm:py-14">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Features — the short list
            </p>
            <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything the week needs.{" "}
              <span className="text-primary">Nothing it doesn't.</span>
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <FeatureCard key={f.title} feature={f} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── Exam profiles — restored from the full feature set ─────── */}
        <section className="border-t border-foreground/15">
          <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10">
            <div className="flex flex-col gap-5 rounded-2xl border border-primary/15 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                  <GraduationCap className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                    Exam profiles
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                    Find your datesheet by name or roll number.
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    See your papers by day, with the assigned rooms and seats,
                    course details, and a print-ready profile.
                  </p>
                </div>
              </div>
              <Link
                to="/exams"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Find my exams <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ─── The registry, counted in real things + provenance ────────── */}
        <section className="border-t border-foreground/15">
          <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 sm:py-12">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              The receipts · {CS_TT_VERSION} · {EXAM_TERM}
            </p>
            <dl className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt
                  aria-live="polite"
                  aria-atomic="true"
                  className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl"
                >
                  {mounted && generated !== null
                    ? generated.toLocaleString()
                    : "—"}
                </dt>
                <dd className="mt-2 border-t border-foreground/20 pt-2 text-sm font-medium text-foreground">
                  Schedules generated
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  Every generated schedule, weekly or exam
                </dd>
              </div>
              <div>
                <dt className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
                  {CS_SESSIONS.length}
                </dt>
                <dd className="mt-2 border-t border-foreground/20 pt-2 font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted-foreground">
                  CS sessions verified &amp; built in
                </dd>
              </div>
              <div>
                <dt className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
                  {EXAM_STUDENTS.toLocaleString()}
                </dt>
                <dd className="mt-2 border-t border-foreground/20 pt-2 font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted-foreground">
                  Students in the built-in seating plan
                </dd>
              </div>
              <div>
                <dt className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
                  {EXAM_PAPERS.toLocaleString()}
                </dt>
                <dd className="mt-2 border-t border-foreground/20 pt-2 font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted-foreground">
                  Seat assignments resolved per exam day
                </dd>
              </div>
            </dl>
            <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
              Where this data comes from: {EXAM_SOURCE}.
            </p>
          </div>
        </section>

        {/* ─── Beyond CS: whatever the owner has published ─────────────── */}
        {publishedDocs.length > 0 && (
          <section className="border-t border-foreground/15">
            <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 sm:py-12">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Sheet 02 — published copies
              </p>
              <h2 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
                Other departments, already parsed &amp; published
              </h2>
              <div className="mt-8 divide-y divide-border border-y border-border">
                {publishedDocs.map((d, i) => (
                  <div
                    key={d.id}
                    className="grid items-baseline gap-2 py-3.5 sm:grid-cols-[2rem_1fr_auto] sm:gap-4"
                  >
                    <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {d.departments?.name ?? d.title}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {d.title} · {d.version}
                      </div>
                    </div>
                    <nav className="flex gap-5 whitespace-nowrap text-xs font-medium">
                      {timetables.some((t) => t.id === d.id) && (
                        <Link
                          to="/classes"
                          search={{ published: d.id }}
                          className="text-foreground underline decoration-foreground/30 underline-offset-4 transition hover:text-primary"
                        >
                          classes →
                        </Link>
                      )}
                      {datesheets.some((x) => x.id === d.id) && (
                        <Link
                          to="/exams"
                          search={{ doc: d.id }}
                          className="text-foreground underline decoration-foreground/30 underline-offset-4 transition hover:text-primary"
                        >
                          exams →
                        </Link>
                      )}
                    </nav>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ── Features + how-it-works content (real features only — see /classes
 *    and /exams for exactly what these reference) ── */
const FEATURES = [
  {
    icon: CalendarPlus,
    title: "Build your week",
    desc: "Search a course code, load a whole section in one click, or upload your department's official PDF.",
  },
  {
    icon: ListChecks,
    title: "Organise your courses",
    desc: "Everything grouped by course — move, edit or swap any session; custom courses welcome.",
  },
  {
    icon: LayoutGrid,
    title: "Two ways to read it",
    desc: "A week grid for planning and a day sheet for mornings — both print-ready in the department's format.",
  },
  {
    icon: ShieldCheck,
    title: "Clashes caught on contact",
    desc: "Overlapping sessions are flagged instantly, and the resolver suggests sections that actually fit.",
  },
] as const;

function FeatureCard({ feature }: { feature: (typeof FEATURES)[number] }) {
  const Icon = feature.icon;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-semibold tracking-tight">{feature.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {feature.desc}
      </p>
    </div>
  );
}
