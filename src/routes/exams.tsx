import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CornerDownRight,
  Download,
  Printer,
  Search,
  Share2,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PrimaryButton, SectionCard } from "@/components/form-bits";
import {
  downloadIcs,
  groupByDay,
  loadExamDataset,
  lookupStudent,
  normalizeReg,
  paperView,
  papersToIcs,
  sortPapers,
  daysUntil,
  type ExamDataset,
  type Paper,
  type StudentRec,
} from "@/lib/exam-data";
import { EXAM_DEPT, EXAM_SOURCE, EXAM_TERM } from "@/lib/exam-meta";

export const Route = createFileRoute("/exams")({
  head: () => ({
    meta: [
      { title: "Personal Exam Datesheet — CampusEase" },
      {
        name: "description",
        content:
          "Enter your registration number and get your personal exam datesheet — papers, rooms, and seats, straight from the official seating plan.",
      },
      { property: "og:title", content: "Personal Exam Datesheet — CampusEase" },
      {
        property: "og:description",
        content:
          "Your exams, rooms, and seats from one registration number. Powered by the official seating plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExamsRoute,
});

type SavedDatesheet = { reg: string };
const RECENTS_KEY = "campusease.exam.reg-recents";

function i12(slot: string): string {
  const conv = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return t;
    let h = +m[1];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m[2]} ${ampm}`;
  };
  const [a, b] = slot.split("-");
  return `${conv(a ?? "")}–${conv(b ?? "")}`;
}

function dayHeading(date: string): {
  top: string;
  sub: string;
  countdown: string;
} {
  const d = new Date(`${date}T00:00:00`);
  const left = daysUntil(date);
  const sub =
    d.toLocaleDateString("en-GB", { day: "numeric", month: "long" }) +
    (d.getFullYear() ? ` ${d.getFullYear()}` : "");
  const countdown =
    left === 0
      ? "today"
      : left === 1
        ? "tomorrow"
        : left > 1
          ? `in ${left} days`
          : `${-left} ${left === -1 ? "day" : "days"} ago`;
  return {
    top: d.toLocaleDateString("en-GB", { weekday: "long" }),
    sub,
    countdown,
  };
}

function useDataset() {
  const [state, setState] = useState<{
    ds: ExamDataset | null;
    error: string | null;
    loading: boolean;
  }>({ ds: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    loadExamDataset()
      .then((ds) => alive && setState({ ds, error: null, loading: false }))
      .catch(
        (e) =>
          alive &&
          setState({
            ds: null,
            error:
              e instanceof Error ? e.message : "Could not load the dataset",
            loading: false,
          }),
      );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function useRecents(): [Array<{ reg: string }>, (reg: string) => void] {
  const [recents, setRecents] = useState<Array<{ reg: string }>>(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      const arr = raw ? (JSON.parse(raw) as Array<{ reg: string }>) : [];
      return Array.isArray(arr) ? arr.slice(0, 6) : [];
    } catch {
      return [];
    }
  });
  const remember = useCallback((reg: string) => {
    setRecents((cur) => {
      const next = [{ reg }, ...cur.filter((r) => r.reg !== reg)].slice(0, 6);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — fine */
      }
      return next;
    });
  }, []);
  return [recents, remember];
}

function SearchCard({
  value,
  onChange,
  onSubmit,
  busy,
  recents,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  busy: boolean;
  recents: Array<{ reg: string }>;
  error: string | null;
}) {
  const ok = !!normalizeReg(value);
  return (
    <SectionCard label="Step 1 · Enter your registration number">
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) onSubmit(value);
        }}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. FA25-BCS-065"
          spellCheck={false}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          inputMode="text"
          maxLength={32}
          data-1p-ignore
          aria-label="Registration number"
          className="h-12 w-full rounded-lg border border-input bg-background px-4 font-mono text-base uppercase tracking-wide placeholder:normal-case italic placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          disabled={busy}
          style={{ textTransform: "uppercase" }}
        />
        <PrimaryButton
          type="submit"
          disabled={!ok || busy}
          className="h-12 shrink-0 px-6 sm:w-auto"
        >
          <Search className="size-4" />
          {busy ? "Loading…" : "Get my datesheet"}
        </PrimaryButton>
      </form>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          Format{" "}
          <code className="rounded bg-muted px-1 font-mono text-[10.5px]">
            CIIT/FA25-BCS-065/ISB
          </code>{" "}
          — the CIIT and ISB parts are optional; case doesn't matter.
        </span>
        {error && <span className="text-destructive">{error}</span>}
      </div>
      {recents.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 print:hidden">
          <span className="text-[10.5px] uppercase tracking-wide font-mono text-muted-foreground">
            recent:
          </span>
          {recents.map((r) => (
            <button
              key={r.reg}
              onClick={() => {
                onChange(r.reg);
                onSubmit(r.reg);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-[11px] hover:bg-muted transition"
            >
              {normalizeReg(r.reg)}
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function PaperRow({ paper }: { paper: Paper }) {
  const clash = paperView.isClash(paper);
  const [start, end] = (paper.effectiveSlot ?? paper.slot).split("-");
  const shownSlot = `${start}–${end}`;
  return (
    <div
      className={`flex gap-3 px-4 py-3 ${clash ? "bg-amber-500/5" : ""}`}
      style={{
        boxShadow: `inset 3px 0 0 ${clash ? "var(--color-amber-500, #f59e0b)" : "transparent"}`,
      }}
    >
      <div className="w-[92px] shrink-0 font-mono text-[10.5px] pt-0.5 tabular-nums text-muted-foreground">
        {i12(shownSlot)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[11.5px] font-bold tracking-tight text-primary">
            {paperView.code(paper)}
          </span>
          <span className="text-[12.5px] font-semibold leading-snug">
            {paper.title}
          </span>
          <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
            {paper.cls}
          </span>
          {clash && (
            <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
              clash room · session {paper.clashSession}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-baseline gap-1 rounded-md bg-muted/70 px-2 py-1 font-mono text-[11px]">
            <span className="text-muted-foreground text-[9.5px] uppercase tracking-wider">
              room
            </span>
            <span className="font-bold">{paperView.room(paper)}</span>
          </span>
          <span className="inline-flex items-baseline gap-1 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary">
            <span className="text-[9.5px] uppercase tracking-wider opacity-75">
              seat
            </span>
            <span className="font-bold">{paper.seat}</span>
          </span>
          {paper.slot.startsWith("08:30") && paper.slot === "08:30-10:00" && (
            <span className="text-[10px] text-muted-foreground">
              hybrid · virtual campus joins this slot
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Datesheet({ student }: { student: StudentRec }) {
  const papers = useMemo(
    () => sortPapers(student.papers.filter((p) => p.date)),
    [student.papers],
  );
  const nextP = useMemo(() => {
    let best: Paper | null = null;
    for (const p of papers) {
      if (daysUntil(p.date) < 0) continue;
      if (!best) best = p;
      else {
        const ka = `${p.date}|${p.effectiveSlot ?? p.slot}`;
        const kb = `${best.date}|${best.effectiveSlot ?? best.slot}`;
        if (ka.localeCompare(kb) < 0) best = p;
      }
    }
    return best;
  }, [papers]);
  const classes = useMemo(
    () => [...new Set(papers.map((p) => p.cls))],
    [papers],
  );
  const clashPapers = papers.filter((p) => paperView.isClash(p));

  return (
    <>
      {/* identity strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-primary/15 text-primary">
            <UserRound className="size-4.5" />
          </div>
          <div>
            <div className="text-sm font-semibold">{student.name}</div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {student.reg}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10.5px] font-mono">
            {papers.length} {papers.length === 1 ? "paper" : "papers"}
          </span>
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10.5px] font-mono">
            {new Set(papers.map((p) => p.date)).size}{" "}
            {new Set(papers.map((p) => p.date)).size === 1 ? "day" : "days"}
          </span>
          {classes.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[10.5px] font-mono"
              title="Class groups you sit papers with"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {nextP && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-[12.5px]">
          <Sparkles className="size-4 text-primary" />
          <span>
            Next paper <strong>{paperView.code(nextP)}</strong> — {nextP.title}
          </span>
          <CornerDownRight className="size-3 text-muted-foreground" />
          <span className="font-mono text-[11px]">
            {dayHeading(nextP.date).sub} ·{" "}
            {i12(nextP.effectiveSlot ?? nextP.slot)} · {paperView.room(nextP)} ·
            seat {nextP.seat}
          </span>
        </div>
      )}

      {clashPapers.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-800 dark:text-amber-300">
          <strong>You have clashes this term</strong> — {clashPapers.length}{" "}
          paper{clashPapers.length === 1 ? "" : "s"} sit in the{" "}
          <strong>Clash Room</strong> in sequenced sessions. Each row below
          shows your exact room + window; arrive 10 minutes early.
        </div>
      )}

      {/* day sheets */}
      <div className="space-y-4">
        {groupByDay(papers).map(([date, list]) => {
          const h = dayHeading(date);
          return (
            <div
              key={date}
              className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
                <div>
                  <span className="text-[13px] font-semibold">{h.top}</span>
                  <span className="ml-2 text-[11.5px] text-muted-foreground">
                    {h.sub}
                  </span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {h.countdown}
                </span>
              </div>
              <div className="divide-y divide-border">
                {list.map((p) => (
                  <PaperRow
                    key={`${p.date}|${p.slot}|${p.code}|${p.seat}`}
                    paper={p}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[10.5px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
        {EXAM_TERM} · from the official seating plan
      </p>
    </>
  );
}

function regFromUrl(): string {
  try {
    const core = new URLSearchParams(window.location.search).get("reg");
    return core ? core.replace(/[^\wA-Z-]/gi, "").toUpperCase() : "";
  } catch {
    return "";
  }
}

function setRegInUrl(core: string) {
  const url = core ? `/exams?reg=${core}` : "/exams";
  window.history.pushState({}, "", url);
}

function ExamsRoute() {
  const [reg, setRegState] = useState<string>(() =>
    typeof window === "undefined" ? "" : regFromUrl(),
  );
  useEffect(() => {
    const onPop = () => setRegState(regFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const { ds, loading, error } = useDataset();
  const [input, setInput] = useState(reg ?? "");
  const [recents, remember] = useRecents();
  const lastLookedRef = useRef<string>("");

  // Deep-link ?reg=… → jump straight to the datesheet
  useEffect(() => {
    if (reg && ds && lastLookedRef.current !== reg) {
      lastLookedRef.current = reg;
      remember(reg);
    }
  }, [reg, ds, remember]);

  const lookup = useMemo(
    () => (ds && reg ? lookupStudent(ds, reg) : null),
    [ds, reg],
  );

  const setReg = useCallback((next: string) => {
    const core = normalizeReg(next);
    setRegState(core ?? "");
    setRegInUrl(core ?? "");
  }, []);

  const student: StudentRec | null =
    lookup?.kind === "found" ? lookup.student : null;

  const actions = student && ds && (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button
        onClick={() => {
          downloadIcs(student.papers, {
            reg: student.reg,
            name: student.name,
            term: ds.term,
          });
          toast.success("Calendar file downloaded — open it to subscribe");
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium hover:bg-muted transition"
      >
        <CalendarDays className="size-3.5" /> Add to calendar (.ics)
      </button>
      <button
        onClick={() => {
          if (navigator.share) {
            navigator
              .share({ title: "My exam datesheet", url: location.href })
              .catch(() => {});
          } else {
            navigator.clipboard?.writeText(location.href);
            toast.success("Link copied — share it with your classmates");
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium hover:bg-muted transition"
      >
        <Share2 className="size-3.5" /> Share link
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium hover:bg-muted transition"
      >
        <Printer className="size-3.5" /> Print
      </button>
      <button
        onClick={() => {
          setReg("");
          setInput("");
          toast("Cleared — enter another registration number");
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium hover:bg-muted transition"
      >
        Clear
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-foreground">
      <div className="print:hidden">
        <AppNav />
      </div>
      <main className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0">
        <div className="print:hidden">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Exam datesheet" }]}
          />
        </div>
        <header className="mb-6">
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Personal exam datesheet
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {EXAM_DEPT} · {EXAM_TERM}. One registration number — get every paper
            with its room and seat, straight from the official seating plan.
          </p>
        </header>

        <div className="space-y-4">
          <SearchCard
            value={input}
            onChange={setInput}
            onSubmit={setReg}
            busy={loading}
            recents={recents}
            error={error}
          />

          {loading && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <div className="mx-auto size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <p className="mt-3">Loading the seating plan…</p>
            </div>
          )}

          {ds && lookup?.kind === "found" && student && (
            <SectionCard label="Step 2 · Your datesheet">
              <div className="space-y-3">
                <Datesheet student={student} />
                {actions}
              </div>
            </SectionCard>
          )}

          {ds && lookup?.kind === "unknown" && (
            <SectionCard label="No seat found">
              <div className="space-y-3 text-sm">
                <p>
                  <span className="font-mono">{lookup.reg}</span> has no seat in{" "}
                  {ds.dept
                    ? `the ${ds.dept} seating plan`
                    : "this seating plan"}
                  . Check the number (batch, program, and 3-digit roll) and try
                  again.
                </p>
                {lookup.near.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide font-mono text-muted-foreground">
                      close matches — click one:
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {lookup.near.map((s) => (
                        <button
                          key={s.reg}
                          onClick={() => {
                            setInput(s.core);
                            setReg(s.core);
                          }}
                          className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[11px] text-primary hover:bg-primary/20 transition"
                        >
                          {s.core} · {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {ds && lookup?.kind === "invalid" && (
            <SectionCard label="That doesn't look like a registration number">
              <p className="text-sm text-muted-foreground">
                Try the format <code className="font-mono">FA25-BCS-065</code> —
                batch, program, then your 3-digit roll number.
              </p>
            </SectionCard>
          )}
        </div>

        <footer className="mt-10 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
          <Download className="mb-0.5 inline size-3" /> Seats, rooms, and times
          come from the official <strong>{EXAM_DEPT}</strong> seating plan —{" "}
          {EXAM_SOURCE}. A paper sits where the department seated it; clash-room
          windows are sequential sittings of the same official slot. Always
          double-check against the posted hard copy.
        </footer>
      </main>
    </div>
  );
}

export default ExamsRoute;
