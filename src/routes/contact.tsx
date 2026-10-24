import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/components/AppNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { submitContact } from "@/lib/contact.functions";
import { CONTACT } from "@/components/SiteFooter";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — add your department to CampusEase" },
      {
        name: "description",
        content:
          "Send your department's timetable or datesheet PDF, report a mistake, or ask anything about CampusEase.",
      },
      {
        property: "og:title",
        content: "Contact — add your department to CampusEase",
      },
      {
        property: "og:description",
        content:
          "Send your department's timetable or datesheet PDF, report a mistake, or ask anything about CampusEase.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await submitContact({ data: { name, email, message } });
      toast.success("Message sent — it lands straight in the owner's inbox.");
      setSent(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main id="main-content" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Contact" }]}
        />
        <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-[-0.03em]">
          Contact
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Found a mistake in your department's timetable or datesheet? Want your
          department added? Write here — every message reaches the CampusEase
          owner directly.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-5 border-b border-border pb-3">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Send a message
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Include the department and schedule details if you are reporting
              an issue.
            </p>
          </div>
          {sent && (
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm text-primary">
              ✓ Delivered. You'll usually get a reply within a day or two.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate={false}>
            <label className="block text-sm font-medium">
              Name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              Email
              <input
                required
                type="email"
                maxLength={200}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              Message
              <textarea
                required
                minLength={10}
                maxLength={4000}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Department, what's wrong or missing, and (if you can) attach nothing here — describe the issue and send the PDF on WhatsApp."
                className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send message"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Prefer to chat?{" "}
          <a
            href={`https://wa.me/92${CONTACT.phone.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            WhatsApp {CONTACT.phone}
          </a>{" "}
          or email{" "}
          <a
            href={`mailto:${CONTACT.email}`}
            className="text-primary hover:underline"
          >
            {CONTACT.email}
          </a>
          .
        </p>
      </main>
    </div>
  );
}
