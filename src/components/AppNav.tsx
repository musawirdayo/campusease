import { useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarDays } from "lucide-react";

const linkBase = "app-nav__link";
const active = { className: "app-nav__link is-active" };
const inactive = { className: "app-nav__link" };

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
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-3 top-3 z-[60] rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <nav aria-label="Main navigation" className="app-nav print:hidden">
        <div className="app-nav__inner">
          <Link to="/" className="app-nav__brand" aria-label="CampusEase home">
            <span className="app-nav__mark" aria-hidden="true">
              <CalendarDays className="size-[18px]" strokeWidth={1.8} />
            </span>
            <span className="app-nav__wordmark">
              <strong>
                Campus<span>Ease</span>
              </strong>
            </span>
          </Link>

          <div className="app-nav__links">
            <Link
              to="/classes"
              className={linkBase}
              activeProps={active}
              inactiveProps={inactive}
            >
              <span>Classes</span>
            </Link>
            <Link
              to="/exams"
              className={linkBase}
              activeProps={active}
              inactiveProps={inactive}
            >
              <span>Exams</span>
            </Link>
            <Link
              to="/contact"
              className={linkBase}
              activeProps={active}
              inactiveProps={inactive}
            >
              <span>Contact</span>
            </Link>
          </div>

          <Link to="/classes" className="app-nav__cta">
            <span>Build a timetable</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </nav>
    </>
  );
}
