import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, FileText } from "lucide-react";
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
      <main className="mx-auto max-w-6xl px-4 pb-20">
        {/* Hero + live preview */}
        <section className="grid items-center gap-6 pt-8 pb-4 sm:gap-10 sm:pt-16 lg:grid-cols-[1fr_380px]">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
            <SectionLabel>Built for students · no account needed</SectionLabel>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Your semester without the{" "}
              <span className="text-primary">clashes</span>.
            </h1>
            <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
              Pick your courses, see your week laid out clash-free — then get
              exactly the exams you sit, with rooms, dates and instructors.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/classes"
                className="group inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                <CalendarCheck2 className="size-4" /> Build my class timetable
              </Link>
              <Link
                to="/exams"
                className="group inline-flex items-center gap-1.5 rounded-md border border-input px-4 py-2.5 text-sm font-medium transition hover:bg-muted"
              >
                <FileText className="size-4" /> Open exam schedules
              </Link>
            </div>

            {/* One-click start — straight into the builder with the section picked */}
            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both [animation-delay:150ms]"
            >
              <CalendarCheck2 className="size-4 shrink-0 text-primary" />
              <select
                value={quickSection}
                onChange={(e) => setQuickSection(e.target.value)}
                aria-label="Which section are you in?"
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                <option value="">One-click start: pick your section…</option>
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
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground whitespace-nowrap transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Open my timetable →
              </button>
            </form>

            {/* live line */}
            <div className="mt-5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-2 animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span className="font-medium text-foreground">
                {!mounted
                  ? "CS timetable live"
                  : campusNow.length > 0
                    ? `${campusNow.length} CS class${campusNow.length === 1 ? "" : "es"} in session right now`
                    : nextStart
                      ? `Next CS class starts ${fmt12(nextStart)}`
                      : isWeekend
                        ? "Campus quiet — preview shows Monday"
                        : "No more CS classes today"}
              </span>
              {publishedDepts.length > 0 && (
                <span>
                  · {publishedDepts.length} department schedules published
                </span>
              )}
            </div>

            {/* Next-exam nudge from the built-in CS datesheet */}
            <div className="mt-3">
              <Link
                to="/exams"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/60 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both [animation-delay:250ms]"
              >
                <FileText className="size-3.5 text-primary" />
                {!mounted
                  ? "Upcoming exams"
                  : nextExam
                    ? `Next CS exam · ${fmtExam(nextExam.date)} · ${fmt12(nextExam.time.split("-")[0])} · in ${daysToExam} day${daysToExam === 1 ? "" : "s"}`
                    : "Midterms over — next sheet lands here"}
              </Link>
            </div>
          </div>

          {/* Live preview card */}
          <div
            className="rounded-xl border border-border bg-card p-4 shadow-sm animate-in fade-in zoom-in-95 duration-500 fill-mode-both [animation-delay:150ms]"
            aria-label={`Sample timetable preview for ${DAY_FULL[previewDay]}`}
          >
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>
                Live sample · Computer Science · {CS_TT_VERSION}
              </SectionLabel>
            </div>
            <div className="mt-1 text-sm font-semibold">
              {sampleCls || "—"} · {DAY_FULL[previewDay]}
              {isWeekend && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  weekend
                </span>
              )}
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {previewSessions.slice(0, 7).map((s, i) => {
                const ongoing =
                  mounted && toMin(s.start) <= nowMin && nowMin < toMin(s.end);
                return (
                  <li
                    key={`${s.code}-${s.start}-${s.room}`}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs animate-in fade-in slide-in-from-bottom-1 duration-500 fill-mode-both [animation-delay:${(220 + i * 90).toFixed(0)}ms] sm:gap-2.5 ${
                      ongoing
                        ? "border-primary/40 bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground sm:w-24">
                      {fmt12(s.start)} – {fmt12(s.end)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.title.length > 30
                        ? s.title.slice(0, 30) + "…"
                        : s.title}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {s.room}
                    </span>
                    {ongoing && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                        <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
                        now
                      </span>
                    )}
                  </li>
                );
              })}
              {previewSessions.length === 0 && (
                <li className="rounded-md border border-border px-2.5 py-3 text-xs text-muted-foreground">
                  No classes scheduled for this day.
                </li>
              )}
            </ul>
            <p className="mt-3 border-t border-border pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {"Real day · "}
              {CS_SESSIONS.length} sessions &amp; {CS_DATESHEET_EXAMS.length}{" "}
              exams ({CS_DATESHEET_VERSION}) built in
            </p>
          </div>
        </section>

        {/* Tools */}
        <section className="mt-6 grid gap-4 sm:mt-8 md:grid-cols-2">
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
          <section className="mt-6">
            <SectionLabel>Beyond CS — published schedules</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {timetables.map((d) => (
                <Link
                  key={`tt-${d.id}`}
                  to="/classes"
                  search={{ published: d.id }}
                  className="rounded-full border border-input bg-card px-3 py-1.5 text-xs transition hover:border-primary/50 hover:bg-muted"
                >
                  📐 {d.departments?.name ?? d.title} · classes
                </Link>
              ))}
              {datesheets.map((d) => (
                <Link
                  key={`ds-${d.id}`}
                  to="/exams"
                  search={{ doc: d.id }}
                  className="rounded-full border border-input bg-card px-3 py-1.5 text-xs transition hover:border-primary/50 hover:bg-muted"
                >
                  📝 {d.departments?.name ?? d.title} · exams
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

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
      className="group block rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both [animation-delay:250ms]"
    >
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>{step}</SectionLabel>
        <span className="flex size-9 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="size-4" />
        </span>
      </div>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
      <ul className="mt-3 space-y-1 text-xs">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span aria-hidden="true" className="text-primary">
              ✓
            </span>
            {b}
          </li>
        ))}
      </ul>
      <div
        className={`mt-4 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
          primary
            ? "bg-primary text-primary-foreground group-hover:opacity-90"
            : "border border-input group-hover:bg-muted"
        }`}
      >
        {cta}
        <span className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </Link>
  );
}
