import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Copy,
  FileUp,
  Pencil,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { extractPdfPages } from "@/lib/pdf-layout";
import {
  archiveSchedule,
  getAdminSchedules,
  getDepartments,
  getSchedule,
  removeSchedule,
  saveSchedule,
  setStatusSchedule,
} from "@/lib/schedules.functions";
import { datesheetRowsToExams } from "@/lib/published";
import { auditExams, normalDate, normalSlot } from "@/lib/exam-utils";
import { DAYS, overlaps } from "@/lib/timetable";
import type { Day } from "@/lib/types";
import {
  CS_DATESHEET_EXAMS,
  CS_DATESHEET_LABEL,
  CS_DATESHEET_TITLE,
  CS_DATESHEET_VERSION,
} from "@/lib/cs-datesheet";
import { CS_SESSIONS, CS_TT_VERSION } from "@/lib/cs-timetable";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Schedule publisher — CampusEase" },
      {
        property: "og:title",
        content: "Schedule publisher — CampusEase",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublisherPage,
});

type Row = Record<string, unknown>;
type Saved = {
  id: string;
  kind: string;
  title: string;
  version: string;
  status: string;
  updated_at: string;
  departments: { name: string } | null;
};

type Kind = "timetable" | "datesheet";

const blankRow = (kind: Kind): Row =>
  kind === "timetable"
    ? {
        cls: "",
        code: "",
        title: "",
        day: "Mon",
        start: "",
        end: "",
        room: "",
        kind: "theory",
        instructor: "",
        note: "",
        inferred: false,
      }
    : {
        date: "",
        time: "",
        prog: "",
        sem: "",
        sec: "",
        course: "",
        code: "",
        rooms: [],
        instructor: "",
      };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-primary/10 text-primary",
  archived: "bg-destructive/10 text-destructive",
};

function PublisherPage() {
  const [kind, setKind] = useState<"timetable" | "datesheet">("timetable");
  const [department, setDepartment] = useState("");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [depts, setDepts] = useState<{ name: string; slug: string }[]>([]);
  const [editing, setEditing] = useState<Saved | null>(null);
  const [docFilter, setDocFilter] = useState("");
  const [showJsonPaste, setShowJsonPaste] = useState(false);
  const [jsonPaste, setJsonPaste] = useState("");
  const filteredSaved = useMemo(() => {
    const q = docFilter.trim().toLowerCase();
    if (!q) return saved;
    return saved.filter((s) =>
      `${s.title} ${s.departments?.name ?? ""} ${s.kind} ${s.status} ${s.version}`
        .toLowerCase()
        .includes(q),
    );
  }, [saved, docFilter]);

  async function refresh() {
    try {
      setSaved((await getAdminSchedules()) as Saved[]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Owner access required",
      );
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    getDepartments()
      .then((d) => setDepts((d ?? []) as { name: string; slug: string }[]))
      .catch(() => {});
  }, []);

  function resetEditor() {
    setEditing(null);
    setKind("timetable");
    setDepartment("");
    setVersion("");
    setTitle("");
    setRows([]);
    setFile("");
  }

  function openSaved(id: string) {
    setBusy("Loading document…");
    getSchedule({ data: { id } })
      .then((doc) => {
        const d = doc as {
          id: string;
          kind: string;
          title: string;
          version: string;
          status: string;
          data: unknown;
          source_filename: string | null;
          departments: { name: string } | null;
        };
        setEditing({
          id: d.id,
          kind: d.kind,
          title: d.title,
          version: d.version,
          status: d.status,
          updated_at: "",
          departments: d.departments,
        });
        setKind(d.kind === "datesheet" ? "datesheet" : "timetable");
        setDepartment(d.departments?.name ?? "");
        setTitle(d.title);
        setVersion(d.version);
        setRows(Array.isArray(d.data) ? (d.data as Row[]) : []);
        setFile(d.source_filename ?? "(no source file)");
        toast.info(`Loaded “${d.title}” for editing`);
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not load document",
        ),
      )
      .finally(() => setBusy(""));
  }

  /** Bumps the last number in a version string: v1.0→v1.1, v3→v4, Fall 2026→Fall 2027. */
  function bumpVersion(v: string): string {
    const s = String(v ?? "").trim();
    const m = s.match(/(\d+)(?!.*\d)/);
    if (!m || m.index === undefined) return `${s || "v"}-2`;
    return (
      s.slice(0, m.index) + (Number(m[1]) + 1) + s.slice(m.index + m[1].length)
    );
  }

  // Rollover: load a past document's rows as a NEW document with a bumped
  // version — the old doc is untouched until Draft/Publish is clicked.
  function cloneSaved(id: string) {
    setBusy("Loading for new version…");
    getSchedule({ data: { id } })
      .then((doc) => {
        const d = doc as {
          kind: string;
          title: string;
          version: string;
          data: unknown;
          departments: { name: string } | null;
        };
        setEditing(null);
        setKind(d.kind === "datesheet" ? "datesheet" : "timetable");
        setDepartment(d.departments?.name ?? "");
        setTitle(d.title);
        setVersion(bumpVersion(d.version));
        setRows(Array.isArray(d.data) ? (d.data as Row[]) : []);
        setFile("(cloned)");
        toast.info(
          "Loaded as a fresh version — review, then Draft/Publish as usual",
        );
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not load document",
        ),
      )
      .finally(() => setBusy(""));
  }

  async function upload(input: File) {
    setFile(input.name);
    setBusy("Reading PDF…");
    setRows([]);
    try {
      const pages = await extractPdfPages(input);
      const endpoint =
        kind === "timetable" ? "/api/parse-timetable" : "/api/parse-datesheet";
      // Parse pages 4 at a time (e.g. /exams does). A page call that stalls is
      // cut off by its own timeout, and the server caps each AI call at ~90s,
      // so “loading” can never silently run for the whole PDF again.
      const slots: Row[][] = new Array(pages.length);
      let failMsg: string | null = null;
      let nextIdx = 0;
      let doneCount = 0;
      const worker = async () => {
        while (nextIdx < pages.length && !failMsg) {
          const index = nextIdx++;
          setBusy(`Parsing page ${doneCount + 1}/${pages.length}…`);
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ text: pages[index] }),
              signal: AbortSignal.timeout(180_000),
            });
            const json = await response.json();
            if (!response.ok) {
              failMsg = json.error ?? "Could not read one of the pages";
              return;
            }
            slots[index] =
              kind === "timetable" ? (json.sessions ?? []) : (json.exams ?? []);
          } catch {
            failMsg = "A page took too long — please try again";
            return;
          }
          doneCount++;
          setBusy(`Parsing page ${doneCount + 1}/${pages.length}…`);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, pages.length) }, () => worker()),
      );
      if (failMsg) throw new Error(failMsg);
      const out = slots.filter(Boolean).flat();
      setRows(out);
      toast.success(`${out.length} rows ready to review`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read PDF",
      );
    }
    setBusy("");
  }

  function edit(index: number, key: string, value: string) {
    setRows((current) =>
      current.map((row, i) =>
        i === index
          ? {
              ...row,
              [key]:
                key === "sem"
                  ? Number(value)
                  : key === "rooms"
                    ? value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : value,
            }
          : row,
      ),
    );
  }
  async function persist(status: "draft" | "published") {
    if (!department || !version || !title || !rows.length)
      return toast.error(
        "Add the department, title, version and reviewed rows first",
      );
    setBusy(status === "published" ? "Publishing…" : "Saving draft…");
    try {
      await saveSchedule({
        data: {
          id: editing?.id,
          department,
          kind,
          title,
          version,
          status,
          data: rows,
          sourceFilename: file,
        },
      });
      toast.success(
        status === "published" ? "Published for students" : "Draft saved",
      );
      resetEditor();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy("");
    }
  }
  function addRow() {
    setRows((current) => [...current, blankRow(kind)]);
  }
  function importBuiltIn() {
    if (kind === "timetable") {
      const builtIn = CS_SESSIONS as unknown as Row[];
      setRows(builtIn);
      if (!department) setDepartment("Computer Science");
      if (!version) setVersion(CS_TT_VERSION);
      toast.success(
        `Imported ${builtIn.length} built-in timetable rows — review, then publish`,
      );
      return;
    }
    if (kind === "datesheet") {
      const builtIn = CS_DATESHEET_EXAMS as unknown as Row[];
      setRows(builtIn);
      if (!department) setDepartment(CS_DATESHEET_LABEL);
      if (!title) setTitle(CS_DATESHEET_TITLE);
      if (!version) setVersion(CS_DATESHEET_VERSION);
      toast.success(
        `Imported the built-in ${CS_DATESHEET_VERSION} datesheet (${builtIn.length} rows) — review, then publish`,
      );
    }
  }
  function importJson(raw: string) {
    try {
      let parsed = JSON.parse(raw) as unknown;
      // Accept a whole parser result too: {"exams":[…]} or {"sessions":[…]}.
      const wrapper = parsed as { exams?: unknown; sessions?: unknown };
      if (Array.isArray(wrapper.exams)) parsed = wrapper.exams;
      else if (Array.isArray(wrapper.sessions)) parsed = wrapper.sessions;
      if (
        !Array.isArray(parsed) ||
        !parsed.length ||
        !parsed.every((r) => r && typeof r === "object" && !Array.isArray(r))
      )
        throw new Error("Expected a non-empty JSON array of row objects");
      setRows(parsed as Row[]);
      setShowJsonPaste(false);
      setJsonPaste("");
      toast.success(
        `Loaded ${parsed.length} rows from JSON — review, then publish`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON");
    }
  }
  async function archive(id: string) {
    if (
      !window.confirm("Archive this document? Students will no longer see it.")
    )
      return;
    try {
      await archiveSchedule({ data: { id } });
      toast.success("Document archived — students can no longer see it");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive");
    }
  }

  async function togglePublish(id: string, current: string) {
    const next = current === "published" ? "draft" : "published";
    try {
      await setStatusSchedule({ data: { id, status: next } });
      toast.success(
        next === "published"
          ? "Published — visible to students"
          : "Unpublished — back to draft",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update");
    }
  }

  async function remove(id: string, title: string) {
    if (
      !window.confirm(
        `Permanently delete “${title}”? This cannot be undone. Consider Archive instead.`,
      )
    )
      return;
    try {
      await removeSchedule({ data: { id } });
      toast.success("Deleted");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  }

  // Column set = union over ALL rows, so rows with different shapes never hide fields.
  const keys = useMemo(() => {
    if (!rows.length) return [];
    const hidden = new Set(["note", "inferred", "sid"]);
    const out: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!hidden.has(key) && !out.includes(key)) out.push(key);
      }
    }
    return out.slice(0, 10);
  }, [rows]);

  // V1 datesheets often contain genuine clashes — warn before publishing.
  const examRows = useMemo(() => {
    if (kind !== "datesheet" || !rows.length) return [];
    return datesheetRowsToExams(rows).map((e) => ({
      ...e,
      date: normalDate(e.date),
      time: normalSlot(e.time),
      rooms: Array.isArray(e.rooms)
        ? e.rooms
        : String(e.rooms ?? "")
            .split(/[,;]\s*/)
            .filter(Boolean),
    }));
  }, [kind, rows]);
  const examIssues = useMemo(
    () => (examRows.length ? auditExams(examRows) : []),
    [examRows],
  );
  const hardIssues = useMemo(
    () => examIssues.filter((i) => i.type !== "clash"),
    [examIssues],
  );
  const clashes = useMemo(
    () => examIssues.filter((i) => i.type === "clash"),
    [examIssues],
  );

  // Timetable rows: same class section overlapping itself in two slots/rooms.
  const ttIssues = useMemo(() => {
    if (kind !== "timetable" || rows.length < 2) return [];
    const isDay = (d: string): d is Day =>
      (DAYS as readonly string[]).includes(d);
    const sessions = rows.flatMap((r, i) => {
      const cls = String(r.cls ?? "").trim();
      const day = String(r.day ?? "").trim();
      const start = String(r.start ?? "").trim();
      const end = String(r.end ?? "").trim();
      if (!cls || !start || !end || !isDay(day)) return [];
      return [
        {
          key: `${cls}|${r.code ?? ""}|${day}|${start}|${i}`,
          cls,
          code: String(r.code ?? ""),
          day,
          start,
          end,
        },
      ];
    });
    const issues: string[] = [];
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const a = sessions[i];
        const b = sessions[j];
        if (a.cls !== b.cls) continue;
        if (a.day === b.day && overlaps(a, b))
          issues.push(
            `${a.cls}: ${a.code || "?"} ${a.start}–${a.end} overlaps ${
              b.code || "?"
            } ${b.start}–${b.end} on ${a.day}`,
          );
      }
    }
    return issues;
  }, [kind, rows]);
  return (
    <div>
      {editing && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <Pencil className="size-4 text-primary" />
          <span>Editing existing document:</span>
          <span className="font-semibold">{editing.title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[editing.status] ?? ""}`}
          >
            {editing.status}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={resetEditor}
          >
            Start a new document
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold">1. Document details</h2>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {(["timetable", "datesheet"] as const).map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={kind === item ? "default" : "ghost"}
                  onClick={() => {
                    setKind(item);
                    setRows([]);
                  }}
                >
                  {item}
                </Button>
              ))}
            </div>
            {[
              {
                label: "Department",
                value: department,
                set: setDepartment,
                placeholder: "Computer Science",
                list: "admin-department-options",
              },
              {
                label: "Title",
                value: title,
                set: setTitle,
                placeholder: "Fall 2026 timetable",
              },
              {
                label: "Version",
                value: version,
                set: setVersion,
                placeholder: "v1.0",
              },
            ].map((field) => (
              <label
                key={field.label}
                className="mt-3 block text-xs font-medium"
              >
                {field.label}
                <input
                  value={field.value}
                  onChange={(e) => field.set(e.target.value)}
                  placeholder={field.placeholder}
                  list={"list" in field ? field.list : undefined}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                {("list" in field ? field.list : undefined) && (
                  <datalist id={field.list as string}>
                    {depts.map((d) => (
                      <option key={d.slug} value={d.name} />
                    ))}
                  </datalist>
                )}
              </label>
            ))}
          </section>
          <label className="flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-primary/40 bg-primary/5 p-7 text-center text-sm font-medium text-primary">
            <FileUp className="mb-2" />
            {busy || "Choose official PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={!!busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              disabled={!!busy || !rows.length}
              onClick={() => persist("draft")}
            >
              <Save /> Draft
            </Button>
            <Button
              disabled={!!busy || !rows.length}
              onClick={() => persist("published")}
            >
              <Send /> Publish
            </Button>
            <Button
              variant="ghost"
              disabled={!!busy || !rows.length}
              onClick={resetEditor}
            >
              Clear
            </Button>
          </div>
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                Saved documents
                <span className="ml-1.5 text-muted-foreground font-normal">
                  ({saved.length})
                </span>
              </h2>
            </div>
            <input
              value={docFilter}
              onChange={(e) => setDocFilter(e.target.value)}
              placeholder="Filter by department, title or status…"
              className="mb-2 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
            />
            <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
              {saved.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-border bg-card p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{item.title}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium capitalize ${STATUS_STYLES[item.status] ?? ""}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {item.departments?.name} · {item.version} · {item.kind}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => openSaved(item.id)}
                    >
                      <Pencil /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => cloneSaved(item.id)}
                    >
                      <Copy /> New version
                    </Button>
                    {item.status !== "archived" && (
                      <Button
                        size="sm"
                        variant={
                          item.status === "published" ? "ghost" : "default"
                        }
                        className="h-7 px-2"
                        onClick={() => togglePublish(item.id, item.status)}
                      >
                        {item.status === "published" ? "Unpublish" : "Publish"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-amber-600"
                      disabled={item.status === "archived"}
                      onClick={() => archive(item.id)}
                    >
                      <Archive /> Archive
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1 text-destructive"
                      onClick={() => remove(item.id, item.title)}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </div>
                </div>
              ))}
              {saved.length > 0 && !filteredSaved.length && (
                <p className="text-center text-muted-foreground">
                  No documents match “{docFilter}”.
                </p>
              )}
            </div>
          </section>
        </aside>

        <section className="min-w-0 rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">2. Review parsed rows</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length
                ? `${rows.length} rows · click any field to correct it before publishing`
                : "Rows will appear here after the PDF is read — or add them manually below."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={addRow}>
                + Add row manually
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowJsonPaste((v) => !v)}
              >
                + Paste JSON rows
              </Button>
              {rows.length === 0 && (
                <Button size="sm" variant="ghost" onClick={importBuiltIn}>
                  {kind === "timetable"
                    ? "Import built-in CS timetable"
                    : "Import built-in CS datesheet (v1)"}
                </Button>
              )}
            </div>
            {showJsonPaste && (
              <div className="mt-3">
                <textarea
                  value={jsonPaste}
                  onChange={(e) => setJsonPaste(e.target.value)}
                  rows={6}
                  placeholder={
                    kind === "timetable"
                      ? '{"cls":"BCS-1","code":"CSC101","title":"ICT","day":"Mon","start":"08:30","end":"09:50","room":"107","kind":"theory","instructor":"…"}'
                      : '{"date":"2026-11-02","time":"08:30-09:50","prog":"BCS","sem":2,"sec":"A","course":"Expository Writing","code":"HUM120","rooms":["107"],"instructor":"…"}'
                  }
                  className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!jsonPaste.trim()}
                    onClick={() => importJson(jsonPaste)}
                  >
                    Load JSON rows
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Paste a raw row array, or a whole parser result — its
                    exams/sessions array is used automatically.
                  </span>
                </div>
              </div>
            )}
            {kind === "datesheet" && examIssues.length > 0 && (
              <div
                className={`mt-3 rounded-md border p-3 text-xs ${
                  hardIssues.length
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : clashes.length
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-primary/40 bg-primary/5 text-primary"
                }`}
              >
                <div className="font-semibold">
                  ⚠ {hardIssues.length + clashes.length} consistency issue
                  {hardIssues.length + clashes.length === 1 ? "" : "s"} in these
                  rows
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {hardIssues.slice(0, 12).map((issue, i) => (
                    <li key={`h${i}`}>
                      <span className="font-medium capitalize">
                        {issue.type.replace(/-/g, " ")}:
                      </span>{" "}
                      {issue.message}
                    </li>
                  ))}
                  {hardIssues.length > 12 && (
                    <li>+ {hardIssues.length - 12} more…</li>
                  )}
                  {clashes.slice(0, 8).map((issue, i) => (
                    <li key={`c${i}`}>
                      <span className="font-medium">Clash:</span>{" "}
                      {issue.message}
                    </li>
                  ))}
                  {clashes.length > 8 && <li>+ {clashes.length - 8} more…</li>}
                </ul>
                <p className="mt-1 opacity-80">
                  {hardIssues.length
                    ? "Fix duplicates and unreadable rows above before publishing."
                    : "Clashes are the real v1 schedule — publish anyway if genuine."}
                </p>
              </div>
            )}
            {kind === "timetable" && ttIssues.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <div className="font-semibold">
                  ⚠ {ttIssues.length} overlapping time slot
                  {ttIssues.length === 1 ? "" : "s"} inside these rows
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {ttIssues.slice(0, 12).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                  {ttIssues.length > 12 && (
                    <li>+ {ttIssues.length - 12} more…</li>
                  )}
                </ul>
                <p className="mt-1 opacity-80">
                  One class section is booked twice at the same time — fix the
                  times above, or publish anyway if genuinely intended (e.g.
                  shared labs).
                </p>
              </div>
            )}
            {kind === "datesheet" && examRows.length === 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                No exam rows yet — paste JSON above, import the built-in v1
                datesheet, or read a PDF.
              </div>
            )}
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="p-2">#</th>
                  {keys.map((key) => (
                    <th key={key} className="p-2 capitalize">
                      {key}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t border-border">
                    <td className="p-2 text-muted-foreground">{index + 1}</td>
                    {keys.map((key) => (
                      <td key={key} className="p-1">
                        <input
                          value={
                            Array.isArray(row[key])
                              ? (row[key] as unknown[]).join(", ")
                              : String(row[key] ?? "")
                          }
                          onChange={(e) => edit(index, key, e.target.value)}
                          className="w-full min-w-24 rounded border border-transparent bg-transparent px-1.5 py-1 focus:border-input focus:bg-background"
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove row"
                        onClick={() =>
                          setRows((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
