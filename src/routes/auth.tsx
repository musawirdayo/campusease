import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/admin",
  }),
  head: () => ({
    meta: [
      { title: "Owner sign in — CampusEase" },
      {
        name: "description",
        content: "Private owner access for CampusEase schedule publishing.",
      },
      { property: "og:title", content: "Owner sign in — CampusEase" },
      {
        property: "og:description",
        content: "Private owner access for CampusEase schedule publishing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "create">("in");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (!result.data.session)
      return setMessage(
        "Check your email to confirm the owner account, then sign in.",
      );
    const safe =
      redirect.startsWith("/") && !redirect.startsWith("//")
        ? redirect
        : "/admin";
    navigate({ to: safe });
  }
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-md px-5 py-16">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LockKeyhole />
        </div>
        <p className="text-xs font-semibold uppercase text-primary">
          Private owner area
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {mode === "in" ? "Welcome back" : "Create owner access"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only the registered CampusEase owner can publish department schedules.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2.5"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2.5"
            />
          </label>
          {message && (
            <p className="rounded-md bg-muted p-3 text-sm">{message}</p>
          )}
          <Button className="w-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "in"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>
        <Button
          variant="link"
          className="mt-3 px-0"
          onClick={() => setMode(mode === "in" ? "create" : "in")}
        >
          {mode === "in"
            ? "First time? Create owner access"
            : "Already registered? Sign in"}
        </Button>
      </main>
    </div>
  );
}
