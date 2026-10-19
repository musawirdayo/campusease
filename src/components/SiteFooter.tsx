import { useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

export const CONTACT = {
  phone: "03391789786",
  email: "abdulmusawirdayo35@gmail.com",
};

export function SiteFooter() {
  const navigate = useNavigate();
  const taps = useRef<number[]>([]);

  // Unlisted owner access: three quick clicks on the tiny dot open sign-in.
  function secretTap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1200), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      navigate({ to: "/auth", search: { redirect: "/admin" } });
    }
  }

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
        </nav>
        <button
          onClick={secretTap}
          aria-label="Owner access"
          className="absolute left-1/2 top-0.5 -ml-1 size-1.5 rounded-full bg-border/50 opacity-60 transition hover:opacity-100 hover:bg-primary/50"
        />
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
            className="rounded-md bg-primary text-primary-foreground px-3 py-2 font-medium hover:opacity-90"
          >
            WhatsApp {CONTACT.phone}
          </a>
          <a
            href={`mailto:${CONTACT.email}?subject=CampusEase%20-%20timetable%2Fdatesheet`}
            className="rounded-md border border-input px-3 py-2 hover:bg-muted"
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
