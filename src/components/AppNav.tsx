import { useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

const base =
  "px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap";
const active = { className: "bg-primary text-primary-foreground" };
const inactive = {
  className: "text-muted-foreground hover:text-foreground hover:bg-muted",
};

export function AppNav() {
  const navigate = useNavigate();
  const buffer = useRef("");

  // Unlisted owner access: type "admin" anywhere on the page to go to sign-in.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key.length !== 1 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable))
      )
        return;
      buffer.current = (buffer.current + event.key.toLowerCase()).slice(-5);
      if (buffer.current === "admin") {
        buffer.current = "";
        navigate({ to: "/auth", search: { redirect: "/admin" } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <nav className="sticky top-0 z-40 bg-card/80 backdrop-blur border-b border-border print:hidden">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="font-semibold tracking-tight">
          Campus<span className="text-primary">Ease</span>
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          <Link
            to="/classes"
            className={base}
            activeProps={active}
            inactiveProps={inactive}
          >
            Class timetable
          </Link>
          <Link
            to="/exams"
            className={base}
            activeProps={active}
            inactiveProps={inactive}
          >
            Exams
          </Link>
          <Link
            to="/contact"
            className={base}
            activeProps={active}
            inactiveProps={inactive}
          >
            Contact
          </Link>
        </div>
      </div>
    </nav>
  );
}
