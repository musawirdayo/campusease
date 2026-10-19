import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  Field,
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
  const [generated, setGenerated] = useState(0);
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
    fetch("/api/counter", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { count?: number }) => {
        if (typeof j.count === "number") setGenerated(j.count);
      })
      .catch(() => {});
  }, []);

  function bumpCounter() {
    fetch("/api/counter", { method: "POST" })
      .then((r) => r.json())
      .then((j: { count?: number }) => {
        if (typeof j.count === "number") setGenerated(j.count);
      })
      .catch(() => {});
  }

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
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="mx-auto max-w-[1400px] px-4 py-8">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Class timetable" }]}
        />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Build your class timetable
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {src === "cs"
            ? `CS department · ${CS_TT_VERSION}`
            : src === "published"
              ? `${publishedDoc?.departments?.name ?? ""} · ${publishedDoc?.title ?? ""}`
              : (custom?.name ?? "Upload your timetable")}
          . Add courses one by one — we warn you about clashes but never block
          you.
        </p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 print:hidden">
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <div className="text-lg font-semibold">
              {generated.toLocaleString()}
            </div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
              Timetables generated
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <div className="text-lg font-semibold">{picks.length}</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
              Courses picked
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <div
              className={`text-lg font-semibold ${clashes.length ? "text-destructive" : ""}`}
            >
              {clashes.length}
            </div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
              Clash{clashes.length === 1 ? "" : "es"}
            </div>
          </div>
          {picks.length > 0 && stats.busiestDay && (
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <div className="text-lg font-semibold">
                {stats.busiestCount} sessions
              </div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
                Busiest day · {DAY_FULL[stats.busiestDay].slice(0, 3)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 italic">
                {stats.freeDays.length
                  ? `Free: ${stats.freeDays.map((d) => DAY_FULL[d].slice(0, 3)).join(", ")}`
                  : "No free day this week"}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="space-y-4 print:hidden">
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

            <SectionCard label="Step 2 — Quick start: your section's full timetable">
              <Select value="" onChange={(v) => v && loadSection(v)}>
                <option value="">Select section…</option>
                {CLASSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </SectionCard>

            <SectionCard label="Step 3 — Add individual courses">
              <TextInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search code, name or section…"
              />
              <div className="mt-2 max-h-80 overflow-y-auto divide-y divide-border rounded-md border border-border">
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
                        (s) =>
                          `${DAY_FULL[s.day].slice(0, 3)} ${fmt12(s.start)}`,
                      ),
                    ),
                  ]
                    .sort()
                    .join(" · ");
                  return (
                    <div
                      key={o.key}
                      className={`flex items-start gap-2 px-2.5 py-2 transition ${added ? "bg-primary/5" : "hover:bg-muted/60"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {o.code} · {o.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {o.cls} · {daySummary}
                        </div>
                        {n > 0 && (
                          <div className="text-[11px] font-medium text-destructive mt-0.5">
                            ⚠ clashes with a picked course — you can still add
                            it
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

            <SectionCard label={`My courses (${picks.length})`}>
              {picks.length > 0 && (
                <div className="-mt-1 mb-1 flex justify-end">
                  <button
                    onClick={() => setPicks([])}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    clear all
                  </button>
                </div>
              )}
              <div className="space-y-3">
                {picks.map((p) => {
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
                      className={`rounded-md border p-3 transition ${
                        pickClashes
                          ? "border-destructive/40 bg-destructive/5"
                          : hasEdited
                            ? "border-primary/40 bg-primary/5"
                            : "border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
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
                      >
                        {alts.map((a) => (
                          <option key={a} value={a}>
                            Section {a}
                            {a === p.cls ? " (current)" : ""}
                          </option>
                        ))}
                      </select>
                      {p.sessions.map((s) => (
                        <div
                          key={s.sid}
                          className={`mt-2 flex flex-wrap items-center gap-1.5 rounded bg-muted/40 px-2 py-1.5 text-[11px] ${clashSids.has(s.sid) ? "ring-1 ring-destructive/40 bg-destructive/5" : ""}`}
                        >
                          <select
                            value={s.day}
                            onChange={(e) =>
                              editSession(p.id, s.sid, {
                                day: e.target.value as typeof s.day,
                              })
                            }
                            className="rounded border border-input bg-background px-1 py-0.5"
                          >
                            {DAYS.map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={s.start}
                            onChange={(e) =>
                              editSession(p.id, s.sid, {
                                start: e.target.value,
                              })
                            }
                            className="rounded border border-input bg-background px-1 py-0.5"
                          />
                          <span className="opacity-50">–</span>
                          <input
                            type="time"
                            value={s.end}
                            onChange={(e) =>
                              editSession(p.id, s.sid, { end: e.target.value })
                            }
                            className="rounded border border-input bg-background px-1 py-0.5"
                          />
                          <span className="ml-auto truncate">
                            {s.kind === "lab" ? "Lab · " : ""}
                            {s.room || "Room TBA"}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <SectionCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <SectionLabel>Your weekly timetable</SectionLabel>
                <p className="mt-1 text-xs text-muted-foreground">{ttLabel}</p>
              </div>
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
              <div className="py-14 text-center">
                <div className="text-3xl">🗓️</div>
                <div className="mt-2 text-sm font-medium">
                  Your weekly timetable appears here
                </div>
                <div className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                  Start with <strong>Step 2</strong> to load your whole
                  section's timetable in one click, or search a course in{" "}
                  <strong>Step 3</strong>. Clashes are flagged automatically and
                  we suggest clash-free sections you can switch to.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end print:hidden">
                  <div className="w-56">
                    <Segmented
                      options={[
                        { id: "grid", label: "Week grid" },
                        { id: "list", label: "List" },
                      ]}
                      value={view}
                      onChange={setView}
                    />
                  </div>
                </div>
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
                    if (!items.length) return null;
                    return (
                      <div key={d}>
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                          {DAY_FULL[d]}
                        </div>
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
                      bumpCounter();
                      downloadTimetablePdf(picks, ttLabel).catch(() =>
                        toast.error(
                          "Couldn't create the PDF. Try Print instead.",
                        ),
                      );
                    }}
                  >
                    Download PDF
                  </PrimaryButton>
                  <button
                    disabled={!confirmed}
                    onClick={() => {
                      bumpCounter();
                      setView("grid");
                      setTimeout(() => window.print(), 50);
                    }}
                    className="rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Print / Save PDF
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
