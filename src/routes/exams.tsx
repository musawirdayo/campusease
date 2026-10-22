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
  loadExamDataset,
  lookupStudent,
  normalizeReg,
  ordinalSem,
  paperView,
  papersToIcs,
  regIndex,
  searchSuggestions,
  seatView,
  sortPapers,
  studentMeta,
  daysUntil,
  type ExamDataset,
  type Paper,
  type StudentRec,
  type CourseDetail,
} from "@/lib/exam-data";
import { EXAM_DEPT, EXAM_SOURCE, EXAM_TERM } from "@/lib/exam-meta";

export const Route = createFileRoute("/exams")({
  head: () => ({
    meta: [
      { title: "Student exam profile — CampusEase" },
      {
        name: "description",
        content:
          "Search a roll number or name and open the full student profile — exam datesheet with rooms and seats, courses, section, and weekly timetable, straight from the official seating plan.",
      },
      { property: "og:title", content: "Student exam profile — CampusEase" },
      {
        property: "og:description",
        content:
          "One search away from a student's full exam profile: papers, rooms, seats, courses, and weekly classes.",
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

// ─── Student search: type any roll-number prefix or name tokens ────────────

function SearchPeople({
  ds,
  error,
  recents,
  onPick,
}: {
  ds: ExamDataset | null;
  error: string | null;
  recents: Array<{ reg: string }>;
  onPick: (core: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);

  const suggestions = useMemo(
    () => (ds && q.trim().length >= 2 ? searchSuggestions(ds, q, 8) : []),
    [ds, q],
  );
  const exactCore = useMemo(() => {
    const core = normalizeReg(q);
    if (!core || !ds) return null;
    return regIndex(ds).has(core) ? core : null;
  }, [ds, q]);

  const pick = useCallback(
    (core: string) => {
      setOpen(false);
      setQ("");
      setHi(-1);
      onPick(core);
    },
    [onPick],
  );

  const items = suggestions;
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) {
      if (e.key === "Enter" && exactCore) {
        e.preventDefault();
        pick(exactCore);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHi((h) => (h + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => (h <= 0 ? items.length - 1 : h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hi >= 0 && items[hi]) pick(items[hi].core);
      else if (exactCore) pick(exactCore);
      else if (items[0]) pick(items[0].core);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <SectionCard label="Find a student">
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setHi(-1);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="Roll number (FA25-BCS-065) or name (Ayesha…)"
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            data-1p-ignore
            aria-label="Search students by roll number or name"
            aria-expanded={open && items.length > 0}
            aria-autocomplete="list"
            role="combobox"
            className="h-12 min-w-0 flex-1 bg-transparent font-mono text-base tracking-wide placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/70 focus:outline-none"
            style={{ textTransform: "uppercase" }}
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                setHi(-1);
              }}
              aria-label="Clear search"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {open && items.length > 0 && (
          <div
            role="listbox"
            className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-auto rounded-lg border border-border bg-card shadow-lg sm:max-h-80"
          >
            {items.map((s, i) => (
              <button
                key={s.core}
                role="option"
                aria-selected={i === hi}
                onMouseDown={(e) => {
                  e.preventDefault(); // beat input blur
                  pick(s.core);
                }}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                  i === hi ? "bg-primary/10" : "hover:bg-muted/60"
                } ${i > 0 ? "border-t border-border/60" : ""}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[11px] font-bold text-primary">
                  {s.name.slice(0, 1) || "·"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">
                    {s.name || "Unnamed student"}
                  </span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {s.core}
                  </span>
                </span>
                <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/50" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          Matches roll numbers <em className="font-mono not-italic">and</em>{" "}
          names — ↑↓ to navigate, Enter to open.{" "}
          <code className="rounded bg-muted px-1 font-mono text-[10px]">
            CIIT/FA25-BCS-065/ISB
          </code>{" "}
          works too.
        </span>
        {error && <span className="text-destructive">{error}</span>}
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
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted-foreground">
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
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-4 px-4 py-5 sm:px-5">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-muted font-mono text-lg font-bold text-foreground ring-2 ring-primary/25">
          {initials || <UserRound className="size-6 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-bold tracking-tight">
            {student.name || "Unnamed student"}
          </div>
          <div className="mt-0.5 font-mono text-[12px] text-muted-foreground">
            {student.reg}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {actions}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
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

function PaperRow({ paper, detail }: { paper: Paper; detail?: CourseDetail }) {
  const clash = paperView.isClash(paper);
  const [start, end] = (paper.effectiveSlot ?? paper.slot).split("-");
  const shownSlot = `${start}–${end}`;

  return (
    <div
      className={`group flex gap-3.5 px-4 py-3 transition-colors ${
        clash ? "bg-amber-500/5" : "hover:bg-muted/30"
      }`}
      style={{
        boxShadow: `inset 3px 0 0 ${
          clash ? "var(--color-amber-500, #f59e0b)" : "transparent"
        }`,
      }}
    >
      <div className="w-[112px] shrink-0 pt-0.5 tabular-nums">
        <div className="font-mono text-[12.5px] font-bold leading-tight text-foreground">
          {i12(shownSlot)}
        </div>
        {clash && (
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            window {paper.clashSession}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-[11.5px] font-bold tracking-tight text-primary">
            {paperView.code(paper)}
          </span>
          <span className="text-[13px] font-semibold leading-snug">
            {paper.title}
          </span>
          <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
            {paper.cls}
          </span>
          {clash && (
            <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
              clash room
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-baseline gap-1 rounded-md bg-muted/70 px-2 py-1 font-mono text-[11px]">
            <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
              room
            </span>
            <span className="font-bold">{paperView.room(paper)}</span>
          </span>
          <span className="inline-flex items-baseline gap-1 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary">
            <span className="text-[9.5px] uppercase tracking-wider opacity-75">
              seat
            </span>
            <span className="font-bold">{seatView(paper.seat)}</span>
          </span>
          {detail?.instructors.length ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-[11px] text-foreground/80">
              <UserRound className="size-3 shrink-0 text-primary" />
              <span className="truncate font-medium">
                {detail.instructors.join(" · ")}
              </span>
            </span>
          ) : null}
        </div>
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
  const clashPapers = papers.filter((p) => paperView.isClash(p));

  return (
    <>
      {nextP && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-[12.5px] print:hidden">
          <Sparkles className="size-4 text-primary" />
          <span>
            Next paper <strong>{paperView.code(nextP)}</strong> — {nextP.title}
          </span>
          <CornerDownRight className="size-3 text-muted-foreground" />
          <span className="font-mono text-[11px] text-muted-foreground">
            {dayHeading(nextP.date).sub} ·{" "}
            {i12(nextP.effectiveSlot ?? nextP.slot)} · {paperView.room(nextP)} ·{" "}
            {seatView(nextP.seat)}
          </span>
        </div>
      )}

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
              <div className="divide-y divide-border">
                {list.map((p) => (
                  <PaperRow
                    key={`${p.date}|${p.slot}|${p.code}|${p.seat}`}
                    paper={p}
                    detail={detailMap.get(p.code)}
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

// ─── Print-only datesheet document ────────────────────────────────────────
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
                borderBottom: `1px solid ${P_LINE}`,
                borderRight: `1px solid ${P_LINE}`,
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
                borderBottom: `1px solid ${P_LINE}`,
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
                borderRight: `1px solid ${P_LINE}`,
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
            <td style={{ ...cells, padding: "7px 10px" }}>
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
  const { ds, loading, error } = useDataset();
  const [recents, remember] = useRecents();
  const [showSearch, setShowSearch] = useState(!reg);
  const lastLookedRef = useRef<string>("");

  // Deep-link ?reg=… → jump straight to the profile
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
    const core = normalizeReg(next) ?? "";
    setRegState(core);
    setRegInUrl(core);
    setShowSearch(core ? false : true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const student: StudentRec | null =
    lookup?.kind === "found" ? lookup.student : null;

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

  const actions = student && ds && (
    <>
      <button
        onClick={() => {
          downloadIcs(student.papers, {
            reg: student.reg,
            name: student.name,
            term: ds.term,
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
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-medium transition hover:bg-muted"
      >
        <Printer className="size-3.5" /> Print datesheet
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
    <div className="min-h-screen bg-[var(--background)] text-foreground">
      <div className="print:hidden">
        <AppNav />
      </div>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="print:hidden">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Exam datesheet" }]}
          />
        </div>

        {!student && (
          <header className="mb-6">
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Student exam profiles
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {EXAM_DEPT} · {EXAM_TERM}. Search a roll number or a name — pick
              someone from the list to open their full exam profile: papers with
              rooms and seats, courses, section, and weekly classes.
            </p>
          </header>
        )}

        <div className="space-y-4">
          {/* Search / switcher — collapsed to a compact bar once a profile is open */}
          <div id="exam-search" className="print:hidden">
            {student ? (
              showSearch && (
                <div className="space-y-2">
                  {ds ? (
                    <SearchPeople
                      ds={ds}
                      error={error}
                      recents={recents}
                      onPick={setReg}
                    />
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {loading
                        ? "Loading the seating plan…"
                        : error || "Dataset unavailable"}
                    </div>
                  )}
                  <button
                    onClick={() => setShowSearch(false)}
                    className="mx-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className="size-3.5 rotate-180" /> Hide search
                  </button>
                </div>
              )
            ) : ds ? (
              <SearchPeople
                ds={ds}
                error={error}
                recents={recents}
                onPick={setReg}
              />
            ) : (
              <SectionCard label="Find a student">
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {loading ? (
                    <>
                      <div className="mx-auto size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                      <p className="mt-3">Loading the seating plan…</p>
                    </>
                  ) : (
                    error || "Dataset unavailable"
                  )}
                </div>
              </SectionCard>
            )}
          </div>

          {student && (
            <>
              <ProfileHeader
                student={student}
                papers={papers}
                actions={actions}
              />

              <SectionCard label="Exam datesheet">
                <div className="space-y-3">
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
                    <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      close matches — click one:
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {lookup.near.map((s) => (
                        <button
                          key={s.reg}
                          onClick={() => setReg(s.core)}
                          className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[11px] text-primary transition hover:bg-primary/20"
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
                batch, program, then the 3-digit roll number.
              </p>
            </SectionCard>
          )}
        </div>

        <footer className="mt-10 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground print:hidden">
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
