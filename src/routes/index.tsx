import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, MoveRight } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import {
  usePublishedDatesheets,
  usePublishedTimetables,
} from "@/lib/published";
import { CS_CLASSES, CS_SESSIONS, CS_TT_VERSION } from "@/lib/cs-timetable";
import { CS_DATESHEET_EXAMS, CS_DATESHEET_VERSION } from "@/lib/cs-datesheet";
import { DAY_FULL, fmt12, toMin } from "@/lib/timetable";
import type { ClassSession, Day } from "@/lib/types";

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

const DAYS_ORDER: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Course ink colour, same system as the app's WeekGrid cards. */
const ink = (n: number) => `var(--course-${n + 1})`;

function Landing() {
  const [now, setNow] = useState(() => new Date());
  // Days/times only after mount — SSR has the server clock, the client must
  // agree on first paint to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  const [generated, setGenerated] = useState<number | null>(null);
  const navigate = useNavigate();
  const [quickSection, setQuickSection] = useState("");

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(new Date()), 30_000);
    fetch("/api/counter", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { count?: number }) =>
        typeof j.count === "number" ? setGenerated(j.count) : null,
      )
      .catch(() => {});
    return () => clearInterval(t);
  }, []);

  // Live overlays are client-only truth; on the server we render the static sheet.
  const nowMin = mounted ? now.getHours() * 60 + now.getMinutes() : -1;

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
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main>
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-[1080px] px-4 pt-14 pb-16 sm:pt-24">
          <div className="grid items-start gap-14 lg:grid-cols-[1fr_minmax(360px,420px)] lg:gap-16">
            <div>
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground border-b border-foreground/20 pb-3 inline-block">
                CampusEase · class &amp; exam schedules
              </p>
              <h1 className="mt-6 text-[2.7rem] leading-[1.02] font-semibold tracking-tight sm:text-6xl">
                One PDF in.
                <br />
                Your whole week out,
                <br />
                <span className="text-primary">clash-free</span>.
              </h1>
              <p className="mt-6 max-w-md text-base text-muted-foreground sm:text-lg">
                CampusEase turns your department's timetable and datesheet
                sheets into{" "}
                <span className="text-foreground font-medium">
                  your personal, clash-checked schedule
                </span>{" "}
                — for classes and exams. No sign-up. Nothing to install.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/classes"
                  className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Open my timetable
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/exams"
                  className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition hover:text-foreground"
                >
                  Generate my datesheet
                  <MoveRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              {/* Quick start — pick a section, land in the builder */}
              <form
                onSubmit={(e) => e.preventDefault()}
                className="mt-10 max-w-md border-y border-foreground/15 py-4 flex flex-wrap items-center gap-2.5"
              >
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground shrink-0">
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
                  className="shrink-0 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Load it
                </button>
              </form>

              {/* Live department pulse — real data only */}
              <p className="mt-6 flex items-center gap-2.5 text-xs text-muted-foreground">
                {todayKey && campusNow.length > 0 ? (
                  <>
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-2 animate-ping rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-primary" />
                    </span>
                    <span>
                      <span className="font-semibold text-foreground tabular-nums">
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
                          ? `Next CS exam ${nextExam.date}${nextExam.rooms[0] ? ` · ${nextExam.rooms[0]}` : ""}`
                          : "CS timetable · Fall 2026"}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* ── THE PRODUCT: a real day sheet, exactly the app's phone view ── */}
            <DaySheet
              sampleCls={sampleCls || "—"}
              previewDay={previewDay}
              nowMin={nowMin}
              isWeekend={isWeekend}
            />
          </div>
        </section>

        {/* ─── The transformation: what you have → what you keep ────────── */}
        <section className="border-t border-foreground/15">
          <div className="mx-auto max-w-[1080px] px-4 py-16 sm:py-20">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Sheet 01 — what changes
            </p>
            <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              The department publishes one dense PDF for everyone. You get the
              rows that are{" "}
              <span className="underline decoration-primary/60 decoration-2 underline-offset-4 font-semibold">
                yours
              </span>
              , colour-coded and clash-checked.
            </h2>

            <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:gap-8 items-stretch">
              {/* Source: the messy shared PDF */}
              <SimulationPanel
                label="Source — official timetable PDF · 52 sections on one sheet"
                className="bg-muted/40"
              >
                <div className="font-mono text-[10.5px] leading-[1.9] text-muted-foreground overflow-x-auto">
                  <p className="text-foreground/60">
                    COMSATS University Islamabad · Dept. of Computer Science ·
                    CS Time Table - Fall 2026 · dated 13-Sep-2026
                  </p>
                  {BCS3A_SOURCE_ROWS.map((r) => (
                    <p key={r.raw}>{r.raw}</p>
                  ))}
                  <p className="text-muted-foreground/50">
                    …41 more sections follow…
                  </p>
                </div>
              </SimulationPanel>

              <div className="flex lg:flex-col items-center justify-center text-muted-foreground/50">
                <MoveRight className="size-5 max-lg:rotate-90" />
              </div>

              {/* Yours: extracted, deduped, colour-coded */}
              <SimulationPanel
                label="Your week — extracted · one section · zero noise"
                className="bg-card shadow-md ring-1 ring-foreground/8"
              >
                <div className="space-y-3">
                  {BCS3A_EXTRACTED.map((g, i) => (
                    <div key={g.code}>
                      <div className="flex items-baseline gap-2 border-b border-border pb-1">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: ink(i) }}
                        />
                        <span className="font-mono text-[11px] font-bold">
                          {g.code}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {g.title}
                        </span>
                      </div>
                      {g.rows.map((r, k) => (
                        <div
                          key={r}
                          className="flex gap-2 py-0.5 pl-[18px] font-mono text-[10.5px] tabular-nums text-muted-foreground odd:bg-muted/20"
                        >
                          <span className="text-foreground">{r}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </SimulationPanel>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Real BCS-3A sessions from the built-in CS dataset ({CS_TT_VERSION}
              ) — the same data the app loads, not a mockup.
            </p>
          </div>
        </section>

        {/* ─── The two tools, presented as registry sheets ──────────────── */}
        <section className="border-t border-foreground/15">
          <div className="mx-auto max-w-[1080px] px-4 py-16 sm:py-20 grid gap-14 md:grid-cols-2 md:gap-10">
            <ToolBlock
              n="01"
              title="Build your weekly class timetable"
              desc="Search codes, load a whole section in one click, or upload your department's PDF. Clashes are flagged on contact and the resolver suggests sections that actually fit your week. Print it or save it as PDF — the output looks like it came from the department."
              bullets={[
                "CS built in",
                "Any department by PDF upload",
                "Move, edit or swap any class",
                "Auto-resolver for clashes",
              ]}
              to="/classes"
              cta="Start building"
              primary
            />
            <ToolBlock
              n="02"
              title="Generate your personal exam datesheet"
              desc="Pick program, semester and section — or upload the official datesheet — and get exactly the exams you sit, rooms and all. Same-day exam clashes are flagged before you find out the hard way."
              bullets={[
                "Repeater & custom picking",
                "Exam clash warnings built in",
                "Rooms, dates and instructors",
                "Print-ready sheet",
              ]}
              to="/exams"
              cta="Generate my datesheet"
            />
          </div>
        </section>

        {/* ─── The registry, counted in real things ─────────────────────── */}
        <section className="border-t border-foreground/15">
          <div className="mx-auto max-w-[1080px] px-4 py-14 sm:py-16">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              The registry · {CS_TT_VERSION} · {CS_DATESHEET_VERSION}
            </p>
            <dl className="mt-8 grid gap-8 sm:grid-cols-3">
              <div>
                <dt className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums">
                  {mounted && generated !== null
                    ? generated.toLocaleString()
                    : "—"}
                </dt>
                <dd className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted-foreground border-t border-foreground/20 pt-2">
                  Timetables generated so far
                </dd>
              </div>
              <div>
                <dt className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums">
                  {CS_SESSIONS.length}
                </dt>
                <dd className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted-foreground border-t border-foreground/20 pt-2">
                  CS sessions verified &amp; built in
                </dd>
              </div>
              <div>
                <dt className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums">
                  {CS_DATESHEET_EXAMS.length}
                </dt>
                <dd className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted-foreground border-t border-foreground/20 pt-2">
                  Exams on the built-in datesheet
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ─── Beyond CS: whatever the owner has published ─────────────── */}
        {publishedDocs.length > 0 && (
          <section className="border-t border-foreground/15">
            <div className="mx-auto max-w-[1080px] px-4 py-14 sm:py-16">
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
                    className="grid sm:grid-cols-[2rem_1fr_auto] items-baseline gap-2 sm:gap-4 py-3.5"
                  >
                    <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {d.departments?.name ?? d.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {d.title} · {d.version}
                      </div>
                    </div>
                    <nav className="flex gap-5 text-xs font-medium whitespace-nowrap">
                      {timetables.some((t) => t.id === d.id) && (
                        <Link
                          to="/classes"
                          search={{ published: d.id }}
                          className="text-foreground hover:text-primary underline decoration-foreground/30 underline-offset-4 transition"
                        >
                          classes →
                        </Link>
                      )}
                      {datesheets.some((x) => x.id === d.id) && (
                        <Link
                          to="/exams"
                          search={{ doc: d.id }}
                          className="text-foreground hover:text-primary underline decoration-foreground/30 underline-offset-4 transition"
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

        {/* ─── Final call to action ─────────────────────────────────────── */}
        <section className="border-t border-foreground/15">
          <div className="mx-auto max-w-[1080px] px-4 py-20 sm:py-28">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              No account · no spreadsheets · nothing to print twice
            </p>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Pick your section. Two minutes. Done.
            </h2>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/classes"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Open my timetable
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/exams"
                className="text-sm font-medium text-foreground/80 hover:text-foreground transition"
              >
                Generate my datesheet
              </Link>
            </div>
            <p className="mt-8 max-w-md text-xs text-muted-foreground">
              CampusEase reads the official copy; it doesn't replace it. Always
              double-check your final timetable against the department's last
              word.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ── Hero sheet: the phone view of /classes, rendered with real CS data ── */

function DaySheet({
  sampleCls,
  previewDay,
  nowMin,
  isWeekend,
}: {
  sampleCls: string;
  previewDay: Day;
  nowMin: number;
  isWeekend: boolean;
}) {
  const sessions = useMemo(
    () =>
      CS_SESSIONS.filter(
        (s) => s.cls === sampleCls && s.day === previewDay,
      ).sort((a, b) => toMin(a.start) - toMin(b.start)),
    [sampleCls, previewDay],
  );
  // Colour each course by first appearance, like the app's grid does.
  const inkOfDay = useMemo(() => {
    const seen: string[] = [];
    const map = new Map<string, number>();
    for (const s of CS_SESSIONS.filter((x) => x.cls === sampleCls)) {
      if (!map.has(s.code)) map.set(s.code, seen.push(s.code) - 1);
    }
    return map;
  }, [sampleCls]);

  return (
    <figure
      className="rounded-lg border border-foreground/20 bg-card shadow-lg overflow-hidden"
      aria-label={`Sample timetable for ${DAY_FULL[previewDay]}`}
    >
      {/* sheet head — the same double rule the printed PDF uses */}
      <div className="border-b-2 border-foreground px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              CS Time Table · {CS_TT_VERSION}
            </div>
            <div className="mt-1 text-base font-semibold tracking-tight">
              {sampleCls} · {DAY_FULL[previewDay]}
              {isWeekend && (
                <span className="ml-2 font-mono text-[10px] font-medium text-muted-foreground">
                  (quiet day)
                </span>
              )}
            </div>
          </div>
          <div className="text-right font-mono text-[9.5px] uppercase tracking-[0.15em] text-muted-foreground">
            CampusEase
            <div>phone view</div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        {sessions.map((s) => {
          const ongoing =
            nowMin >= 0 && toMin(s.start) <= nowMin && nowMin < toMin(s.end);
          const inkColor = ink(inkOfDay.get(s.code) ?? 4);
          return (
            <div
              key={`${s.code}-${s.start}`}
              className="flex gap-3 px-4 py-3 motion-safe:animate-in fade-in duration-500"
              style={{
                background: ongoing
                  ? `color-mix(in oklab, ${inkColor} 12%, var(--card))`
                  : undefined,
                boxShadow: ongoing
                  ? `inset 3px 0 0 ${inkColor}`
                  : "inset 3px 0 0 transparent",
              }}
            >
              <div className="w-[76px] shrink-0 font-mono text-[10.5px] pt-0.5 tabular-nums text-muted-foreground">
                {fmt12(s.start)}–{fmt12(s.end)}
                {s.kind === "lab" && (
                  <div className="mt-1 inline-block rounded-sm border border-border bg-card px-1 text-[8.5px] font-semibold uppercase tracking-wide">
                    Lab
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="font-mono text-[11px] font-bold tracking-tight"
                    style={{ color: inkColor }}
                  >
                    {s.code}
                  </span>
                  {ongoing && (
                    <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-destructive">
                      <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
                      now
                    </span>
                  )}
                </div>
                <div className="text-[12.5px] font-semibold leading-snug">
                  {s.title}
                </div>
                <div className="mt-0.5 text-[10.5px] text-muted-foreground truncate">
                  {s.room || "Room TBA"} · {s.instructor}
                </div>
              </div>
            </div>
          );
        })}
        {sessions.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No classes scheduled for this day.
          </p>
        )}
      </div>

      {/* sheet footer — the print signature */}
      <figcaption className="border-t border-border bg-muted/40 px-4 py-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
        <span>always double-check with the official copy</span>
        <span>{CS_DATESHEET_EXAMS.length} exams · v1.0</span>
      </figcaption>
    </figure>
  );
}

/* ── Tools: two editorial blocks, deliberately different ── */

function ToolBlock({
  n,
  title,
  desc,
  bullets,
  to,
  cta,
  primary,
}: {
  n: string;
  title: string;
  desc: string;
  bullets: string[];
  to: "/classes" | "/exams";
  cta: string;
  primary?: boolean;
}) {
  return (
    <article className="md:border-t-2 md:border-foreground md:pt-5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Sheet {n}
        </span>
        {primary && (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-primary">
            most used
          </span>
        )}
      </div>
      <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl lg:text-[1.7rem]">
        {title}
      </h3>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        {desc}
      </p>
      <ul className="mt-5 space-y-1.5">
        {bullets.map((b, i) => (
          <li key={b} className="flex items-center gap-2.5 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: ink(i) }}
              aria-hidden="true"
            />
            <span className="text-foreground/80">{b}</span>
          </li>
        ))}
      </ul>
      <Link
        to={to}
        className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition"
      >
        {cta}
        <MoveRight className="size-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </article>
  );
}

/* ── Simulation panels used in the "what changes" section ── */

function SimulationPanel({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-border overflow-hidden flex flex-col ${className}`}
    >
      <div className="border-b border-border px-4 py-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
        </span>
      </div>
      <div className="p-4 min-w-0">{children}</div>
    </div>
  );
}

/** The "source PDF" parody: real CS rows, just badly formatted — one column
 *  dump of several sections, exactly how the official sheet actually reads. */
const BCS3A_SOURCE_ROWS = (() => {
  const codes = new Map<string, string>();
  for (const s of CS_SESSIONS)
    if (!codes.has(s.code)) codes.set(s.code, s.title);
  const pick = (cls: string, code: string) =>
    CS_SESSIONS.filter((s) => s.cls === cls && s.code === code)[0];
  const line = (s: ClassSession | undefined, extra = "") =>
    s
      ? `${s.cls}  ${s.code}  ${codes.get(s.code) || s.title}  ${s.day} ${s.start}-${s.end}   ${s.room || "TBA"}${extra}`
      : "";
  const lines = [
    line(pick("BCS-3A", "CSC211")),
    line(
      CS_SESSIONS.find(
        (s) => s.cls === "BCS-3A" && s.code === "CSC211" && s.kind === "lab",
      ),
      "  (Lab)",
    ),
    line(pick("BCS-3A", "CSC270")),
    line(pick("BCS-3B", "CSC102"), "  ← different section"),
    line(pick("BCS-3A", "CSC291")),
    line(pick("BCS-2A", "BIO310"), "  ← DIFFERENT SECTION"),
  ].filter(Boolean);
  return lines.map((raw) => ({ raw }));
})();

/** The "extracted" panel: every row is generated from the real dataset,
 *  deduped by day+time just like the app does — never hand-typed. */
const BCS3A_EXTRACTED = (() => {
  const out: { code: string; title: string; rows: string[] }[] = [];
  for (const s of CS_SESSIONS.filter((x) => x.cls === "BCS-3A")) {
    let g = out.find((o) => o.code === s.code);
    if (!g) {
      g = { code: s.code, title: s.title, rows: [] };
      out.push(g);
    }
    if (g.rows.every((r) => !r.startsWith(`${s.day} ${s.start}`)))
      g.rows.push(
        `${s.day} ${s.start}–${s.end} · ${s.room || "TBA"}${s.kind === "lab" ? " (Lab)" : ""}`,
      );
  }
  return out.slice(0, 3);
})();
