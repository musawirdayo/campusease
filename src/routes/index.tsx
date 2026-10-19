import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  FileText,
  ListChecks,
  Printer,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { SectionLabel } from "@/components/form-bits";
import {
  usePublishedDatesheets,
  usePublishedTimetables,
} from "@/lib/published";
import { CS_CLASSES, CS_SESSIONS, CS_TT_VERSION } from "@/lib/cs-timetable";
import { CS_DATESHEET_EXAMS, CS_DATESHEET_VERSION } from "@/lib/cs-datesheet";
import { DAY_FULL, fmt12, toMin } from "@/lib/timetable";
import type { Day } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CampusEase — Your personal class & exam timetable" },
      {
        name: "description",
        content:
          "Build a clash-free weekly class timetable for your own courses and get your personal exam schedule from any department's PDF.",
      },
      {
        property: "og:title",
        content: "CampusEase — Your personal class & exam timetable",
      },
      {
        property: "og:description",
        content:
          "Clash-free class timetables and personal exam schedules for students.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function Landing() {
  const [now, setNow] = useState(() => new Date());
  // Days/times only after mount — SSR has the server clock, the client must
  // agree on first paint to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const [quickSection, setQuickSection] = useState("");

  // Next upcoming exam from the built-in CS datesheet (dates are ISO).
  const nextExam = useMemo<(typeof CS_DATESHEET_EXAMS)[number] | null>(() => {
    const floor = new Date().setHours(0, 0, 0, 0);
    let best: (typeof CS_DATESHEET_EXAMS)[number] | null = null;
    for (const e of CS_DATESHEET_EXAMS) {
      const dt = new Date(e.date + "T00:00:00");
      if (isNaN(dt.getTime()) || dt.getTime() < floor) continue;
      if (!best || e.date < best.date) best = e;
    }
    return best;
  }, []);
  const daysToExam = nextExam
    ? Math.round(
        (new Date(nextExam.date + "T00:00:00").getTime() -
          new Date().setHours(0, 0, 0, 0)) /
          86400000,
      )
    : 0;
  const fmtExam = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Which weekday to preview: today when classes run, else Monday.
  const todayKey = mounted ? DAYS_SHORT[now.getDay()] : "Mon";
  const previewDay: Day = (
    CS_SESSIONS.some((s) => s.day === todayKey) ? todayKey : "Mon"
  ) as Day;
  const isWeekend = mounted && previewDay !== DAYS_SHORT[now.getDay()];

  // Pick the section with the busiest preview day — a real slice of the CS timetable.
  const sampleCls = useMemo(() => {
    const tally = new Map<string, number>();
    for (const s of CS_SESSIONS)
      if (s.day === previewDay) tally.set(s.cls, (tally.get(s.cls) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [previewDay]);

  const previewSessions = useMemo(
    () =>
      CS_SESSIONS.filter(
        (s) => s.cls === sampleCls && s.day === previewDay,
      ).sort((a, b) => toMin(a.start) - toMin(b.start)),
    [sampleCls, previewDay],
  );

  const nowMin = mounted ? now.getHours() * 60 + now.getMinutes() : -1;
  const liveNow =
    nowMin < 0
      ? []
      : previewSessions.filter(
          (s) => toMin(s.start) <= nowMin && nowMin < toMin(s.end),
        );

  // Live headline line: what's on at CS right now (any section).
  const campusNow =
    nowMin < 0
      ? []
      : CS_SESSIONS.filter(
          (s) =>
            s.day === todayKey &&
            toMin(s.start) <= nowMin &&
            nowMin < toMin(s.end),
        );
  const nextStart = !campusNow.length
    ? nowMin < 0
      ? null
      : (CS_SESSIONS.filter(
          (s) => s.day === todayKey && toMin(s.start) > nowMin,
        ).sort((a, b) => toMin(a.start) - toMin(b.start))[0]?.start ?? null)
    : null;

  const { data: timetables = [] } = usePublishedTimetables();
  const { data: datesheets = [] } = usePublishedDatesheets();
  const publishedDepts = [
    ...new Set(
      [...timetables, ...datesheets].map((d) => d.departments?.name ?? d.title),
    ),
  ].sort();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="relative overflow-hidden">
        {/* Ambient hero background: soft gradient blobs + faint grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute inset-0 dot-grid [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]" />
          <div className="absolute -top-32 left-1/2 -z-10 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute top-40 right-[-140px] h-[360px] w-[360px] rounded-full bg-chart-2/10 blur-3xl" />
          <div className="absolute top-64 left-[-160px] h-[320px] w-[320px] rounded-full bg-chart-4/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4">
          {/* Hero */}
          <section className="grid items-center gap-12 pt-12 pb-8 sm:pt-20 lg:grid-cols-[1.05fr_420px]">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
                <Sparkles className="size-3.5 text-primary" />
                Built for students · no account needed
              </div>

              <h1 className="mt-6 max-w-2xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Your semester,{" "}
                <span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
                  clash-free
                </span>
                .
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
                Pick your courses and see your week laid out clean — then get
                exactly the exams{" "}
                <em className="font-medium text-foreground not-italic">you</em>{" "}
                sit, with rooms, dates and instructors.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/classes"
                  className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
                >
                  <CalendarCheck2 className="size-4" /> Build my class timetable
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/exams"
                  className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-5 py-3 text-sm font-medium shadow-sm transition hover:bg-muted"
                >
                  <FileText className="size-4" /> Open exam schedules
                </Link>
              </div>

              {/* Trust row — three quiet facts, no clutter */}
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Clash detection built in
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Printer className="size-3.5 text-primary" />
                  Print / save as PDF
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Upload className="size-3.5 text-primary" />
                  Works with any department's PDF
                </span>
              </div>
            </div>

            {/* Live preview card */}
            <div
              className="group rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/5 ring-1 ring-black/[0.02] transition-shadow hover:shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both delay-150"
              aria-label={`Sample timetable preview for ${DAY_FULL[previewDay]}`}
            >
              {/* window chrome */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-red-400/70" />
                  <span className="size-2.5 rounded-full bg-yellow-400/70" />
                  <span className="size-2.5 rounded-full bg-green-400/70" />
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {CS_TT_VERSION} · {DAY_FULL[previewDay]}
                  {isWeekend ? " (preview)" : ""}
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{sampleCls || "—"}</h2>
                {liveNow.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
                    in class now
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {nextStart
                      ? `next class ${fmt12(nextStart)}`
                      : isWeekend
                        ? "campus quiet"
                        : "done for today"}
                  </span>
                )}
              </div>

              <ul className="mt-3 space-y-1.5">
                {previewSessions.slice(0, 6).map((s, i) => {
                  const ongoing =
                    mounted &&
                    toMin(s.start) <= nowMin &&
                    nowMin < toMin(s.end);
                  return (
                    <li
                      key={`${s.code}-${s.start}-${s.room}`}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors animate-in fade-in slide-in-from-bottom-1 duration-500 fill-mode-both [animation-delay:${(250 + i * 90).toFixed(0)}ms] ${
                        ongoing
                          ? "border-primary/40 bg-primary/5 shadow-sm"
                          : "border-border/70 bg-background/50"
                      }`}
                    >
                      <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
                        {fmt12(s.start)} – {fmt12(s.end)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {s.title.length > 28
                          ? s.title.slice(0, 28) + "…"
                          : s.title}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {s.room}
                      </span>
                    </li>
                  );
                })}
                {previewSessions.length === 0 && (
                  <li className="rounded-lg border border-border/70 bg-background/50 px-3 py-4 text-center text-xs text-muted-foreground">
                    No classes scheduled for this day.
                  </li>
                )}
              </ul>

              <p className="mt-4 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {CS_SESSIONS.length} sessions & {CS_DATESHEET_EXAMS.length}{" "}
                exams ({CS_DATESHEET_VERSION}) built in
              </p>
            </div>
          </section>

          {/* Quick start — one quiet row, straight into the builder */}
          <section className="mx-auto max-w-2xl pb-4">
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/80 p-2 shadow-sm backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:250ms]"
            >
              <span className="pl-2 text-xs font-medium text-muted-foreground">
                CS student?
              </span>
              <select
                value={quickSection}
                onChange={(e) => setQuickSection(e.target.value)}
                aria-label="Which section are you in?"
                className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Pick your section…</option>
                {CS_CLASSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
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
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Open my timetable
                <ArrowRight className="size-3.5" />
              </button>
            </form>
          </section>

          {/* How it works */}
          <section className="mt-16 sm:mt-20">
            <div className="text-center">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Three steps to a clean week
              </h2>
            </div>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className={`relative animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both [animation-delay:${(i * 120 + 100).toFixed(0)}ms]`}
                >
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 font-mono text-sm font-semibold text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-sm font-semibold sm:mt-2">
                      {step.title}
                    </h3>
                  </div>
                  <p className="mt-2.5 max-w-xs text-sm text-muted-foreground">
                    {step.desc}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* Tools */}
          <section className="mt-16 grid gap-6 sm:mt-20 md:grid-cols-2">
            <ToolCard
              to="/classes"
              step="01 · Class timetable"
              icon={CalendarCheck2}
              title="Build your weekly timetable"
              desc="Add courses one by one, mix sections, and see clashes the moment they happen. The resolver suggests other sections that fit — handy on registration day."
              bullets={[
                `CS built in · ${CS_TT_VERSION}`,
                "Any department: upload the official PDF",
                "Move, edit or swap any class",
              ]}
              cta="Start building"
              primary
            />
            <ToolCard
              to="/exams"
              step="02 · Exams"
              icon={FileText}
              title="Personal exam schedule"
              desc="Pick your program, semester and section — or upload your department's datesheet — and get exactly the exams you have to sit, with any scheduling clashes flagged."
              bullets={[
                "Repeater & custom picking",
                "Exam clash warnings built in",
                "Rooms, dates and instructors",
              ]}
              cta="Generate"
            />
          </section>

          {/* Beyond CS — everything the owner published, one tap away */}
          {publishedDepts.length > 0 && (
            <section className="mt-16 sm:mt-20">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <SectionLabel>Beyond CS</SectionLabel>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                    Published schedules
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  {publishedDepts.length} department
                  {publishedDepts.length === 1 ? "" : "s"} · live from the
                  database
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {timetables.map((d) => (
                  <Link
                    key={`tt-${d.id}`}
                    to="/classes"
                    search={{ published: d.id }}
                    className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium shadow-sm transition hover:border-primary/50 hover:bg-muted"
                  >
                    {d.departments?.name ?? d.title}
                    <span className="ml-1.5 text-muted-foreground">
                      · classes
                    </span>
                  </Link>
                ))}
                {datesheets.map((d) => (
                  <Link
                    key={`ds-${d.id}`}
                    to="/exams"
                    search={{ doc: d.id }}
                    className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium shadow-sm transition hover:border-primary/50 hover:bg-muted"
                  >
                    {d.departments?.name ?? d.title}
                    <span className="ml-1.5 text-muted-foreground">
                      · exams
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Closing CTA band */}
          <section className="mt-16 pb-20 sm:mt-20 sm:pb-24">
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-12 text-center shadow-lg sm:px-12">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              >
                <div className="absolute inset-0 dot-grid opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black,transparent)]" />
                <div className="absolute -bottom-24 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
              </div>
              <div className="relative">
                <Zap className="mx-auto size-5 text-primary" />
                <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Ready for a clash-free semester?
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Takes about two minutes. No sign-up, no forms to print.
                  {nextExam &&
                    ` Next CS exam: ${fmtExam(nextExam.date)}${
                      daysToExam > 0 ? ` — in ${daysToExam}` : ""
                    }`}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    to="/classes"
                    className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
                  >
                    <ListChecks className="size-4" /> Build my timetable
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    to="/exams"
                    className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-5 py-3 text-sm font-medium transition hover:bg-muted"
                  >
                    <FileText className="size-4" /> Exams
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

const STEPS = [
  {
    title: "Pick your courses",
    desc: "Choose your section or upload your department's official timetable PDF — CampusEase turns it into clean rows.",
  },
  {
    title: "Let clashes resolve",
    desc: "Overlaps are flagged instantly, and the auto-resolver suggests sections that actually fit your week.",
  },
  {
    title: "Save, print, done",
    desc: "Your personal class grid and exam datesheet, print-ready as PDF and saved for next time — no account.",
  },
] as const;

function ToolCard({
  to,
  step,
  icon: Icon,
  title,
  desc,
  bullets,
  cta,
  primary,
}: {
  to: "/classes" | "/exams";
  step: string;
  icon: typeof CalendarCheck2;
  title: string;
  desc: string;
  bullets: string[];
  cta: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group relative block overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 sm:p-7"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-primary/5 blur-2xl transition-opacity opacity-0 group-hover:opacity-100"
      />
      <div className="relative flex items-center justify-between gap-3">
        <SectionLabel>{step}</SectionLabel>
        <span className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="size-4.5" />
        </span>
      </div>
      <h2 className="relative mt-3 text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="relative mt-2 text-sm text-muted-foreground">{desc}</p>
      <ul className="relative mt-4 space-y-1.5 text-xs text-muted-foreground">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-px font-semibold text-primary"
            >
              ✓
            </span>
            {b}
          </li>
        ))}
      </ul>
      <div className="relative mt-5 inline-flex items-center gap-1 text-sm font-medium text-foreground">
        {cta}
        <span className="rounded-md border border-input px-2.5 py-1 transition group-hover:bg-primary group-hover:text-primary-foreground">
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
