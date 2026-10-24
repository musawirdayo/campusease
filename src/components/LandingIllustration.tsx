import { Fragment } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import type { ClassSession, Day } from "@/lib/types";

/** Editorial calendar scene built around licensed, finished Humaaans artwork. */
export function LandingIllustration({
  sessions,
  section,
  selectedDay,
  version,
  compact = false,
}: {
  sessions: ClassSession[];
  section: string;
  selectedDay: Day;
  version: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "landing-art-wrap landing-art-wrap--compact"
          : "landing-art-wrap"
      }
    >
      <div
        className={`landing-art${compact ? " landing-art--compact" : ""}`}
        aria-label="Students planning their week with CampusEase"
        role="img"
      >
        <div className="landing-art__wash" />
        <span
          className="landing-art__spark landing-art__spark--one"
          aria-hidden="true"
        >
          ✦
        </span>
        <span
          className="landing-art__spark landing-art__spark--two"
          aria-hidden="true"
        >
          ✦
        </span>
        <div className="landing-art__calendar" aria-hidden="true">
          <div className="landing-art__calendar-head">
            <div>
              <CalendarDays size={16} />
              <span>MY WEEK</span>
            </div>
            <span className="landing-art__week-pill">
              {section} · {version}
            </span>
          </div>
          <div className="landing-art__days">
            {(
              [
                ["Mon", "MON"],
                ["Tue", "TUE"],
                ["Wed", "WED"],
                ["Thu", "THU"],
                ["Fri", "FRI"],
                ["Sat", "SAT"],
              ] as [Day, string][]
            ).map(([day, label]) => (
              <div className={day === selectedDay ? "is-today" : ""} key={day}>
                <span>{label}</span>
                <b>{day === selectedDay ? "✓" : "·"}</b>
              </div>
            ))}
          </div>
          <div className="landing-art__schedule">
            {sessions.map((session, i) => (
              <Fragment key={session.code + session.start}>
                <div className="landing-art__time">{session.start}</div>
                <div
                  className={
                    "landing-art__class landing-art__class--" +
                    ["violet", "gold", "mint"][i % 3]
                  }
                >
                  <b>
                    {session.code} · {session.title}
                  </b>
                  <span>
                    {session.room}
                    {session.kind === "lab" ? " · Lab" : ""}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
          <div className="landing-art__calendar-foot">
            <span>
              <Clock3 size={13} /> A real {selectedDay} schedule
            </span>
            <i />
          </div>
        </div>
        <img
          className="landing-art__person landing-art__person--left"
          src="/illustrations/humaaans/standing-3.svg"
          alt=""
        />
        <img
          className="landing-art__person landing-art__person--right"
          src="/illustrations/humaaans/standing-15.svg"
          alt=""
        />
        <img
          className="landing-art__person landing-art__person--seated"
          src="/illustrations/humaaans/sitting-2.svg"
          alt=""
        />
      </div>
      <p className="landing-art__credit">
        Illustration by{" "}
        <a href="https://www.pablostanley.com/">Pablo Stanley</a>
        {" · "}
        <a href="https://github.com/Calinou/humaaans">Humaaans</a> (CC BY 4.0) ·
        CampusEase palette adaptation
      </p>
    </div>
  );
}
