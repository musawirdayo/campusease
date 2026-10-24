import { useNavigate } from "@tanstack/react-router";

export const CONTACT = {
  phone: "03391789786",
  email: "abdulmusawirdayo35@gmail.com",
};

export function SiteFooter() {
  return (
    <footer
      id="contact"
      className="border-t border-border bg-card/50 print:hidden"
    >
      <div className="relative mx-auto max-w-6xl px-4 py-8 grid gap-6 sm:grid-cols-[1fr_auto] items-center">
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-x-4 gap-y-1 sm:col-span-2 text-xs"
        >
          <a
            href="/classes"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Class timetable
          </a>
          <a
            href="/exams"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Exam timetable
          </a>
          <a
            href="/contact"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Contact
          </a>
          <a
            href="/policy"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Privacy policy
          </a>
          <a
            href="/auth?redirect=%2Fadmin"
            className="text-muted-foreground/70 hover:text-foreground hover:underline"
          >
            Admin
          </a>
        </nav>
        <div>
          <div className="text-sm font-semibold">
            Your department missing, or something looks wrong?
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-lg">
            Send me your department's timetable or datesheet PDF and I'll add it
            for everyone. Questions are welcome too.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a
            href={`https://wa.me/92${CONTACT.phone.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            WhatsApp {CONTACT.phone}
          </a>
          <a
            href={`mailto:${CONTACT.email}?subject=CampusEase%20-%20timetable%2Fdatesheet`}
            className="rounded-lg border border-input px-3 py-2 transition hover:bg-accent"
          >
            {CONTACT.email}
          </a>
        </div>
        <div className="sm:col-span-2 text-center text-xs text-muted-foreground">
          Made by <span className="font-medium text-foreground">Musawir</span>
        </div>
      </div>
    </footer>
  );
}
