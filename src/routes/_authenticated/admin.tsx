import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { BookOpenCheck, KeyRound, LogOut, Mail } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const NAV_ITEMS = [
  {
    to: "/admin" as const,
    icon: BookOpenCheck,
    label: "Publisher",
    desc: "Upload, review and publish schedules",
  },
  {
    to: "/admin/settings" as const,
    icon: KeyRound,
    label: "AI parser",
    desc: "Endpoint, model and credentials",
  },
  {
    to: "/admin/messages" as const,
    icon: Mail,
    label: "Contact inbox",
    desc: "Messages from the public form",
  },
];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Owner workspace — CampusEase" },
      {
        name: "description",
        content: "Private CampusEase schedule review and publishing area.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">
              Owner workspace
            </p>
            <h1 className="mt-1 text-3xl font-semibold">Admin</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Publish schedules, configure the AI parser, and read contact
              messages.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({
                to: "/auth",
                search: { redirect: "/admin" },
                replace: true,
              });
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>

        <nav className="mt-6 grid gap-2 sm:grid-cols-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-lg border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-primary/5 data-[active=true]:border-primary/40 data-[active=true]:bg-primary/5"
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-2 font-semibold">
                    <item.icon className="size-4 text-primary" />
                    {item.label}
                    {isActive && (
                      <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                        current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.desc}
                  </p>
                </>
              )}
            </Link>
          ))}
        </nav>

        <Outlet />
      </main>
    </div>
  );
}
