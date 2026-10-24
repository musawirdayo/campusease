import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  CornerDownRight,
  Download,
  GraduationCap,
  Printer,
  RotateCcw,
  ScanSearch,
  School,
  Search,
  Share2,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SectionCard } from "@/components/form-bits";
import {
  courseDetails,
  downloadIcs,
  dateView,
  groupByDay,
  i12,
  lookupStudentRemote,
  normalizeReg,
  searchStudentSuggestionsRemote,
  ordinalSem,
  paperView,
  papersToIcs,
  seatView,
  sortPapers,
  studentMeta,
  daysUntil,
  type Paper,
  type StudentSuggestion,
  type StudentRec,
  type CourseDetail,
} from "@/lib/exam-data";
import { EXAM_DEPT, EXAM_SOURCE, EXAM_TERM } from "@/lib/exam-meta";
import { downloadExamDatesheetPdf } from "@/lib/exam-pdf";

export const Route = createFileRoute("/exams")({
  head: () => ({
    meta: [
      { title: "Student exam profile — CampusEase" },
      {
        name: "description",
        content:
          "Search by student name or roll number to open an exam profile with papers, rooms, seats, courses, section, and weekly classes.",
      },
      { property: "og:title", content: "Student exam profile — CampusEase" },
      {
        property: "og:description",
        content:
          "Search a student by name or roll number to see papers, rooms, seats, courses, and weekly classes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExamsRoute,
});

const RECENTS_KEY = "campusease.exam.reg-recents";

// ─── Small shared helpers ──────────────────────────────────────────────────

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

function useStudentLookup(reg: string): PersonState {
  const [state, setState] = useState<PersonState>({
    student: null,
    status: "idle",
    error: null,
  });
  useEffect(() => {
    if (!reg) {
      setState({ student: null, status: "idle", error: null });
      return;
    }
    let alive = true;
    setState({ student: null, status: "loading", error: null });
    // The browser asks /api/lookup for ONE selected registration number; the
    // complete seating plan never crosses the network.
    lookupStudentRemote(reg)
      .then((r) => {
        if (!alive) return;
        if (r.kind === "found")
          setState({ student: r.student, status: "found", error: null });
        else if (r.kind === "invalid")
          setState({ student: null, status: "invalid", error: null });
        else setState({ student: null, status: "unknown", error: null });
      })
      .catch(
        (e) =>
          alive &&
          setState({
            student: null,
            status: "error",
            error:
              e instanceof Error
                ? e.message
                : "Lookup unavailable — try again in a moment.",
          }),
      );
    return () => {
      alive = false;
    };
  }, [reg]);
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

// ─── Person lookup state (drives the whole page) ──────────────────────────

type PersonState = {
  student: StudentRec | null;
  status:
    | "idle" // no reg entered yet
    | "loading"
    | "found"
    | "invalid"
    | "unknown"
    | "error";
  error: string | null;
};

function SearchPeople({
  busy,
  error,
  recents,
  onPick,
}: {
  busy: boolean;
  error: string | null;
  recents: Array<{ reg: string }>;
  onPick: (core: string) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<StudentSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < 2) {
      setItems([]);
      setSearching(false);
      setSearched(false);
      setSearchError("");
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError("");
      searchStudentSuggestionsRemote(query)
        .then((suggestions) => alive && setItems(suggestions))
        .catch((error: unknown) => {
          if (!alive) return;
          setItems([]);
          setSearchError(
            error instanceof Error ? error.message : "Search is unavailable.",
          );
        })
        .finally(() => {
          if (!alive) return;
          setSearching(false);
          setSearched(true);
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, open]);

  const pick = useCallback(
    (core: string) => {
      setQ("");
      setOpen(false);
      setItems([]);
      setHi(-1);
      onPick(core);
    },
    [onPick],
  );

  const core = normalizeReg(q);
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && items.length) {
      event.preventDefault();
      setHi((current) => (current + 1) % items.length);
    } else if (event.key === "ArrowUp" && items.length) {
      event.preventDefault();
      setHi((current) => (current <= 0 ? items.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = items[hi] ?? items[0];
      if (selected) pick(selected.core);
      else if (core && !busy) pick(core);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <SectionCard label="Find a student exam profile">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const selected = items[hi] ?? items[0];
          if (selected) pick(selected.core);
          else if (core && !busy) pick(core);
        }}
      >
        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background pl-3 pr-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(-1);
                setSearched(false);
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              placeholder="Roll number or student name"
              spellCheck={false}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              data-1p-ignore
              aria-label="Search students by roll number or name"
              aria-expanded={open && items.length > 0}
              aria-autocomplete="list"
              role="combobox"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm tracking-wide placeholder:tracking-normal placeholder:text-muted-foreground/70 focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setItems([]);
                  setHi(-1);
                  setSearched(false);
                  setOpen(true);
                }}
                aria-label="Clear search"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={(!core && items.length === 0) || busy}
              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Loading…" : "Open profile"}
            </button>
          </div>

          {open && items.length > 0 && (
            <div
              role="listbox"
              className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-auto rounded-lg border border-border bg-card shadow-lg sm:max-h-80"
            >
              {items.map((student, index) => (
                <button
                  key={student.core}
                  type="button"
                  role="option"
                  aria-selected={index === hi}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(student.core);
                  }}
                  onMouseEnter={() => setHi(index)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                    index === hi ? "bg-primary/10" : "hover:bg-muted/60"
                  } ${index > 0 ? "border-t border-border/60" : ""}`}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[11px] font-bold text-primary">
                    {student.name.slice(0, 1) || "·"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      {student.name || "Unnamed student"}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {student.core}
                    </span>
                  </span>
                  <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                </button>
              ))}
            </div>
          )}
        </div>
      </form>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          Search by roll number or name. Use ↑↓ and Enter to choose. Full roll
          format works too:{" "}
          <code className="rounded bg-muted px-1 font-mono text-[10px]">
            CIIT/FA25-BCS-065/ISB
          </code>{" "}
          {searching && <span className="ml-2">Searching…</span>}
          {items.length === 0 &&
            q.trim().length >= 2 &&
            searched &&
            !searching &&
            !searchError && <span className="ml-2">No matching students.</span>}
        </span>
        {(error || searchError) && (
          <span className="text-destructive">{error || searchError}</span>
        )}
      </div>

      {recents.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            recent:
          </span>
          {recents.map((r) => (
            <button
              key={r.reg}
              onClick={() => pick(normalizeReg(r.reg) ?? r.reg)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-[11px] transition hover:bg-muted"
            >
              {normalizeReg(r.reg)}
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Profile: identity card (GitHub-style: avatar · name · reg · meta) ────

function MetaItem({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border/80 bg-background/70 px-2 py-1 text-[12px] text-muted-foreground">
      <span className="text-foreground/50">{icon}</span>
      {children}
    </span>
  );
}

function ProfileHeader({
  student,
  papers,
  actions,
}: {
  student: StudentRec;
  papers: Paper[];
  actions: React.ReactNode;
}) {
  const meta = studentMeta(student);
  const dates = papers
    .map((p) => p.date)
    .filter(Boolean)
    .sort();
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const left = papers.filter((p) => daysUntil(p.date) >= 0).length;
  const nCourses = new Set(papers.map((p) => p.code)).size;
  const initials = student.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="overflow-hidden rounded-xl border-2 border-border border-l-4 border-l-primary/70 bg-card shadow-sm">
      {/* Identity · actions — side-by-side from sm up; actions become a
          tidy toolbar row under the name on phones (flex-wrap, so no item
          is ever clipped, whitespace-nowrap content included). */}
      <div className="px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center rounded-full bg-muted font-mono text-lg font-bold text-foreground ring-2 ring-primary/25 sm:size-16">
            {initials || <UserRound className="size-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold tracking-tight sm:text-xl">
              {student.name || "Unnamed student"}
            </div>
            <div className="mt-1 inline-flex max-w-full items-center rounded-md bg-muted/70 px-2 py-0.5 font-mono text-[11.5px] text-muted-foreground">
              <span className="truncate">{student.reg}</span>
            </div>
          </div>
        </div>
        {actions && (
          <div className="-mx-4 mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-border px-4 pt-3 print:hidden sm:mx-0 sm:mt-0 sm:max-w-[62%] sm:shrink-0 sm:flex-wrap-reverse sm:justify-end sm:border-0 sm:px-0 sm:pt-0">
            {actions}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t-2 border-border bg-muted/30 px-4 py-3 sm:px-5">
        {meta.prog && (
          <MetaItem icon={<GraduationCap className="size-3.5" />}>
            {meta.prog}
            {meta.sem ? ` · ${ordinalSem(meta.sem)} sem` : ""}
            {meta.sec ? ` · sec ${meta.sec}` : ""}
          </MetaItem>
        )}
        {meta.intake && (
          <MetaItem icon={<CalendarDays className="size-3.5" />}>
            {meta.intake} intake
          </MetaItem>
        )}
        <MetaItem icon={<BookOpen className="size-3.5" />}>
          {nCourses} courses · {papers.length} papers
          {left < papers.length ? ` · ${left} left` : ""}
        </MetaItem>
        {first && (
          <MetaItem icon={<CalendarRange className="size-3.5" />}>
            {dateView(first)} – {dateView(last)}
          </MetaItem>
        )}
        <MetaItem icon={<School className="size-3.5" />}>{EXAM_DEPT}</MetaItem>
      </div>
    </div>
  );
}

// ─── Datesheet (screen view) ───────────────────────────────────────────────

/** Compact seat chip copy: clash-room seats drop the time window that the
 *  Time column already shows; the full text stays in the hover title. */
function shortSeat(seat: string): string {
  const m = seat.match(/^CR-(\d+) (1st|2nd) /);
  if (m) return `CR-${m[1].padStart(2, "0")} · ${m[2]} sitting`;
  return seatView(seat);
}

/** One 24h "HH:MM" → "h:MM AM/PM" (the profile is 12-hour everywhere). */
function t12(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  let h = +m[1];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}

function shownSlot12(start: string, end: string): string {
  return `${t12(start)} – ${t12(end)}`;
}

function PaperRow({
  paper,
  detail,
  index,
  total,
}: {
  paper: Paper;
  detail?: CourseDetail;
  /** 1-based position of this paper within the whole term. */
  index: number;
  total: number;
}) {
  const clash = paperView.isClash(paper);
  const [start, end] = (paper.effectiveSlot ?? paper.slot).split("-");
  const clashNote = clash
    ? `Clash Room — the ${paper.clashSession} sitting · window ${shownSlot12(start, end)}`
    : "";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border px-3.5 py-3 sm:px-4 ${
        clash ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="eyebrow font-semibold">
          {paperView.code(paper)} · PAPER {index} OF {total}
        </div>
        {clash && (
          <span className="shrink-0 rounded-lg border border-amber-500/50 bg-amber-500/15 px-2 py-1 font-mono text-[10px] font-bold tracking-wide text-amber-700 dark:text-amber-300">
            CLASH
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[17px] font-semibold tracking-tight">
          {paper.title || paperView.code(paper)}
        </span>
        <span className="rounded-sm border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {paper.cls}
        </span>
      </div>
      {/* the time, stated plainly (12h) — the thing you photograph */}
      <div
        className="mt-2 flex items-baseline gap-2 font-mono tabular-nums"
        style={{ letterSpacing: "-1px" }}
      >
        <span className="text-[26px] font-bold leading-none sm:text-[30px]">
          {t12(start)}
        </span>
        <span className="text-[14px] font-medium tracking-normal text-muted-foreground">
          – {t12(end)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="tile px-3 py-2.5">
          <div className="eyebrow">Room</div>
          <div className="mt-0.5 font-mono text-[16px] font-bold tracking-tight">
            {paperView.room(paper)}
          </div>
        </div>
        <div className="tile px-3 py-2.5">
          <div className="eyebrow">Seat</div>
          <div
            title={seatView(paper.seat)}
            className="mt-0.5 truncate font-mono text-[16px] font-bold tracking-tight"
          >
            {shortSeat(paper.seat) || "—"}
          </div>
        </div>
      </div>
      <div
        className={`mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] ${
          clash
            ? "text-amber-700 dark:text-amber-300"
            : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        <span>
          ● Report by 10 minutes early{clashNote ? ` · ${clashNote}` : ""}
        </span>
        {detail?.instructors.length ? (
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-foreground/80">
            <UserRound className="size-3 shrink-0 text-primary" />
            <span className="truncate font-medium">
              {detail.instructors.join(" · ")}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Datesheet({
  papers,
  detailMap,
}: {
  papers: Paper[];
  detailMap: Map<string, CourseDetail>;
}) {
  const clashPapers = papers.filter((p) => paperView.isClash(p));

  return (
    <>
      {clashPapers.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-800 dark:text-amber-300 print:hidden">
          <strong>You have clashes this term</strong> — {clashPapers.length}{" "}
          paper{clashPapers.length === 1 ? "" : "s"} sit in the{" "}
          <strong>Clash Room</strong> in sequenced windows. Each row below shows
          the exact seat + window they sit in; arrive 10 minutes early.
        </div>
      )}

      <div className="space-y-4">
        {groupByDay(papers).map(([date, list]) => {
          const h = dayHeading(date);
          return (
            <div
              key={date}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/5 to-transparent px-4 py-2.5">
                <div>
                  <span className="text-[13.5px] font-bold tracking-tight">
                    {h.top}
                  </span>
                  <span className="ml-2 text-[11.5px] text-muted-foreground">
                    {h.sub}
                  </span>
                </div>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                  {h.countdown}
                </span>
              </div>
              <div className="space-y-2.5 px-3 py-3 sm:px-4">
                {list.map((p) => (
                  <PaperRow
                    key={`${p.date}|${p.slot}|${p.code}|${p.seat}`}
                    paper={p}
                    detail={detailMap.get(p.code)}
                    index={papers.indexOf(p) + 1}
                    total={papers.length}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Courses this student is examined in (with instructors) ────────────────

function CoursesCard({
  papers,
  detailMap,
}: {
  papers: Paper[];
  detailMap: Map<string, CourseDetail>;
}) {
  const courses = useMemo(() => {
    const map = new Map<string, Paper>();
    for (const p of sortPapers(papers)) {
      if (p.code && !map.has(p.code)) map.set(p.code, p);
    }
    return [...map.values()];
  }, [papers]);

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((p) => {
        const d = detailMap.get(p.code);
        return (
          <div
            key={p.code}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background px-3.5 py-3 shadow-xs transition-shadow hover:shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[11.5px] font-bold tracking-tight text-primary">
                {p.code}
              </span>
              <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
                {p.cls}
              </span>
            </div>
            <div className="text-[12.5px] font-semibold leading-snug">
              {p.title || "Untitled course"}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] leading-snug">
              <UserRound className="size-3 shrink-0 text-primary" />
              {d?.instructors.length ? (
                <span className="truncate font-medium text-foreground/80">
                  {d.instructors.join(" · ")}
                </span>
              ) : (
                <span className="truncate italic text-muted-foreground/70">
                  Instructor not on record
                </span>
              )}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border/60 pt-2 font-mono text-[10px] text-muted-foreground">
              <span>{dateView(p.date)}</span>
              <span aria-hidden>·</span>
              <span>{i12(p.effectiveSlot ?? p.slot)}</span>
              <span aria-hidden>·</span>
              <span>{paperView.room(p)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Print-only datesheet document ──────────────────────────────────────────────
// Mirrors the department's official datesheet layout (Date · Time · Course ·
// Title · Instructor · Class · Room · Seat — the same columns their XLSX
// uses). Rendered into the page but display:none on screen.

const P_INK = "#0f172a";
const P_SOFT = "#475569";
const P_LINE = "#cbd5e1";
const P_HEAD_BG = "#eef2f7";

function PrintSheet({
  student,
  papers,
  detailMap,
}: {
  student: StudentRec;
  papers: Paper[];
  detailMap: Map<string, CourseDetail>;
}) {
  const meta = studentMeta(student);
  const dates = papers
    .map((p) => p.date)
    .filter(Boolean)
    .sort();
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const clash = papers.filter((p) => paperView.isClash(p));
  const cells = {
    color: P_INK,
    padding: "5px 8px",
    verticalAlign: "top" as const,
    borderBottom: `1px solid ${P_LINE}`,
    fontSize: 11,
  };
  const label = {
    fontSize: 8.5,
    color: P_SOFT,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  };

  return (
    <div
      className="exam-print hidden print:block"
      style={{
        color: P_INK,
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
      }}
    >
      {/* masthead — same shape as the department's own sheet header */}
      <div
        style={{
          borderBottom: `3px double ${P_INK}`,
          paddingBottom: 10,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 3 }}>
          COMSATS UNIVERSITY ISLAMABAD
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 0.5,
            marginTop: 3,
          }}
        >
          MID TERM EXAMINATION — DATE SHEET
        </div>
        <div style={{ fontSize: 10.5, color: P_SOFT, marginTop: 3 }}>
          {EXAM_TERM} · personal copy
        </div>
      </div>

      {/* student strip — the entry-coupon block */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 12,
          border: `1.5px solid ${P_INK}`,
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                ...cells,
                width: "55%",
                border: `1px solid ${P_LINE}`,
                padding: "7px 10px",
              }}
            >
              <div style={label}>Student name</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>
                {student.name || "Unnamed student"}
              </div>
            </td>
            <td
              style={{
                ...cells,
                border: `1px solid ${P_LINE}`,
                padding: "7px 10px",
              }}
            >
              <div style={label}>Registration number</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 2,
                }}
              >
                {student.reg}
              </div>
            </td>
          </tr>
          <tr>
            <td
              style={{
                ...cells,
                border: `1px solid ${P_LINE}`,
                padding: "7px 10px",
              }}
            >
              <div style={label}>Program · semester · section</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>
                {[
                  meta.prog,
                  meta.sem ? `${ordinalSem(meta.sem)} semester` : "",
                  meta.sec ? `section ${meta.sec}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </div>
            </td>
            <td
              style={{
                ...cells,
                border: `1px solid ${P_LINE}`,
                padding: "7px 10px",
              }}
            >
              <div style={label}>Intake batch · exam window</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>
                {meta.intake || "—"}
                {first ? ` · ${dateView(first)} – ${dateView(last)}` : ""}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* schedule — official column order: Date · Time · Course · Title ·
          Instructor · Class · Room · Seat (times in 12h, seats humanized) */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 12,
          tableLayout: "fixed",
          borderTop: `2px solid ${P_INK}`,
          borderBottom: `2px solid ${P_INK}`,
        }}
      >
        <colgroup>
          <col style={{ width: "112px" }} />
          <col style={{ width: "104px" }} />
          <col style={{ width: "82px" }} />
          <col />
          <col style={{ width: "108px" }} />
          <col style={{ width: "64px" }} />
          <col style={{ width: "84px" }} />
          <col style={{ width: "132px" }} />
        </colgroup>
        <thead>
          <tr style={{ background: P_HEAD_BG }}>
            {[
              "Date",
              "Time",
              "Course",
              "Course title",
              "Instructor",
              "Class",
              "Room",
              "Seat",
            ].map((h) => (
              <th
                key={h}
                style={{
                  ...cells,
                  fontWeight: 700,
                  fontSize: 9.5,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  textAlign: "left",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {papers.map((p, i) => {
            const detail = detailMap.get(p.code);
            const clashRow = paperView.isClash(p);
            const dd = new Date(`${p.date}T00:00:00`);
            return (
              <tr key={`${p.date}|${p.slot}|${p.code}|${p.seat}`}>
                <td
                  style={{ ...cells, wordBreak: "break-word" }}
                >{`${dd.toLocaleDateString("en-GB", { weekday: "short" })} ${dd
                  .toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })
                  .replace(" ", "-")}-${dd.getFullYear()}`}</td>
                <td
                  style={{
                    ...cells,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i12(p.effectiveSlot ?? p.slot)}
                  {clashRow ? (
                    <div
                      style={{
                        fontSize: 8.5,
                        color: P_SOFT,
                        marginTop: 1,
                        whiteSpace: "normal",
                      }}
                    >
                      Clash · {p.clashSession} sitting
                    </div>
                  ) : null}
                </td>
                <td
                  style={{
                    ...cells,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {paperView.code(p)}
                </td>
                <td
                  style={{ ...cells, fontWeight: 600, wordBreak: "break-word" }}
                >
                  {p.title}
                </td>
                <td
                  style={{ ...cells, wordBreak: "break-word", color: P_SOFT }}
                >
                  {detail?.instructors.length ? (
                    detail.instructors.join(" · ")
                  ) : (
                    <span style={{ fontStyle: "italic" }}>—</span>
                  )}
                </td>
                <td style={{ ...cells }}>{p.cls}</td>
                <td style={{ ...cells, whiteSpace: "nowrap" }}>
                  {paperView.room(p)}
                </td>
                <td style={{ ...cells, wordBreak: "break-word" }}>
                  {seatView(p.seat)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* notes — reuses the department's own Clash-Room definition */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 6,
          fontSize: 9.5,
          color: P_SOFT,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: P_INK }}>Note:</strong> Clash Room = students
        with two papers at the same time sit both papers there one after the
        other; the seat column shows the exact seat and sitting window.
        {clash.length
          ? ` You have ${clash.length} such sitting${clash.length === 1 ? "" : "s"} this term — arrive 15 minutes early.`
          : ""}{" "}
        Source: the official {EXAM_DEPT} seating plan — {EXAM_SOURCE}. Generated
        by CampusEase; always verify against the posted hard copy.
      </div>
    </div>
  );
}

function regFromUrl(): string {
  try {
    const core = new URLSearchParams(window.location.search).get("reg");
    return core ? core.replace(/[^\w-]/gi, "").toUpperCase() : "";
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
  const person = useStudentLookup(reg);
  const [recents, remember] = useRecents();
  const [showSearch, setShowSearch] = useState(!reg);
  const lastLookedRef = useRef<string>("");
  const lastCountedRef = useRef<string>("");

  const bumpCounter = useCallback(() => {
    fetch("/api/counter", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    }).catch(() => {});
  }, []);

  // Deep-link ?reg=… → jump straight to the profile
  useEffect(() => {
    if (reg && person.status === "found" && lastLookedRef.current !== reg) {
      lastLookedRef.current = reg;
      remember(reg);
    }
  }, [reg, person.status, remember]);

  // A profile counts once after a successful lookup, including direct links.
  // The ref avoids counting again for effects that rerun after rendering.
  useEffect(() => {
    if (person.status !== "found") {
      lastCountedRef.current = "";
    } else if (reg && lastCountedRef.current !== reg) {
      lastCountedRef.current = reg;
      bumpCounter();
    }
  }, [reg, person.status, bumpCounter]);

  const setReg = useCallback((next: string) => {
    const core = normalizeReg(next) ?? "";
    setRegState(core);
    setRegInUrl(core);
    setShowSearch(core ? false : true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const loading = person.status === "loading";
  const student: StudentRec | null =
    person.status === "found" ? person.student : null;

  const papers = useMemo(
    () => (student ? sortPapers(student.papers.filter((p) => p.date)) : []),
    [student],
  );

  // Instructors per course from the official term timetable (loaded lazily)
  const [details, setDetails] = useState<CourseDetail[]>([]);
  useEffect(() => {
    let alive = true;
    if (student) {
      courseDetails(student.papers).then((d) => alive && setDetails(d));
    } else if (alive) {
      setDetails([]);
    }
    return () => {
      alive = false;
    };
  }, [student]);
  const detailMap = useMemo(
    () => new Map(details.map((d) => [d.code, d])),
    [details],
  );

  const actions = student && (
    <>
      <button
        onClick={() => {
          downloadIcs(student.papers, {
            reg: student.reg,
            name: student.name,
            term: EXAM_TERM,
          });
          toast.success("Calendar file downloaded — open it to subscribe");
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-medium transition hover:bg-muted"
      >
        <CalendarDays className="size-3.5" /> Add to calendar (.ics)
      </button>
      <button
        onClick={() => {
          if (navigator.share) {
            navigator
              .share({ title: "My exam profile", url: location.href })
              .catch(() => {});
          } else {
            navigator.clipboard?.writeText(location.href);
            toast.success("Link copied — share it with your classmates");
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-medium transition hover:bg-muted"
      >
        <Share2 className="size-3.5" /> Share link
      </button>
      <button
        onClick={() =>
          downloadExamDatesheetPdf({ student, papers, detailMap }).catch(() =>
            toast.error("Couldn't build the PDF — try Print instead."),
          )
        }
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition hover:opacity-90"
      >
        <Download className="size-3.5" /> Datesheet PDF
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-medium transition hover:bg-muted"
      >
        <Printer className="size-3.5" /> Print / Save PDF
      </button>
      <button
        onClick={() => {
          setShowSearch(true);
          if (typeof window !== "undefined")
            requestAnimationFrame(() =>
              document
                .getElementById("exam-search")
                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
            );
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-medium transition hover:bg-muted"
      >
        <ScanSearch className="size-3.5" /> Find another student
      </button>
      <button
        onClick={() => {
          setReg("");
          toast("Cleared — enter another roll number");
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-medium transition hover:bg-muted"
      >
        <RotateCcw className="size-3.5" /> Clear
      </button>
    </>
  );

  return (
    <div className="exam-page min-h-screen bg-[var(--background)] text-foreground">
      <div className="print:hidden">
        <AppNav />
      </div>
      <main
        id="main-content"
        className="exam-page__main mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"
      >
        <div className="print:hidden">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Exam datesheet" }]}
          />
        </div>

        {!student && (
          <header className="mb-6">
            <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[32px]">
              Student exam profiles
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {EXAM_DEPT} · {EXAM_TERM}. Search by student name or roll number
              to open an exam profile with papers, rooms, seats, course details,
              and weekly classes.
            </p>
          </header>
        )}

        <div className="space-y-4">
          {/* Search / switcher — collapsed to a compact bar once a profile is open */}
          <div id="exam-search" className="print:hidden">
            {student ? (
              showSearch && (
                <div className="space-y-2">
                  <SearchPeople
                    busy={loading}
                    error={person.status === "error" ? person.error : null}
                    recents={recents}
                    onPick={setReg}
                  />
                  <button
                    onClick={() => setShowSearch(false)}
                    className="mx-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className="size-3.5 rotate-180" /> Hide search
                  </button>
                </div>
              )
            ) : (
              <SearchPeople
                busy={loading}
                error={person.status === "error" ? person.error : null}
                recents={recents}
                onPick={setReg}
              />
            )}
          </div>

          {!student && !reg && (
            <SectionCard label="Your profile, at a glance" className="mt-5">
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Search by name or roll number to see a student's exams by day,
                with assigned rooms and seats. Profiles are ready to print or
                save.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    icon: <CalendarDays className="size-4" />,
                    title: "Every exam, by day",
                    detail: "Dates, paper titles, and start times in order.",
                  },
                  {
                    icon: <School className="size-4" />,
                    title: "Your room and seat",
                    detail: "Assignments shown from the official seating plan.",
                  },
                  {
                    icon: <BookOpen className="size-4" />,
                    title: "One clear study view",
                    detail: "Course details, clash notes, and print options.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-border bg-background/70 p-4"
                  >
                    <div className="flex items-center gap-2 text-primary">
                      {item.icon}
                      <h2 className="text-sm font-semibold text-foreground">
                        {item.title}
                      </h2>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {student && (
            <>
              <ProfileHeader
                student={student}
                papers={papers}
                actions={actions}
              />

              <SectionCard label="Exam datesheet">
                <div className="space-y-2.5">
                  <Datesheet papers={papers} detailMap={detailMap} />
                  <p className="text-center text-[10.5px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                    {EXAM_TERM} · from the official seating plan
                  </p>
                </div>
              </SectionCard>

              <SectionCard
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen className="size-3" />
                    Courses on this term (
                    {new Set(papers.map((p) => p.code)).size})
                  </span>
                }
              >
                <CoursesCard papers={papers} detailMap={detailMap} />
              </SectionCard>

              <SectionCard label="Weekly class timetable">
                <div className="space-y-2">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    The weekly schedule lives in the timetable builder now — it
                    loads your exact course combination straight from this roll
                    number, resolved per course (not per section), so improved
                    or dropped courses are respected.
                  </p>
                  <a
                    href={`/classes?reg=${normalizeReg(student.core)}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    <CalendarRange className="size-3.5" /> Open my weekly
                    timetable
                  </a>
                </div>
              </SectionCard>
            </>
          )}

          {person.status === "unknown" && reg && (
            <SectionCard label="No seat found">
              <div className="space-y-3 text-sm">
                <p>
                  <span className="font-mono">{reg}</span> has no seat in the{" "}
                  {EXAM_DEPT} seating plan. Check the number (batch, program,
                  and 3-digit roll) and try again.
                </p>
              </div>
            </SectionCard>
          )}

          {person.status === "invalid" && reg && (
            <SectionCard label="That doesn't look like a registration number">
              <p className="text-sm text-muted-foreground">
                Try the format <code className="font-mono">FA25-BCS-065</code> —
                batch, program, then the 3-digit roll number.
              </p>
            </SectionCard>
          )}
        </div>

        <footer className="mt-7 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground print:hidden">
          <Download className="mb-0.5 inline size-3" /> Seats, rooms, and times
          come from the official <strong>{EXAM_DEPT}</strong> seating plan —{" "}
          {EXAM_SOURCE}. A paper sits where the department seated it; clash-room
          windows are sequential sittings of the same official slot. Always
          double-check against the posted hard copy.
        </footer>
      </main>

      {/* Print document — the only thing the printer sees */}
      {student && (
        <PrintSheet student={student} papers={papers} detailMap={detailMap} />
      )}
    </div>
  );
}

export default ExamsRoute;
