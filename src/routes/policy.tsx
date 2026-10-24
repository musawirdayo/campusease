import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/AppNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CONTACT } from "@/components/SiteFooter";

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — CampusEase" },
      {
        name: "description",
        content:
          "CampusEase privacy policy: what data the app stores, how long it is kept, and the choices available to you.",
      },
      { property: "og:title", content: "Privacy policy — CampusEase" },
      {
        property: "og:description",
        content:
          "CampusEase privacy policy: what data the app stores, how long it is kept, and the choices available to you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PolicyPage,
});

function PolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main id="main-content" className="mx-auto max-w-2xl px-4 py-8">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Privacy policy" }]}
        />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Privacy policy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last updated: October 2026
        </p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="font-semibold text-foreground">
              What CampusEase stores
            </h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-foreground">
                  Your picks and timetable edits
                </strong>{" "}
                stay in your browser's local storage — they are never uploaded
                unless you publish or generate a PDF.
              </li>
              <li>
                <strong className="text-foreground">
                  Official schedule documents
                </strong>{" "}
                (timetables and datesheets) that the owner publishes, so every
                student can use them.
              </li>
              <li>
                <strong className="text-foreground">Contact messages</strong>{" "}
                you send through the contact form (name, email, message).
              </li>
              <li>
                <strong className="text-foreground">Aggregate counter</strong> —
                an anonymous count that increases each time a weekly schedule or
                exam profile is generated. No identities are attached.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">PDF uploads</h2>
            <p className="mt-1.5">
              When you upload a timetable or datesheet PDF, it is read entirely
              inside your browser. Only the extracted text is sent to the
              automatic reader, and the result is used to build your schedule.
              Uploaded files are not shared with anyone.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">Accounts</h2>
            <p className="mt-1.5">
              Sign-in exists only for the owner account that publishes
              schedules. Students never need an account and never provide
              personal details.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">
              Analytics & cookies
            </h2>
            <p className="mt-1.5">
              The app itself uses no advertising cookies or trackers. Anonymous,
              aggregate usage analytics may be enabled to improve the product;
              this never includes your schedule contents or personal details.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">
              Your data, your control
            </h2>
            <p className="mt-1.5">
              Clearing your browser storage instantly removes your personal
              picks. To remove any published document or contact message,
              contact the owner using the details below.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">Contact</h2>
            <p className="mt-1.5">
              Questions, corrections, data removal:{" "}
              <Link to="/contact" className="text-primary hover:underline">
                use the contact page
              </Link>{" "}
              or email{" "}
              <a
                href={`mailto:${CONTACT.email}`}
                className="text-primary hover:underline"
              >
                {CONTACT.email}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
