import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/** How long the session check may hold the route before we give up and send
 *  the visitor to sign-in instead of a blank, eternally-pending screen.
 *  Auth failures normally resolve in well under a second; a stale/expired
 *  session triggers a token-refresh retry loop in supabase-js that can run
 *  for many seconds against an unreachable network — that must never be
 *  allowed to hang the whole admin area. */
const AUTH_CHECK_TIMEOUT_MS = 10_000;

type GuardResult = { status: "ok" } | { status: "timeout" | "signed-out" };

async function checkSession(): Promise<GuardResult> {
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("auth check timed out")),
          AUTH_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch {
    return { status: "timeout" };
  }
  if (result.data?.user) return { status: "ok" };
  // An unusable stored session (invalid/expired token the refresh loop can't
  // fix) is the most common cause of a put-you-back-to-login loop: drop it so
  // the sign-in form starts clean. Plain "signed out" needs no cleanup.
  const status = (result.error as { status?: number } | null)?.status;
  if (status === 400 || status === 401 || status === 403) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
  return { status: "signed-out" };
}

function CheckingAccess() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 print:hidden">
      <div className="text-center">
        <div
          aria-hidden="true"
          className="mx-auto size-6 animate-spin rounded-full border-2 border-border border-t-primary"
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Checking your access…
        </p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const guard = await checkSession();
    if (guard.status !== "ok")
      throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  // Never a blank screen while the guard does its network round-trip.
  pendingComponent: CheckingAccess,
  pendingMs: 0,
  component: Outlet,
});
