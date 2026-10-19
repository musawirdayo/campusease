import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, MailOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  type ContactMessage,
  getContactMessages,
  markContactRead,
} from "@/lib/contact.functions";

export const Route = createFileRoute("/_authenticated/admin/messages")({
  head: () => ({
    meta: [{ title: "Contact inbox — CampusEase" }],
  }),
  component: InboxPage,
});

function InboxPage() {
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);

  function load() {
    getContactMessages()
      .then((m) => setMessages(m as ContactMessage[]))
      .catch(() => setMessages([]));
  }
  useEffect(() => {
    load();
  }, []);

  async function mark(id: string) {
    try {
      await markContactRead({ data: { id } });
      setMessages(
        (current) =>
          current?.map((m) => (m.id === id ? { ...m, read: true } : m)) ?? null,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not mark read",
      );
    }
  }

  const unread = messages?.filter((m) => !m.read).length ?? 0;
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail className="size-4 text-primary" /> Contact inbox
        </h2>
        {unread > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {unread} new
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Messages submitted through the public contact form land here.
      </p>
      <div className="mt-3 max-h-[70vh] space-y-2 overflow-auto pr-1">
        {messages === null && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        {messages?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No messages yet. The form lives at /contact.
          </p>
        )}
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`rounded-md border p-2.5 text-xs ${m.read ? "border-border" : "border-primary/40 bg-primary/5"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {m.name} ·{" "}
                <a
                  href={`mailto:${m.email}`}
                  className="text-primary hover:underline"
                >
                  {m.email}
                </a>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">
                  {new Date(m.created_at).toLocaleString()}
                </span>
                {!m.read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5"
                    onClick={() => mark(m.id)}
                  >
                    <MailOpen /> Mark
                  </Button>
                )}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {m.message}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
