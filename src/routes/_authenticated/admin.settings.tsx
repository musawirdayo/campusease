import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  type AiSettingsView,
  getAiSettings,
  saveAiSettings,
  testAi,
} from "@/lib/ai-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [{ title: "AI parser settings — CampusEase" }],
  }),
  component: AiSettingsPage,
});

function cardInput(
  inputProps: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, ...input } = inputProps;
  return (
    <label className="mt-3 block text-xs font-medium">
      {label}
      <input
        {...input}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function AiSettingsPage() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [form, setForm] = useState({ apiKey: "", baseUrl: "", model: "" });
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<string | null>(null);

  function load() {
    getAiSettings()
      .then((v) => setView(v as AiSettingsView))
      .catch(() => setView(null));
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setTest(null);
    try {
      await saveAiSettings({
        data: {
          apiKey: form.apiKey || undefined,
          baseUrl: form.baseUrl || undefined,
          model: form.model || undefined,
        },
      });
      toast.success("AI settings saved");
      setForm({ apiKey: "", baseUrl: "", model: "" });
      load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save AI settings",
      );
    }
    setBusy(false);
  }

  async function runTest() {
    setBusy(true);
    setTest(null);
    try {
      const r = await testAi();
      setTest(r.ok ? `Connection OK — model replied “${r.sample}”` : r.error);
      load();
    } catch (error) {
      setTest(error instanceof Error ? error.message : "Test failed");
    }
    setBusy(false);
  }

  const status = !view
    ? { text: "Could not load settings", cls: "bg-muted text-muted-foreground" }
    : view.configuredInEnvironment
      ? {
          text: "Active · environment config",
          cls: "bg-primary/10 text-primary",
        }
      : view.configuredInDatabase
        ? {
            text: "Active · database config",
            cls: "bg-primary/10 text-primary",
          }
        : { text: "Not configured", cls: "bg-muted text-muted-foreground" };

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-primary" /> AI parser configuration
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
        >
          {status.text}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Used to read uploaded timetable/datesheet PDFs. Any OpenAI-compatible
        endpoint works. The key is stored server-side only.
      </p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {cardInput({
          label: "Base URL",
          type: "url",
          placeholder: "https://api.openai.com/v1",
          value: form.baseUrl,
          onChange: (e) => setForm((f) => ({ ...f, baseUrl: e.target.value })),
        })}
        {cardInput({
          label: `API key ${view?.keyMasked ? `(saved: ${view.keyMasked})` : ""}`,
          type: "password",
          autoComplete: "off",
          placeholder: "sk-or-v1-…",
          value: form.apiKey,
          onChange: (e) => setForm((f) => ({ ...f, apiKey: e.target.value })),
        })}
        {cardInput({
          label: `Model ${view?.model ? `(current: ${view.model})` : ""}`,
          placeholder: "gpt-4o-mini",
          value: form.model,
          onChange: (e) => setForm((f) => ({ ...f, model: e.target.value })),
        })}
        <div className="flex items-end gap-2">
          <Button size="sm" disabled={busy} onClick={save}>
            <KeyRound /> Save
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={runTest}>
            Test connection
          </Button>
        </div>
      </div>
      {view?.updatedAt && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Last updated {new Date(view.updatedAt).toLocaleString()}
        </p>
      )}
      {test && (
        <p
          className={`mt-2 rounded-md p-2 text-xs ${test.startsWith("Connection OK") ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}
        >
          {test}
        </p>
      )}
    </section>
  );
}
