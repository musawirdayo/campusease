import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  Field,
  GhostButton,
  PrimaryButton,
  SectionCard,
  SectionLabel,
  Segmented,
  Select,
  TextInput,
} from "@/components/form-bits";
import { useSaved } from "@/lib/student-schedules";
import { WeekGrid } from "@/components/WeekGrid";
import {
  coursesWeek,
  lookupStudentRemote,
  normalizeReg,
  type StudentRec,
} from "@/lib/exam-data";
import {
  usePublishedTimetables,
  timetableRowsToSessions,
} from "@/lib/published";
import { extractPdfPages } from "@/lib/pdf-layout";
import type { ClassSession } from "@/lib/types";
import { CS_CLASSES, CS_SESSIONS, CS_TT_VERSION } from "@/lib/cs-timetable";
import {
  DAYS,
  DAY_FULL,
  fmt12,
  toMin,
  findClashes,
  candidateClashes,
  uid,
  suggestFixes,
  autoResolve,
  dedupeSessions,
  dayStats,
  type Picked,
} from "@/lib/timetable";
import { toast } from "sonner";
import { downloadTimetablePdf } from "@/lib/timetable-pdf";

export const Route = createFileRoute("/classes")({
  head: () => ({
    meta: [
      { title: "Class Timetable Builder — CampusEase" },
      {
        name: "description",
        content:
          "Pick your courses one by one and get a personal weekly class timetable with clash warnings.",
      },
      { property: "og:title", content: "Class Timetable Builder — CampusEase" },
      {
        property: "og:description",
        content:
          "Pick your courses one by one and get a personal weekly class timetable with clash warnings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClassesPage,
});

type Offering = { key: string; cls: string; code: string; title: string };

// Everything the student builds is stored server-side (one device row) and
// fetched fresh every session — never in localStorage.
type Bundle = {
  picks: Picked[];
  custom: { name: string; sessions: ClassSession[] } | null;
  src: "cs" | "custom" | "published";
  publishedId: string;
  view: "grid" | "list";
};
const EMPTY_BUNDLE: Bundle = {
  picks: [],
  custom: null,
  src: "cs",
  publishedId: "",
  view: "grid",
};

function ClassesPage() {
  const [picks, setPicks] = useState<Picked[]>([]);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<{
    off: Offering;
    msgs: string[];
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [src, setSrc] = useState<"cs" | "custom" | "published">("cs");
  const [publishedId, setPublishedId] = useState("");
  const [custom, setCustom] = useState<{
    name: string;
    sessions: ClassSession[];
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [generated, setGenerated] = useState<number | null>(null);
  const deepSectionRef = useRef(false);
  const deepPubRef = useRef(false);
  const deepRegRef = useRef(false);
  // Roll-number quick start: input + status of the last attempt
  const [regInput, setRegInput] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regMsg, setRegMsg] = useState<string | null>(null); // null = ok, string = error
  const {
    data: bundle,
    setData: setBundle,
    ready: storeReady,
  } = useSaved<Bundle>("classes", EMPTY_BUNDLE);
  const { data: publishedDocs = [] } = usePublishedTimetables();
  const publishedDoc = publishedDocs.find((d) => d.id === publishedId) ?? null;
  const publishedSessions = useMemo(
    () =>
      timetableRowsToSessions(
        (publishedDoc?.data ?? []) as Record<string, unknown>[],
      ),
    [publishedDoc],
  );
  const SESS = useMemo(
    () =>
      src === "custom"
        ? (custom?.sessions ?? [])
        : src === "published"
          ? publishedSessions
          : CS_SESSIONS,
    [src, custom, publishedSessions],
  );
  const bumpCounter = useCallback(() => {
    fetch("/api/counter", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { count?: number } | null) => {
        const count = j?.count;
        if (typeof count === "number")
          setGenerated((current) =>
            current === null ? count : Math.max(current, count),
          );
      })
      .catch(() => {});
  }, []);
  const CLASSES = useMemo<{ id: string; label: string }[]>(() => {
    if (src === "published")
      return [...new Set(publishedSessions.map((s) => s.cls))]
        .sort()
        .map((id) => ({ id, label: id }));
    if (src === "custom" && custom)
      return [...new Set(custom.sessions.map((s) => s.cls))]
        .sort()
        .map((id) => ({ id, label: id }));
    if (src === "custom") return [];
    return CS_CLASSES;
  }, [src, custom, publishedSessions]);

  // hydrate once from the server copy
  useEffect(() => {
    if (!storeReady) return;
    setPicks(Array.isArray(bundle.picks) ? bundle.picks : []);
    setCustom(
      bundle.custom && Array.isArray(bundle.custom.sessions)
        ? bundle.custom
        : null,
    );
    setSrc(bundle.src === "custom" && !bundle.custom ? "cs" : bundle.src);
    setPublishedId(bundle.publishedId ?? "");
    setView(bundle.view === "list" ? "list" : "grid");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeReady]);

  // One-click deep link: /classes?section=X loads a whole CS section's week.
  // Built directly off CS_SESSIONS so it's independent of the restored source.
  useEffect(() => {
    if (!storeReady || deepSectionRef.current) return;
    const deepSection = new URLSearchParams(window.location.search)
      .get("section")
      ?.trim();
    if (!deepSection) return;
    deepSectionRef.current = true;
    const builtIn = new Map<string, Offering>();
    for (const s of CS_SESSIONS) {
      const key = `${s.cls}|${s.code}`;
      if (!builtIn.has(key))
        builtIn.set(key, {
          key,
          cls: s.cls,
          code: s.code,
          title: s.title,
        });
    }
    const target = [...builtIn.values()].filter((o) => o.cls === deepSection);
    if (!target.length) return;
    const list = target.map((o) => ({
      id: uid(),
      cls: o.cls,
      code: o.code,
      title: o.title,
      sessions: dedupeSessions(
        CS_SESSIONS.filter((s) => s.cls === o.cls && s.code === o.code).map(
          (s) => ({ ...s, sid: uid() }),
        ),
      ),
    }));
    const n = list.reduce((sum, p) => sum + p.sessions.length, 0);
    setSrc("cs");
    setCustom(null);
    setPublishedId("");
    setPicks(list);
    if (list.length) bumpCounter();
    toast.success(`${deepSection} timetable loaded`, {
      description: `${target.length} courses · ${n} sessions`,
    });
    // scroll to the result card (its grid populates right after)
    const t = setTimeout(() => {
      document
        .getElementById("timetable-card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(t);
  }, [storeReady, bumpCounter]);

  // One-click deep link: /classes?published=ID opens a published timetable.
  useEffect(() => {
    if (deepPubRef.current) return;
    const deepPublished = new URLSearchParams(window.location.search)
      .get("published")
      ?.trim();
    if (!deepPublished || !publishedDocs.some((d) => d.id === deepPublished))
      return;
    deepPubRef.current = true;
    setPublishedId(deepPublished);
    setSrc("published");
    setPicks([]);
  }, [publishedDocs]);

  // keep server copy in sync (debounced by the hook)
  const syncRef = useRef(false);
  useEffect(() => {
    if (!storeReady) return;
    if (syncRef.current) {
      setBundle({ picks, custom, src, publishedId, view });
    } else {
      // skip the very first reactive pass (restored values are already stored)
      syncRef.current = true;
    }
  }, [picks, custom, src, publishedId, view, storeReady, setBundle]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
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
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const loadByReg = useCallback(
    async (input: string) => {
      setRegMsg(null);
      const core = normalizeReg(input);
      if (!core) {
        setRegMsg(
          "That doesn't look like a roll number — try FA25-BCS-065 (batch, program, 3-digit roll).",
        );
        return;
      }
      setRegBusy(true);
      try {
        // Exact-roll lookup served by /api/lookup — the browser never receives
        // the whole seating plan.
        const lookup = await lookupStudentRemote(core);
        if (lookup.kind !== "found") {
          setRegMsg(
            lookup.kind === "invalid"
              ? "That doesn't look like a roll number — try FA25-BCS-065."
              : "No seat found for that roll number in this seating plan — check the batch, program and roll.",
          );
          return;
        }
        const student: StudentRec = lookup.student;
        const { picks: built, missing } = await coursesWeek(student.papers);
        setPicks(built);
        setSrc("cs");
        setCustom(null);
        setPublishedId("");
        const n = built.reduce((sum, p) => sum + p.sessions.length, 0);
        if (built.length === 0) {
          setRegMsg(
            `${student.name} (${student.core}) has ${missing.length} course(s) this term, but none of them run in the published weekly timetable yet.`,
          );
          return;
        }
        // A weekly timetable was actually generated, even if it is only viewed.
        bumpCounter();
        toast.success(`${student.core} — ${built.length} courses loaded`, {
          description: `${n} sessions${missing.length ? ` · ${missing.length} course(s) not in this term's timetable: ${missing.map((m) => m.code).join(", ")}` : ""}`,
        });
        setRegInput("");
        document
          .getElementById("timetable-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        setRegMsg(
          e instanceof Error
            ? e.message
            : "Could not reach the seating plan — try again in a moment.",
        );
      } finally {
        setRegBusy(false);
      }
    },
    [bumpCounter],
  );

  // One-click deep link: /classes?reg=FA25-BCS-065 loads that student's own
  // course combination (per course — never a section roster).
  useEffect(() => {
    if (deepRegRef.current) return;
    const deepReg = new URLSearchParams(window.location.search)
      .get("reg")
      ?.trim();
    if (!deepReg) return;
    deepRegRef.current = true;
    void loadByReg(deepReg);
  }, [loadByReg]);

  async function upload(f: File) {
    setErr("");
    setBusy("Reading PDF…");
    try {
      const pages = await extractPdfPages(f);
      let done = 0;
      const out: ClassSession[] = [];
      const run = async (t: string) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const r = await fetch("/api/parse-timetable", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: t }),
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok) {
            out.push(...(j.sessions ?? []));
            break;
          }
          if (attempt === 1 || r.status === 402)
            throw new Error(j.error || `HTTP ${r.status}`);
        }
        done++;
        setBusy(`Reading pages… ${done}/${pages.length}`);
      };
      setBusy(`Reading pages… 0/${pages.length}`);
      const q = [...pages];
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (q.length) await run(q.shift()!);
        }),
      );
      const seen = new Set<string>();
      const uniq = out.filter((s) => {
        const k = `${s.cls}|${s.code}|${s.day}|${s.start}|${s.end}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (!uniq.length)
        throw new Error(
          "No class sessions found. The PDF may be a scanned image.",
        );
      const d = { name: f.name.replace(/\.pdf$/i, ""), sessions: uniq };
      setCustom(d);
      setSrc("custom");
      setPicks([]);
      toast.success(`${uniq.length} sessions parsed from ${d.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
    setBusy("");
  }

  useEffect(() => {
    // picks + source + view all persist server-side via the bundle effect
  }, []);

  const offerings = useMemo<Offering[]>(() => {
    const m = new Map<string, Offering>();
    for (const s of SESS) {
      const key = `${s.cls}|${s.code}`;
      if (!m.has(key))
        m.set(key, { key, cls: s.cls, code: s.code, title: s.title });
    }
    return [...m.values()].sort(
      (a, b) => a.code.localeCompare(b.code) || a.cls.localeCompare(b.cls),
    );
  }, [SESS]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return offerings
      .filter((o) => `${o.code} ${o.title} ${o.cls}`.toLowerCase().includes(t))
      .slice(0, 60);
  }, [q, offerings]);

  const sessionsOf = useCallback(
    (o: Offering) => SESS.filter((s) => s.cls === o.cls && s.code === o.code),
    [SESS],
  );

  function doAdd(o: Offering) {
    if (picks.length === 0) bumpCounter();
    setPicks((p) => [
      ...p,
      {
        id: uid(),
        cls: o.cls,
        code: o.code,
        title: o.title,
        sessions: dedupeSessions(
          sessionsOf(o).map((s) => ({ ...s, sid: uid() })),
        ),
      },
    ]);
    toast.success(`${o.code} added`, { description: `${o.title} · ${o.cls}` });
    setPending(null);
  }
  function tryAdd(o: Offering) {
    const msgs: string[] = [];
    const dup = picks.find((p) => p.code === o.code);
    if (dup) msgs.push(`You already have ${o.code} from ${dup.cls}.`);
    for (const c of candidateClashes(sessionsOf(o), picks))
      msgs.push(
        `${c.cand.day} ${fmt12(c.cand.start)}–${fmt12(c.cand.end)} clashes with ${c.with.code} (${c.with.cls})`,
      );
    if (msgs.length) setPending({ off: o, msgs });
    else doAdd(o);
  }
  function loadSection(id: string) {
    const offs = offerings.filter((o) => o.cls === id);
    const loaded = offs.map((o) => ({
      id: uid(),
      cls: o.cls,
      code: o.code,
      title: o.title,
      sessions: dedupeSessions(
        sessionsOf(o).map((s) => ({ ...s, sid: uid() })),
      ),
    }));
    setPicks(loaded);
    // Count the completed schedule as soon as the section is loaded.
    if (loaded.length) bumpCounter();
    const n = loaded.reduce((sum, p) => sum + p.sessions.length, 0);
    toast.success(`Loaded ${id}`, {
      description: `${offs.length} courses · ${n} sessions`,
    });
  }
  function switchSection(pickId: string, cls: string) {
    const p = picks.find((x) => x.id === pickId)!;
    const o = offerings.find((x) => x.cls === cls && x.code === p.code)!;
    setPicks((ps) =>
      ps.map((x) =>
        x.id === pickId
          ? {
              ...x,
              cls,
              title: o.title,
              sessions: dedupeSessions(
                sessionsOf(o).map((s) => ({ ...s, sid: uid() })),
              ),
            }
          : x,
      ),
    );
  }
  function editSession(
    pickId: string,
    sid: string,
    patch: Partial<Picked["sessions"][number]>,
  ) {
    setPicks((ps) =>
      ps.map((p) =>
        p.id !== pickId
          ? p
          : {
              ...p,
              sessions: p.sessions.map((s) =>
                s.sid === sid ? { ...s, ...patch, edited: true } : s,
              ),
            },
      ),
    );
  }

  const clashes = useMemo(() => findClashes(picks), [picks]);
  const clashSids = new Set(clashes.flatMap((c) => [c.a.sid, c.b.sid]));
  const stats = useMemo(() => dayStats(picks), [picks]);
  const ttLabel = `${src === "cs" ? `Computer Science · ${CS_TT_VERSION}` : src === "published" ? `${publishedDoc?.departments?.name ?? "Department"} · ${publishedDoc?.title ?? ""}` : (custom?.name ?? "My department")} · ${picks.length} course${picks.length === 1 ? "" : "s"}${clashes.length ? ` · ${clashes.length} clash${clashes.length === 1 ? "" : "es"}` : ""}`;
  const alts = useCallback(
    (code: string) =>
      offerings
        .filter((o) => o.code === code)
        .map((o) => ({ cls: o.cls, sessions: sessionsOf(o) })),
    [offerings, sessionsOf],
  );
  const fixes = useMemo(
    () => (clashes.length ? suggestFixes(picks, alts).slice(0, 5) : []),
    [picks, alts, clashes.length],
  );
  function fixAll() {
    const next = autoResolve(picks, alts);
    const left = findClashes(next).length;
    setPicks(next);
    if (left) {
      toast.warning(`${left} clash(es) can't be fixed by changing sections`);
    } else {
      toast.success("All clashes resolved");
    }
  }

  return (
    <div className="class-page min-h-screen bg-background text-foreground">
      <AppNav />
      <main
        id="main-content"
        className="class-page__main mx-auto max-w-[1440px] px-4 py-7 sm:px-6 sm:py-8"
      >
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Class timetable" }]}
        />
        <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[32px]">
          Build your class timetable
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {src === "cs"
            ? `CS department · ${CS_TT_VERSION}`
            : src === "published"
              ? `${publishedDoc?.departments?.name ?? ""} · ${publishedDoc?.title ?? ""}`
              : (custom?.name ?? "Upload your timetable")}
          . Add courses one by one — we warn you about clashes but never block
          you.
        </p>

        <div className="class-page__stats mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] print:hidden">
          {/* auto-fit so 3 or 4 tiles both fill the row evenly; personal
              stats lead, the sitewide counter sits last */}
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <div className="text-lg font-semibold">{picks.length}</div>
            <div className="mt-0.5 text-[11px] tracking-wide text-muted-foreground">
              Courses picked
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <div
              className={`text-lg font-semibold ${clashes.length ? "text-destructive" : ""}`}
            >
              {clashes.length}
            </div>
            <div className="mt-0.5 text-[11px] tracking-wide text-muted-foreground">
              Clash{clashes.length === 1 ? "" : "es"}
            </div>
          </div>
          {picks.length > 0 && stats.busiestDay && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="text-lg font-semibold">
                {stats.busiestCount} sessions
              </div>
              <div className="mt-0.5 text-[11px] tracking-wide text-muted-foreground">
                Busiest day · {DAY_FULL[stats.busiestDay].slice(0, 3)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 italic">
                {stats.freeDays.length
                  ? `Free: ${stats.freeDays.map((d) => DAY_FULL[d].slice(0, 3)).join(", ")}`
                  : "No free day this week"}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <div
              className="text-lg font-semibold"
              aria-live="polite"
              aria-atomic="true"
            >
              {generated === null ? "—" : generated.toLocaleString()}
            </div>
            <div className="mt-0.5 text-[11px] tracking-wide text-muted-foreground">
              Schedules generated
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Counts every generated schedule
            </div>
          </div>
        </div>

        <nav
          aria-label="Scheduler sections"
          className="class-page__jump sticky top-14 z-30 -mx-4 flex gap-2 overflow-x-auto border-b border-border/70 bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:hidden print:hidden"
        >
          {[
            ["class-setup", "Setup"],
            ["timetable-card", "Weekly schedule"],
            ["picked-courses", "Picked courses"],
          ].map(([target, label]) => (
            <a
              key={target}
              href={`#${target}`}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </a>
          ))}
        </nav>

        <div
          id="class-setup"
          className="class-page__setup scroll-mt-28 mt-6 space-y-4 print:hidden"
        >
          <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SectionCard label="Step 1 — Timetable source">
              <Segmented
                options={[
                  { id: "cs", label: "CS built-in" },
                  {
                    id: "published",
                    label: "Published",
                    disabled: publishedDocs.length === 0,
                  },
                  { id: "custom", label: "Your PDF" },
                ]}
                value={src}
                ariaLabel="Timetable source"
                onChange={(id) => {
                  setSrc(id);
                  setPicks([]);
                  setErr("");
                }}
              />
              {src === "published" && (
                <div className="mt-3 space-y-1.5">
                  {publishedDocs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setPublishedId(d.id);
                        setSrc("published");
                        setPicks([]);
                      }}
                      className={`w-full text-left rounded-md border px-3 py-2 text-xs transition ${publishedId === d.id ? "border-primary bg-primary/5 font-medium text-primary" : "border-input hover:bg-muted"}`}
                    >
                      <div className="font-medium">
                        {d.departments?.name ?? d.title}
                      </div>
                      <div className="text-muted-foreground">
                        {d.title} · {d.version}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {src === "custom" && (
                <div className="mt-3 text-xs space-y-2">
                  {custom && (
                    <div className="text-muted-foreground">
                      Loaded:{" "}
                      <span className="text-foreground font-medium">
                        {custom.name}
                      </span>{" "}
                      · {custom.sessions.length} sessions, {CLASSES.length}{" "}
                      sections
                    </div>
                  )}
                  <label className="mt-1 block cursor-pointer rounded-md border border-dashed border-input p-4 text-center hover:bg-muted">
                    {busy ||
                      (custom
                        ? "Upload a different timetable PDF"
                        : "Upload your department's timetable PDF")}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      disabled={!!busy}
                      onChange={(e) =>
                        e.target.files?.[0] && upload(e.target.files[0])
                      }
                    />
                  </label>
                  {err && <div className="text-destructive">{err}</div>}
                  <p className="text-muted-foreground">
                    Each page is read and checked row by row. Always compare
                    with the official copy.
                  </p>
                </div>
              )}
            </SectionCard>

            <SectionCard label="Step 2 — Quick start: load by roll number">
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!regBusy) void loadByReg(regInput);
                }}
              >
                <TextInput
                  value={regInput}
                  onChange={(e) => setRegInput(e.target.value)}
                  placeholder="FA25-BCS-065"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  disabled={regBusy}
                  className="font-mono uppercase"
                  style={{ textTransform: "uppercase" }}
                  aria-label="Roll number"
                />
                <PrimaryButton
                  type="submit"
                  disabled={regBusy || !regInput.trim()}
                  className="sm:w-auto shrink-0"
                >
                  {regBusy ? "Loading…" : "Load my courses"}
                </PrimaryButton>
              </form>
              {regBusy && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Fetching the seating plan…
                </p>
              )}
              {regMsg && (
                <p className="mt-2 text-xs text-destructive">{regMsg}</p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Loads this student's courses from the official seating plan.
                Step 3 loads everyone in the selected section.
              </p>
            </SectionCard>

            <SectionCard
              label="Step 3 — Load your whole section at once"
              className="md:col-span-2 xl:col-span-1"
            >
              <Select
                value=""
                onChange={(v) => v && loadSection(v)}
                ariaLabel="Load a timetable for a section"
              >
                <option value="">Select section…</option>
                {CLASSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </SectionCard>
          </div>

          <SectionCard label="Step 4 — Add individual courses">
            <TextInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search code, name or section…"
              aria-label="Search courses by code, name or section"
            />
            <div className="mt-3 grid max-h-96 grid-cols-1 items-stretch gap-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.length === 0 && (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {q.trim()
                    ? `Nothing matches “${q.trim()}” — check the spelling or try the section code.`
                    : "Search above to add a course (e.g. CSC141 or Calculus)…"}
                </div>
              )}
              {filtered.map((o) => {
                const n = candidateClashes(sessionsOf(o), picks).length;
                const added = picks.some(
                  (p) => p.code === o.code && p.cls === o.cls,
                );
                const daySummary = [
                  ...new Set(
                    sessionsOf(o).map(
                      (s) => `${DAY_FULL[s.day].slice(0, 3)} ${fmt12(s.start)}`,
                    ),
                  ),
                ]
                  .sort()
                  .join(" · ");
                return (
                  <div
                    key={o.key}
                    className={`flex min-h-20 items-start gap-2 rounded-lg border bg-card px-3 py-2.5 transition ${added ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/60"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="line-clamp-2 text-sm font-medium leading-snug"
                        title={`${o.code} · ${o.title}`}
                      >
                        {o.code} · {o.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {o.cls} · {daySummary}
                      </div>
                      {n > 0 && (
                        <div className="text-[11px] font-medium text-destructive mt-0.5">
                          ⚠ clashes with a picked course — you can still add it
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => tryAdd(o)}
                      disabled={added}
                      className={`shrink-0 rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                        added
                          ? "border border-border text-muted-foreground"
                          : n > 0
                            ? "bg-amber-500/90 text-white hover:bg-amber-600"
                            : "bg-primary text-primary-foreground hover:opacity-90"
                      }`}
                    >
                      {added ? "Added ✓" : "+ Add"}
                    </button>
                  </div>
                );
              })}
            </div>
            {pending && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <div className="font-medium text-destructive">Warning</div>
                <ul className="list-disc ml-4 text-xs mt-1">
                  {pending.msgs.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => doAdd(pending.off)}
                    className="rounded bg-destructive px-3 py-1 text-xs text-destructive-foreground"
                  >
                    Add anyway
                  </button>
                  <button
                    onClick={() => setPending(null)}
                    className="rounded border border-input px-3 py-1 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <div
          id="timetable-card"
          className="class-page__timetable mt-4 scroll-mt-28 min-w-0"
        >
          <SectionCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionLabel>Your weekly timetable</SectionLabel>
                <p className="mt-1 text-xs text-muted-foreground">{ttLabel}</p>
              </div>
              {picks.length > 0 && (
                <div className="w-44 shrink-0 print:hidden sm:w-52">
                  <Segmented
                    options={[
                      { id: "grid", label: "Week grid" },
                      { id: "list", label: "List" },
                    ]}
                    value={view}
                    ariaLabel="Timetable display"
                    onChange={setView}
                  />
                </div>
              )}
              <div className="hidden print:block text-[10px] text-muted-foreground">
                CampusEase · printed {new Date().toLocaleDateString("en-GB")}
              </div>
            </div>
            {clashes.length > 0 && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <strong>
                  ⚠ {clashes.length} clash{clashes.length === 1 ? "" : "es"} in
                  this timetable:
                </strong>
                <ul className="list-disc ml-4">
                  {clashes.map((c, i) => (
                    <li key={i}>
                      {c.day}: {c.label}
                    </li>
                  ))}
                </ul>
                {fixes.length > 0 && (
                  <div className="mt-2 border-t border-destructive/30 pt-2 text-foreground print:hidden">
                    <div className="font-medium mb-1">
                      Clash resolver — try another section:
                    </div>
                    {fixes.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          switchSection(f.pickId, f.to);
                          toast.success(`${f.code} moved to ${f.to}`);
                        }}
                        className="mr-1 mb-1 rounded border border-input bg-background px-2 py-1"
                      >
                        {f.code}: {f.from} → {f.to} ({f.after} left)
                      </button>
                    ))}
                    <button
                      onClick={fixAll}
                      className="ml-1 rounded bg-primary text-primary-foreground px-2 py-1"
                    >
                      Fix all
                    </button>
                  </div>
                )}
              </div>
            )}
            {picks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-input bg-background/50 px-4 py-5">
                <div className="max-w-lg">
                  <div className="text-sm font-semibold">
                    Your weekly timetable appears here
                  </div>
                  <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Use <strong className="text-foreground">Step 2</strong> to
                    load your courses by roll number,{" "}
                    <strong className="text-foreground">Step 3</strong> for a
                    full section, or{" "}
                    <strong className="text-foreground">Step 4</strong> to add
                    courses one at a time. We flag clashes as you build.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {view === "grid" && (
                  <WeekGrid
                    picks={picks}
                    title="My weekly class timetable"
                    subtitle={ttLabel}
                  />
                )}
                {view === "list" &&
                  DAYS.map((d) => {
                    const items = picks
                      .flatMap((p) =>
                        p.sessions
                          .filter((s) => s.day === d)
                          .map((s) => ({ p, s })),
                      )
                      .sort((a, b) => toMin(a.s.start) - toMin(b.s.start));
                    return (
                      <div key={d} className="space-y-1">
                        <div className="mb-1 flex items-baseline justify-between border-b border-border pb-1">
                          <span className="text-sm font-semibold text-foreground">
                            {DAY_FULL[d]}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {items.length === 0
                              ? "Free day"
                              : `${items.length} class${items.length === 1 ? "" : "es"}`}
                          </span>
                        </div>
                        {items.length === 0 && (
                          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            No classes scheduled
                          </p>
                        )}
                        {items.map(({ p, s }) => (
                          <div
                            key={s.sid}
                            className={`flex gap-3 rounded-md border px-3 py-2 mb-1 text-sm ${clashSids.has(s.sid) ? "border-destructive bg-destructive/10" : "border-border"}`}
                          >
                            <div className="w-28 shrink-0 font-mono text-xs sm:w-36">
                              {fmt12(s.start)} – {fmt12(s.end)}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">
                                {p.code} · {p.title}{" "}
                                {s.kind === "lab" && (
                                  <span className="text-xs text-primary">
                                    (Lab)
                                  </span>
                                )}
                                {clashSids.has(s.sid) && (
                                  <span className="ml-2 text-xs font-semibold text-destructive">
                                    CLASH
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {p.cls} · {s.room || "Room TBA"} ·{" "}
                                {s.instructor}
                                {s.edited ? " · edited" : ""}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                <label className="mt-2 flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 cursor-pointer select-none hover:bg-muted transition print:hidden">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
                  />
                  <span className="text-sm text-foreground">
                    I will double-check this timetable with my department's
                    official timetable.
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-3 print:hidden">
                  <PrimaryButton
                    disabled={!confirmed}
                    onClick={() => {
                      downloadTimetablePdf(picks, ttLabel).catch(() =>
                        toast.error(
                          "Couldn't create the PDF. Try Print instead.",
                        ),
                      );
                    }}
                  >
                    Download PDF
                  </PrimaryButton>
                  <GhostButton
                    disabled={!confirmed}
                    onClick={() => {
                      setView("grid");
                      setTimeout(() => window.print(), 50);
                    }}
                  >
                    Print / Save PDF
                  </GhostButton>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
        <div
          id="picked-courses"
          className="class-page__picked scroll-mt-28 mt-5"
        >
          <SectionCard label={`My picked courses (${picks.length})`}>
            {picks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-input bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                Courses you load or add will appear here, ready to edit by day,
                time, and section.
              </p>
            ) : (
              <>
                <div className="-mt-1 mb-1 flex justify-end">
                  <button
                    onClick={() => setPicks([])}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    clear all
                  </button>
                </div>
                <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-6">
                  {picks.map((p, index) => {
                    const tailCount = picks.length % 3;
                    const isLastRow = index >= picks.length - tailCount;
                    const columnSpan =
                      tailCount === 2 && isLastRow
                        ? "xl:col-span-3"
                        : tailCount === 1 && isLastRow
                          ? "xl:col-span-6 xl:mx-auto xl:w-full xl:max-w-3xl"
                          : "xl:col-span-2";
                    const alts = [
                      ...new Set(
                        offerings
                          .filter((o) => o.code === p.code)
                          .map((o) => o.cls),
                      ),
                    ];
                    const hasEdited = p.sessions.some((s) => s.edited);
                    const pickClashes = p.sessions.some((s) =>
                      clashSids.has(s.sid),
                    );
                    return (
                      <div
                        key={p.id}
                        className={`flex h-full min-w-0 flex-col rounded-xl border p-4 transition ${columnSpan} ${
                          pickClashes
                            ? "border-destructive/40 bg-destructive/5"
                            : hasEdited
                              ? "border-primary/40 bg-primary/5"
                              : "border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div
                              className="line-clamp-2 text-sm font-medium"
                              title={`${p.code} · ${p.title}`}
                            >
                              {p.code} · {p.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {" "}
                              {pickClashes ? (
                                <span className="text-destructive font-medium">
                                  ⚠ clashing
                                </span>
                              ) : hasEdited ? (
                                <span className="text-primary font-medium">
                                  hand-edited — kept by auto-fix
                                </span>
                              ) : (
                                `Section ${p.cls}`
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              setPicks((ps) => ps.filter((x) => x.id !== p.id))
                            }
                            className="shrink-0 text-xs text-destructive font-medium hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                        <select
                          value={p.cls}
                          onChange={(e) => switchSection(p.id, e.target.value)}
                          className="mt-2 w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
                          aria-label={`Section for ${p.code}`}
                        >
                          {alts.map((a) => (
                            <option key={a} value={a}>
                              Section {a}
                              {a === p.cls ? " (current)" : ""}
                            </option>
                          ))}
                        </select>
                        <div className="mt-3 grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2 px-2 text-[10px] font-medium text-muted-foreground">
                          <span>Day</span>
                          <span>Time</span>
                        </div>
                        {p.sessions.map((s) => (
                          <div
                            key={s.sid}
                            className={`mt-2 grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-lg bg-muted/40 px-2 py-1.5 text-[11px] ${clashSids.has(s.sid) ? "ring-1 ring-destructive/40 bg-destructive/5" : ""}`}
                          >
                            <select
                              value={s.day}
                              aria-label={`Day for ${p.code}`}
                              onChange={(e) =>
                                editSession(p.id, s.sid, {
                                  day: e.target.value as typeof s.day,
                                })
                              }
                              className="w-full rounded border border-input bg-background px-1 py-1"
                            >
                              {DAYS.map((d) => (
                                <option key={d}>{d}</option>
                              ))}
                            </select>
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
                              <input
                                type="time"
                                value={s.start}
                                aria-label={`Start time for ${p.code} on ${s.day}`}
                                onChange={(e) =>
                                  editSession(p.id, s.sid, {
                                    start: e.target.value,
                                  })
                                }
                                className="w-full min-w-0 rounded border border-input bg-background px-1 py-1"
                              />
                              <span className="opacity-50">–</span>
                              <input
                                type="time"
                                value={s.end}
                                aria-label={`End time for ${p.code} on ${s.day}`}
                                onChange={(e) =>
                                  editSession(p.id, s.sid, {
                                    end: e.target.value,
                                  })
                                }
                                className="w-full min-w-0 rounded border border-input bg-background px-1 py-1"
                              />
                            </div>
                            <span className="col-span-2 min-w-0 truncate border-t border-border/60 pt-1 text-muted-foreground">
                              {s.kind === "lab" ? "Lab · " : ""}Room:{" "}
                              {s.room || "TBA"}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
