import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Exam } from "@/lib/types";
import { normalDate, normalSlot, uniqueExams } from "@/lib/exam-utils";
import { findExamClashes } from "@/lib/exam-utils";
import { useSaved } from "@/lib/student-schedules";
import { AppNav } from "@/components/AppNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  Field,
  PrimaryButton,
  SectionCard,
  SectionLabel,
  Select,
} from "@/components/form-bits";
import { usePublishedDatesheets, datesheetRowsToExams } from "@/lib/published";
import { extractPdfPages } from "@/lib/pdf-layout";
import {
  CS_DATESHEET_EXAMS,
  CS_DATESHEET_LABEL,
  CS_DATESHEET_TITLE,
  CS_DATESHEET_VERSION,
} from "@/lib/cs-datesheet";

export const Route = createFileRoute("/exams")({
  head: () => ({
    meta: [
      { title: "Exam Datesheet — CampusEase" },
      {
        name: "description",
        content:
          "Generate your personal exam datesheet from your department's datesheet PDF — with clash warnings.",
      },
      { property: "og:title", content: "Exam Datesheet — CampusEase" },
      {
        property: "og:description",
        content:
          "Generate your personal exam datesheet from your department's datesheet PDF — with clash warnings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Source = "builtin" | "published" | "upload";
type Tab = "gen" | "how";

type StoredDatesheet = {
  exams: Exam[];
  label: string;
  prog: string;
  sem: string;
  sec: string;
  customPicks: string[];
};

function format12Hour(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split("-");
  if (parts.length !== 2) return timeStr;
  const conv = (t: string) => {
    const [hStr, m] = t.trim().split(":");
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h.toString().padStart(2, "0")}:${m} ${ampm}`;
  };
  try {
    return `${conv(parts[0])} · ${conv(parts[1])}`;
  } catch {
    return timeStr;
  }
}

function dayLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function Index() {
  const [tab, setTab] = useState<Tab>("gen");
  const [src, setSrc] = useState<Source>("builtin");
  const { data: publishedDatesheets = [] } = usePublishedDatesheets();
  const publishedCount = publishedDatesheets.length;

  // Default to the strongest available source: an official published doc
  // wins, then the built-in CS datesheet, then a manual PDF upload.
  useEffect(() => {
    setSrc((cur) =>
      cur === "builtin" && publishedCount > 0 ? "published" : cur,
    );
  }, [publishedCount]);

  const {
    data: last,
    setData: setLast,
    ready,
  } = useSaved<StoredDatesheet | null>("datesheet", null);

  // Loaded source state
  const [loadedExams, setLoadedExams] = useState<Exam[] | null>(null);
  const [loadedLabel, setLoadedLabel] = useState("");
  const [parseStep, setParseStep] = useState(0); // 0..5
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSource, setParseSource] = useState<string>("");

  const [prog, setProg] = useState("");
  const [sem, setSem] = useState("");
  const [sec, setSec] = useState("");
  const [result, setResult] = useState<Exam[] | null>(null);

  // Repeater / custom-builder mode
  const [mode, setMode] = useState<"regular" | "custom">("regular");
  const [customPicks, setCustomPicks] = useState<string[]>([]);
  const [customSearch, setCustomSearch] = useState("");

  const [generated, setGenerated] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [restored, setRestored] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // hydrate the last generated datesheet from the server
  useEffect(() => {
    if (!ready || !last) return;
    if (last.exams?.length) {
      setLastDocs(last.exams, last.label);
      setMode(last.customPicks?.length ? "custom" : "regular");
      setResult(last.exams);
      setRestored(true);
    }
    if (last.prog) setProg(last.prog);
    if (last.sem) setSem(last.sem);
    if (last.sec) setSec(last.sec);
    if (last.customPicks) setCustomPicks(last.customPicks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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

  function applyResult(
    matches: Exam[],
    label: string,
    p: string,
    s: string,
    c: string,
    picks: string[] = customPicks,
  ) {
    setResult(matches);
    setRestored(false);
    if (matches.length) {
      bumpCounter();
      toast.success(
        `${matches.length} exam${matches.length === 1 ? "" : "s"} on your datesheet${clashesOf(matches).length ? " · ⚠ clashes found" : ""}`,
      );
    }
    // persist server-side (kind: datesheet)
    setLast({
      exams: matches,
      label,
      prog: p,
      sem: s,
      sec: c,
      customPicks: picks,
    });
  }

  function setLastDocs(exams: Exam[], label: string) {
    setLoadedExams(exams);
    setLoadedLabel(label);
  }

  const progs = useMemo(
    () => [...new Set((loadedExams ?? []).map((e) => e.prog))].sort(),
    [loadedExams],
  );
  const sems = useMemo(
    () =>
      [...new Set((loadedExams ?? []).map((e) => e.sem))].sort(
        (a, b) => Number(a) - Number(b),
      ),
    [loadedExams],
  );
  const secs = useMemo(() => {
    const s = Number(sem || 0);
    const filtered = (loadedExams ?? []).filter(
      (e) => (!prog || e.prog === prog) && (!s || Number(e.sem) === s),
    );
    return [...new Set(filtered.map((e) => e.sec).filter(Boolean))].sort();
  }, [loadedExams, prog, sem]);

  function generate() {
    if (!loadedExams) return;
    if (mode === "regular") {
      if (!prog || !sem) {
        setResult([]);
        return;
      }
      const s = Number(sem);
      const matches = loadedExams.filter(
        (e) =>
          e.prog === prog && Number(e.sem) === s && (!sec || e.sec === sec),
      );
      applyResult(uniqueExams(matches), loadedLabel, prog, sem, sec);
    } else {
      const picked = new Set(customPicks);
      const matches = loadedExams.filter((e) => picked.has(examKey(e)));
      applyResult(
        uniqueExams(matches),
        loadedLabel,
        prog,
        sem,
        sec,
        customPicks,
      );
    }
  }

  function examKey(e: Exam) {
    return `${e.prog}|${e.sem}|${e.sec}|${e.date}|${e.time}|${e.code}`;
  }

  const clashesOf = (exams: Exam[]) => findExamClashes(exams);

  function pickPublishedDoc(id: string) {
    const doc = publishedDatesheets.find((d) => d.id === id);
    if (!doc) return;
    const exams = datesheetRowsToExams(doc.data as Record<string, unknown>[]);
    setProg("");
    setSec("");
    setResult(null);
    setCustomPicks([]);
    setParseError(null);
    setParseStep(0);
    if (!exams.length) {
      setLoadedExams(null);
      toast.error("This published datesheet has no usable exam rows yet.");
      return;
    }
    const deptName =
      (doc as { departments?: { name?: string } }).departments?.name ??
      doc.title;
    setLastDocs(uniqueExams(exams), deptName);
    toast.success(`Loaded ${exams.length} exams for ${deptName}`);
  }

  function loadBuiltIn() {
    setParseError(null);
    setParseStep(0);
    setProg("");
    setSec("");
    setResult(null);
    setCustomPicks([]);
    setLastDocs(
      uniqueExams(CS_DATESHEET_EXAMS),
      `${CS_DATESHEET_LABEL} — ${CS_DATESHEET_TITLE}`,
    );
    toast.success(
      `Loaded the official ${CS_DATESHEET_VERSION} datesheet (${CS_DATESHEET_EXAMS.length} exams)`,
    );
    setRestored(false);
  }

  async function handleFile(f: File) {
    setParseError(null);
    setParseStep(1);
    try {
      const pages = await extractPdfPages(f);
      setParseStep(2);
      setParseStep(3);
      const all: Exam[] = [];
      let dept = "";
      let failed = 0;
      let source = "";
      const q = pages.map((t) => t);
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (q.length) {
            const t = q.shift()!;
            let ok = false;
            for (let attempt = 0; attempt < 2 && !ok; attempt++) {
              const res = await fetch("/api/parse-datesheet", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ text: t }),
              });
              const j = await res
                .json()
                .catch(() => ({}) as { error?: string; source?: string });
              if (res.ok) {
                all.push(...(j.exams ?? []));
                dept ||= j.department || "";
                source ||= j.source || "";
                ok = true;
              } else if (res.status === 503)
                throw new Error(j.error || `HTTP ${res.status}`);
              else if (attempt === 0)
                await new Promise((r) => setTimeout(r, 1500));
            }
            if (!ok) failed++;
          }
        }),
      );
      setParseStep(4);
      const cleaned = uniqueExams(
        all.map((e) => ({
          ...e,
          date: normalDate(e.date),
          time: normalSlot(e.time),
          sem: Number(e.sem) || 0,
          rooms: Array.isArray(e.rooms) ? e.rooms : [],
          sec: e.sec || "",
        })),
      );
      if (!cleaned.length)
        throw new Error(
          failed
            ? "We couldn't read this datesheet right now. Please try again — or send it to us via the contact page."
            : "No exams found. The PDF may be a scanned image.",
        );
      setParseStep(5);
      setParseSource(source);
      const deptName = dept || f.name.replace(/\.pdf$/i, "");
      setLastDocs(cleaned, deptName);
      setProg("");
      setSec("");
      setResult(null);
      setCustomPicks([]);
      setRestored(false);
      toast.success(`Read ${cleaned.length} exam rows for ${deptName}`);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Failed to parse PDF");
      setParseStep(0);
    }
  }

  function printResult(id: string) {
    const node = document.getElementById(id);
    if (!node) return;
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) return;
    w.document
      .write(`<!doctype html><html><head><title>CampusEase Datesheet</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,sans-serif;color:#111;padding:24px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
        th{background:#f4f4f5}
        h1{margin:0 0 4px;font-size:20px}
        .sub{color:#666;margin-bottom:16px;font-size:13px}
        .pill{display:inline-block;padding:2px 6px;background:#eef2ff;color:#3730a3;border-radius:4px;font-size:11px;margin-right:4px}
      </style></head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 300);
  }

  const activeResult = result;
  const activeLabel = loadedLabel || "your datesheet";
  const activeTitle =
    mode === "regular"
      ? `${prog || "—"} · Semester ${sem || "—"}${sec ? ` · Sec ${sec}` : ""}`
      : `Custom picks · ${customPicks.length} course${customPicks.length === 1 ? "" : "s"}`;
  const activeClashes = activeResult ? clashesOf(activeResult) : [];

  return (
    <div className="min-h-screen bg-[var(--background)] text-foreground">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Exam datesheet" }]}
        />
        <header className="mb-6">
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Personal exam datesheet
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Load your department's datesheet, pick your class — we flag every
            exam clash.
          </p>
        </header>

        <Tabs tab={tab} setTab={setTab} />

        {tab === "how" ? (
          <HowItWorks />
        ) : (
          <>
            <Stats generated={generated} loaded={loadedExams ? 1 : 0} />
            <Card>
              <SectionLabel>Step 1 — Your department's datesheet</SectionLabel>
              <div
                className={`grid grid-cols-1 gap-3 ${
                  publishedDatesheets.length > 1
                    ? "sm:grid-cols-3"
                    : "sm:grid-cols-2"
                }`}
              >
                {publishedDatesheets.length > 0 && (
                  <DeptCard
                    active={src === "published"}
                    onClick={() => {
                      setSrc("published");
                      setParseStep(0);
                    }}
                    icon="📚"
                    title="Published datesheets"
                    sub={publishedDatesheets
                      .map(
                        (d) =>
                          (d as unknown as { departments?: { name?: string } })
                            .departments?.name ?? d.title,
                      )
                      .slice(0, 3)
                      .join(" · ")}
                  />
                )}
                <DeptCard
                  active={src === "builtin"}
                  onClick={() => {
                    setSrc("builtin");
                    if (!loadedExams) loadBuiltIn();
                    setParseStep(0);
                  }}
                  icon="🏛️"
                  title="Computer Science (official)"
                  sub="Mid DateSheet FA26 v1 — already added for you"
                />
                <DeptCard
                  active={src === "upload"}
                  onClick={() => setSrc("upload")}
                  icon="📄"
                  title="Upload datesheet PDF"
                  sub="Works with any department's layout"
                />
              </div>
            </Card>

            {src === "builtin" && (
              <Card>
                <SectionLabel>
                  Step 2 — Official Computer Science datesheet
                </SectionLabel>
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {CS_DATESHEET_TITLE} · {CS_DATESHEET_VERSION}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Official "Mids D-Sheet CS v1.pdf" —{" "}
                      {CS_DATESHEET_EXAMS.length} exams over 7 exam days, 02–09
                      Nov 2026.
                    </div>
                  </div>
                  <button
                    onClick={loadBuiltIn}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    {loadedLabel.startsWith(CS_DATESHEET_LABEL)
                      ? "Reload"
                      : "Load"}
                  </button>
                </div>
                {loadedExams && loadedLabel.startsWith(CS_DATESHEET_LABEL) && (
                  <div className="mt-3 rounded-md border border-border bg-primary/5 px-3 py-2 text-sm">
                    ✅ Loaded <strong>{loadedExams.length}</strong> exams. Now
                    select your class below.
                  </div>
                )}
              </Card>
            )}

            {src === "published" && (
              <Card>
                <SectionLabel>
                  Step 2 — Choose your department's published datesheet
                </SectionLabel>
                <div className="space-y-1.5">
                  {publishedDatesheets
                    .map(
                      (d) =>
                        d as unknown as {
                          id: string;
                          title: string;
                          version: string;
                          departments?: { name?: string } | null;
                        },
                    )
                    .map((d) => (
                      <button
                        key={d.id}
                        onClick={() => pickPublishedDoc(d.id)}
                        className={`w-full text-left rounded-md border px-3 py-2.5 text-sm transition ${
                          loadedLabel === (d.departments?.name ?? d.title) &&
                          loadedExams
                            ? "border-primary bg-primary/5"
                            : "border-input hover:bg-muted"
                        }`}
                      >
                        <div className="font-medium">
                          {d.departments?.name ?? d.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {d.title} · {d.version}
                        </div>
                      </button>
                    ))}
                </div>
                {loadedExams && loadedLabel && (
                  <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                    ✅ Loaded <strong>{loadedExams.length}</strong> exam rows
                    for <strong>{loadedLabel}</strong>. Now select your class
                    below.
                  </div>
                )}
              </Card>
            )}

            {src === "upload" && (
              <Card>
                <SectionLabel>Step 2 — Upload your datesheet PDF</SectionLabel>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-muted transition"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                    }}
                  />
                  <div className="text-3xl">📄</div>
                  <div className="mt-2 font-medium text-sm">
                    Click to upload your department's datesheet
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    The PDF is read in your browser; only the page text is sent
                    for parsing.
                  </div>
                </button>

                {parseStep > 0 && (
                  <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                    <Step
                      n={1}
                      cur={parseStep}
                      label="Extracting text from PDF (in your browser)"
                    />
                    <Step n={2} cur={parseStep} label="Normalizing layout" />
                    <Step
                      n={3}
                      cur={parseStep}
                      label="Reading datesheet (AI parser)"
                    />
                    <Step
                      n={4}
                      cur={parseStep}
                      label="Receiving structured exams"
                    />
                    <Step
                      n={5}
                      cur={parseStep}
                      label="Indexing programs and sections"
                    />
                  </div>
                )}

                {parseError && (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm">
                    {parseError}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span>Still unreadable?</span>
                      <a
                        href="/contact"
                        className="underline hover:no-underline font-medium"
                      >
                        Send it to us via the contact page
                      </a>
                      <span className="opacity-70">
                        — the owner can add it manually for every student.
                      </span>
                    </div>
                  </div>
                )}

                {loadedExams && (
                  <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                    ✅ Parsed <strong>{loadedExams.length}</strong> exam rows
                    {loadedLabel ? (
                      <>
                        {" "}
                        for <strong>{loadedLabel}</strong>
                      </>
                    ) : null}
                    {parseSource === "rules-fallback" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (offline rules engine — AI was unavailable)
                      </span>
                    )}
                    . Now select your class below.
                  </div>
                )}
              </Card>
            )}

            {loadedExams && (
              <Card>
                <SectionLabel>Step 3 — Your class details</SectionLabel>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium shrink-0">
                    <ModeBtn
                      active={mode === "regular"}
                      onClick={() => setMode("regular")}
                    >
                      Regular
                    </ModeBtn>
                    <ModeBtn
                      active={mode === "custom"}
                      onClick={() => setMode("custom")}
                    >
                      Repeater (custom)
                    </ModeBtn>
                  </div>
                </div>

                {mode === "regular" ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Program">
                        <Select
                          value={prog}
                          onChange={(v) => {
                            setProg(v);
                            setSec("");
                          }}
                        >
                          <option value="">Select program</option>
                          {progs.map((p) => (
                            <option key={p} value={p}>
                              {p === "ALL" ? "ALL (all programs)" : p}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Semester">
                        <Select
                          value={sem}
                          onChange={(v) => {
                            setSem(v);
                            setSec("");
                          }}
                        >
                          <option value="">Select semester</option>
                          {sems.map((s) => (
                            <option key={String(s)} value={String(s)}>
                              {String(s)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Section">
                        <Select value={sec} onChange={setSec}>
                          <option value="">All sections</option>
                          {secs.map((s) => (
                            <option key={String(s)} value={String(s)}>
                              {String(s)}
                              {String(s) === "R" ? " (Repeater)" : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <ConfirmCheck checked={confirmed} onChange={setConfirmed} />
                    <PrimaryButton
                      className="mt-3"
                      disabled={!confirmed}
                      onClick={generate}
                    >
                      Generate my datesheet
                    </PrimaryButton>
                  </>
                ) : (
                  <CustomBuilder
                    exams={loadedExams}
                    search={customSearch}
                    setSearch={setCustomSearch}
                    picks={customPicks}
                    setPicks={setCustomPicks}
                    examKey={examKey}
                    confirmed={confirmed}
                    onConfirmedChange={setConfirmed}
                    onGenerate={generate}
                  />
                )}
              </Card>
            )}

            {activeResult !== null && (
              <ResultBlock
                id="exam-result"
                matches={activeResult}
                title={activeTitle}
                onPrint={() => printResult("exam-result")}
                clashes={activeClashes}
                hasRestored={restored}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: "gen", label: "Generate" },
    { id: "how", label: "How it works" },
  ];
  return (
    <div className="flex border-b border-border mb-5">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          className={`-mb-px px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === it.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <SectionCard className="mb-4">{children}</SectionCard>;
}

function DeptCard({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border p-4 transition ${
        active
          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
          : "border-border hover:border-primary/50"
      }`}
    >
      <div role="img" aria-label={`${title} option`} className="text-2xl">
        {icon}
      </div>
      <div className="mt-2 font-medium text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </button>
  );
}

function Step({ n, cur, label }: { n: number; cur: number; label: string }) {
  const state = cur > n ? "done" : cur === n ? "active" : "todo";
  const dot =
    state === "done"
      ? "bg-primary"
      : state === "active"
        ? "bg-primary animate-pulse"
        : "bg-border";
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      <span className={state === "todo" ? "opacity-60" : ""}>{label}</span>
    </div>
  );
}

function Stats({ generated, loaded }: { generated: number; loaded: number }) {
  const Item = ({ v, l }: { v: React.ReactNode; l: string }) => (
    <div className="bg-card border border-border rounded-lg px-3 py-3 sm:px-4">
      <div className="text-lg font-semibold">{v}</div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
        {l}
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-2 mb-4 sm:gap-3">
      <Item v={generated.toLocaleString()} l="Timetables generated" />
      <Item v="AI + rules" l="Parser mode" />
      <Item v={loaded ? "Loaded" : "—"} l="Datesheet" />
    </div>
  );
}

function ClashBanner({
  clashes,
}: {
  clashes: ReturnType<typeof findExamClashes>;
}) {
  if (!clashes.length) return null;
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 mb-4 text-sm text-destructive">
      <div className="font-semibold flex items-center gap-2">
        <span>
          ⚠ {clashes.length} exam clash{clashes.length === 1 ? "" : "es"} in
          this datesheet
        </span>
      </div>
      <ul className="list-disc ml-4 mt-1 text-xs space-y-0.5">
        {clashes.map((c, i) => (
          <li key={i}>
            <strong>{dayLabel(c.date)}</strong>: {c.a.code} (
            {format12Hour(c.a.time)}) ↔ {c.b.code} ({format12Hour(c.b.time)})
            {c.a.prog && c.b.prog
              ? ` · ${c.a.prog}${c.a.sem}-${c.a.sec || ""}`
              : ""}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] opacity-80">
        These courses are scheduled at overlapping times. Contact your
        department — v1 datesheets often get corrected in v2.
      </p>
    </div>
  );
}

function ResultBlock({
  id,
  matches,
  title,
  onPrint,
  clashes,
  hasRestored,
}: {
  id: string;
  matches: Exam[];
  title: string;
  onPrint: () => void;
  clashes: ReturnType<typeof findExamClashes>;
  hasRestored?: boolean;
}) {
  if (!matches.length) {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="text-3xl">📭</div>
          <div className="mt-2 font-medium">No exams found</div>
          <div className="text-sm text-muted-foreground">
            Try a different program / semester / section — or check that the
            right datesheet is loaded.
          </div>
        </div>
      </Card>
    );
  }
  const today = new Date();
  const byDate = new Map<string, Exam[]>();
  for (const e of matches) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }
  return (
    <div
      className="bg-card border border-border rounded-lg p-4 mb-4 shadow-sm sm:p-5"
      id={id}
    >
      {hasRestored && (
        <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          Restored from your last session (saved server-side).
        </div>
      )}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {matches.length} exam{matches.length === 1 ? "" : "s"} ·{" "}
            {byDate.size} day{byDate.size === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={onPrint}
          className="rounded-md border border-input bg-background hover:bg-muted px-3 py-1.5 text-xs font-medium"
        >
          Print / Save PDF
        </button>
      </div>
      <ClashBanner clashes={clashes} />
      <div className="-mx-2 hidden overflow-x-auto sm:block print:block print:mx-0 print:overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Time</th>
              <th className="px-2 py-2">Course</th>
              <th className="px-2 py-2">Instructor</th>
              <th className="px-2 py-2">Rooms</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((e, i) => {
              const clashed = clashes.some((c) => DateAffects(c, e));
              const diff = Math.ceil(
                (new Date(e.date + "T00:00:00").getTime() - today.getTime()) /
                  86400000,
              );
              return (
                <tr
                  key={i}
                  className={`border-b border-border/60 align-top ${clashed ? "bg-destructive/5" : ""}`}
                >
                  <td className="px-2 py-2.5">
                    <div className="font-medium">{dayLabel(e.date)}</div>
                    {diff > 0 && (
                      <div className="text-[11px] text-amber-600">
                        {diff} day{diff === 1 ? "" : "s"} away
                      </div>
                    )}
                    {diff === 0 && (
                      <div className="text-[11px] text-emerald-600">Today</div>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="inline-block bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-mono">
                      {format12Hour(e.time)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="font-medium">
                      {e.code} · {e.course}
                    </div>
                    {clashed && (
                      <div className="text-[11px] font-semibold text-destructive">
                        Clash
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5">{e.instructor}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {e.rooms.map((r, j) => (
                        <span
                          key={j}
                          className="pill inline-block bg-muted text-foreground/80 rounded px-1.5 py-0.5 text-[11px] font-mono"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: the same rows as stacked cards — no sideways scrolling */}
      <div className="space-y-2 sm:hidden">
        {matches.map((e, i) => {
          const clashed = clashes.some((c) => DateAffects(c, e));
          const diff = Math.ceil(
            (new Date(e.date + "T00:00:00").getTime() - today.getTime()) /
              86400000,
          );
          return (
            <div
              key={i}
              className={`rounded-md border px-3 py-2.5 ${clashed ? "border-destructive/40 bg-destructive/5" : "border-border"}`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="font-medium">{dayLabel(e.date)}</div>
                {diff > 0 && (
                  <span className="text-[11px] text-amber-600">
                    {diff} day{diff === 1 ? "" : "s"} away
                  </span>
                )}
                {diff === 0 && (
                  <span className="text-[11px] text-emerald-600">Today</span>
                )}
                <span className="ml-auto inline-block bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-mono">
                  {format12Hour(e.time)}
                </span>
              </div>
              <div className="mt-1 text-sm font-medium">
                {e.code} · {e.course}
                {clashed && (
                  <span className="ml-2 text-[11px] font-semibold text-destructive">
                    Clash
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {e.instructor}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {e.rooms.map((r, j) => (
                  <span
                    key={j}
                    className="pill inline-block bg-muted text-foreground/80 rounded px-1.5 py-0.5 text-[11px] font-mono"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DateAffects(c: { a: Exam; b: Exam }, e: Exam): boolean {
  return c.a === e || c.b === e;
}

function HowItWorks() {
  const items = [
    {
      n: 1,
      t: "Any department, any layout",
      d: "Upload your department's datesheet PDF. The text is extracted in your browser, then an AI model converts it into a clean exam list. If AI is down, a built-in rules engine for the standard FA26 layout takes over.",
    },
    {
      n: 2,
      t: "Clash detection",
      d: "If two of your exams run at overlapping times on the same day (a common v1 datesheet mistake), you'll see an explicit warning so you can contact your department before it surprises you.",
    },
    {
      n: 3,
      t: "Saved for you, server-side",
      d: "Your generated datesheet is stored on the server and restored automatically next session — the file itself never leaves your browser unprocessed.",
    },
    {
      n: 4,
      t: "Print or save as PDF",
      d: "One click opens a clean print view — choose 'Save as PDF' from the system print dialog.",
    },
  ];
  return (
    <Card>
      <SectionLabel>How the exam datesheet works</SectionLabel>
      <ol className="space-y-4">
        {items.map((i) => (
          <li key={i.n} className="flex gap-3">
            <div className="flex-none w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold grid place-items-center">
              {i.n}
            </div>
            <div>
              <div className="font-medium text-sm">{i.t}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{i.d}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ConfirmCheck({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-4 flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 cursor-pointer select-none hover:bg-muted transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
      />
      <span className="text-sm text-foreground">
        I will double-check this datesheet with my department's official
        version.
      </span>
    </label>
  );
}

type CourseGroup = {
  key: string;
  prog: string;
  sem: number;
  sec: string;
  code: string;
  course: string;
  count: number;
};

function CustomBuilder({
  exams,
  search,
  setSearch,
  picks,
  setPicks,
  examKey,
  confirmed,
  onConfirmedChange,
  onGenerate,
}: {
  exams: Exam[];
  search: string;
  setSearch: (v: string) => void;
  picks: string[];
  setPicks: (v: string[]) => void;
  examKey: (e: Exam) => string;
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
  onGenerate: () => void;
}) {
  const groups = useMemo<CourseGroup[]>(() => {
    const map = new Map<string, CourseGroup>();
    for (const e of exams) {
      const key = examKey(e);
      const prev = map.get(key);
      if (prev) continue;
      map.set(key, {
        key,
        prog: e.prog,
        sem: e.sem,
        sec: e.sec,
        code: e.code,
        course: e.course,
        count: 1,
      });
    }
    return [...map.values()].sort(
      (a, b) =>
        a.code.localeCompare(b.code) ||
        a.prog.localeCompare(b.prog) ||
        a.sem - b.sem ||
        a.sec.localeCompare(b.sec),
    );
  }, [exams, examKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.code.toLowerCase().includes(q) ||
        g.course.toLowerCase().includes(q) ||
        `${g.prog}${g.sem}${g.sec}`.toLowerCase().includes(q),
    );
  }, [groups, search]);

  function toggle(key: string) {
    setPicks(
      picks.includes(key) ? picks.filter((k) => k !== key) : [...picks, key],
    );
  }

  return (
    <>
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 mb-3">
        <strong>Repeater mode:</strong> pick every course you're sitting (across
        any program / semester / section, including R sections). We'll combine
        them into one datesheet — and flag clashes.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search course code, name or class (e.g. CSC141, BCS 3-R, Calculus)…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="text-xs text-muted-foreground self-center sm:text-right">
          {picks.length} picked · {filtered.length} shown
          {picks.length > 0 && (
            <button
              onClick={() => setPicks([])}
              className="ml-2 underline hover:no-underline"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {picks.map((k) => {
            const g = groups.find((x) => x.key === k);
            if (!g) return null;
            return (
              <button
                key={k}
                onClick={() => toggle(k)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/30 px-2.5 py-1 text-[11px] font-mono hover:bg-primary/20 transition"
                title="Click to remove"
              >
                {g.prog}
                {g.sem}
                {g.sec ? `-${g.sec}` : ""} · {g.code}
                <span className="opacity-60">×</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No courses match.
          </div>
        ) : (
          filtered.slice(0, 200).map((g) => {
            const isPicked = picks.includes(g.key);
            return (
              <label
                key={g.key}
                className={`flex items-start gap-3 px-3 py-2 cursor-pointer transition ${
                  isPicked ? "bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isPicked}
                  onChange={() => toggle(g.key)}
                  className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.course}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {g.code} · {g.prog} · Sem {g.sem || "?"}
                    {g.sec ? ` · Sec ${g.sec}` : ""}
                    {g.sec === "R" ? " (Repeater)" : ""}
                  </div>
                </div>
              </label>
            );
          })
        )}
        {filtered.length > 200 && (
          <div className="text-center text-[11px] text-muted-foreground py-2">
            Showing first 200. Refine your search to see more.
          </div>
        )}
      </div>

      <ConfirmCheck checked={confirmed} onChange={onConfirmedChange} />
      <PrimaryButton
        className="mt-3"
        disabled={!confirmed || picks.length === 0}
        onClick={onGenerate}
      >
        Generate my custom datesheet ({picks.length}{" "}
        {picks.length === 1 ? "course" : "courses"})
      </PrimaryButton>
    </>
  );
}

export default Index;
