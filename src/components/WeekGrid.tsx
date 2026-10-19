import { Fragment } from "react";
import { DAY_FULL, fmt12, toMin, type Picked } from "@/lib/timetable";
import {
  buildGridLayout,
  fmtMin,
  ampm,
  type GridCell,
} from "@/lib/timetable-layout";

const tone = (n: number) => `var(--course-${n + 1})`;

function ClassCard({ c, compact = false }: { c: GridCell; compact?: boolean }) {
  const { pick: p, session: s, clash } = c;
  const ink = clash ? "var(--destructive)" : tone(c.color);
  return (
    <div
      className="tt-card group flex h-full flex-col gap-0.5 rounded-lg border-l-4 px-2.5 py-2 text-left shadow-xs transition-shadow hover:shadow-md"
      style={{
        borderColor: `color-mix(in oklab, ${ink} 60%, transparent)`,
        borderLeftWidth: 4,
        background: clash
          ? `repeating-linear-gradient(135deg, color-mix(in oklab, ${ink} 8%, var(--card)) 0 6px, color-mix(in oklab, ${ink} 16%, var(--card)) 6px 12px)`
          : `color-mix(in oklab, ${ink} 7%, var(--card))`,
        outline: clash
          ? `1px solid color-mix(in oklab, ${ink} 55%, transparent)`
          : `1px solid color-mix(in oklab, ${ink} 22%, var(--border))`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono text-[11px] font-bold tracking-tight"
          style={{ color: ink }}
        >
          {p.code}
        </span>
        <span className="flex shrink-0 gap-1">
          {s.kind === "lab" && (
            <span className="rounded-sm border border-border bg-card px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lab
            </span>
          )}
          {clash && (
            <span className="rounded-sm bg-destructive px-1 text-[9px] font-bold uppercase tracking-wide text-destructive-foreground">
              Clash
            </span>
          )}
        </span>
      </div>
      <div
        className={`font-semibold leading-snug text-foreground ${
          compact ? "text-[13px]" : "text-[12.5px]"
        }`}
      >
        {p.title}
      </div>
      <div className="mt-auto space-y-0 pt-1.5 text-[10.5px] leading-tight text-muted-foreground">
        <div className="font-mono font-semibold tabular-nums text-foreground/75">
          {fmt12(s.start)}–{fmt12(s.end)}
        </div>
        <div className="truncate">
          {s.room ? (
            <span className="font-medium text-foreground/70">{s.room}</span>
          ) : (
            <span className="italic">Room TBA</span>
          )}
          <span className="opacity-50"> · </span>
          {p.cls}
        </div>
        {s.instructor && (
          <div className="truncate opacity-80" title={s.instructor}>
            {s.instructor}
          </div>
        )}
      </div>
    </div>
  );
}

export function WeekGrid({
  picks,
  title,
  subtitle,
}: {
  picks: Picked[];
  clashSids?: Set<string>;
  title?: string;
  subtitle?: string;
}) {
  const g = buildGridLayout(picks);
  if (!g.days.length) return null;

  // Compact template: course columns keep a readable minimum; free gaps shrink
  // aggressively so the grid concentrates on where classes actually live.
  const template = `104px ${g.cols
    .map((c) => {
      const d = c.end - c.start;
      return c.free
        ? `minmax(18px, ${Math.min(d, 40)}fr)`
        : `minmax(${Math.max(72, Math.round(d * 0.9))}px, ${d}fr)`;
    })
    .join(" ")}`;

  let row = 2;
  return (
    <div className="tt-print space-y-3">
      <div className="hidden print:flex items-end justify-between border-b-2 border-foreground pb-2">
        <div>
          <div className="text-lg font-bold">
            {title ?? "My weekly class timetable"}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          CampusEase · printed {new Date().toLocaleDateString("en-GB")}
        </div>
      </div>

      {/* Desktop + print: days down, time slots across */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block print:block print:overflow-visible print:rounded-none print:border-foreground/40">
        <div
          className="grid min-w-max print:min-w-0"
          style={{ gridTemplateColumns: template }}
        >
          {/* corner cell */}
          <div
            className="sticky left-0 z-20 border-b border-r border-border bg-muted px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            style={{ gridRow: 1, gridColumn: 1 }}
          >
            Time
          </div>
          {g.cols.map((c, i) => (
            <div
              key={i}
              className={`border-b border-l border-border px-1.5 py-1.5 text-center ${c.free ? "bg-muted/40" : "bg-muted"}`}
              style={{ gridRow: 1, gridColumn: i + 2 }}
            >
              {c.free ? (
                <span className="text-[8.5px] uppercase tracking-wide text-muted-foreground/60">
                  gap
                </span>
              ) : (
                <div className="leading-tight">
                  <div className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-foreground">
                    {fmtMin(c.start)}–{fmtMin(c.end)}
                  </div>
                  <div className="text-[8.5px] uppercase tracking-wide text-muted-foreground">
                    {c.start < 720 && c.end <= 720
                      ? "AM"
                      : c.start >= 720 || c.end > 720
                        ? "PM"
                        : ""}
                  </div>
                </div>
              )}
            </div>
          ))}

          {g.rows.map(({ day, lanes }, ri) => {
            const top = row;
            row += lanes.length;
            const zebra = ri % 2 ? "bg-muted/20" : "";
            const laneRows = lanes.length;
            return (
              <Fragment key={day}>
                {/* day cell */}
                <div
                  className={`sticky left-0 z-10 flex flex-col justify-center border-r border-t border-border bg-card px-3 py-2 ${zebra}`}
                  style={{
                    gridRow: `${top} / span ${laneRows}`,
                    gridColumn: 1,
                  }}
                >
                  <div className="text-[13px] font-bold text-foreground">
                    {DAY_FULL[day]}
                  </div>
                  <div className="text-[9.5px] text-muted-foreground">
                    {lanes.flat().length} class
                    {lanes.flat().length === 1 ? "" : "es"}
                  </div>
                </div>
                {/* background cells keep the grid lines visible */}
                {Array.from({ length: laneRows }).flatMap((_, li) =>
                  g.cols.map((c, ci) => (
                    <div
                      key={`${li}-${ci}`}
                      className={`border-l border-border ${li === 0 ? "border-t" : ""} ${c.free ? "tt-free" : zebra}`}
                      style={{ gridRow: top + li, gridColumn: ci + 2 }}
                    />
                  )),
                )}
                {/* class cards */}
                {lanes.map((lane, li) =>
                  lane.map((c) => (
                    <div
                      key={c.session.sid}
                      className="p-1"
                      style={{
                        gridRow: top + li,
                        gridColumn: `${c.col + 2} / span ${c.span}`,
                      }}
                    >
                      <ClassCard c={c} />
                    </div>
                  )),
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Phones: one day at a time, same cards */}
      <div className="space-y-3 md:hidden print:hidden">
        {g.rows.map(({ day, lanes }) => (
          <div key={day}>
            <div className="mb-1.5 flex items-baseline justify-between border-b border-border pb-1">
              <span className="text-sm font-bold">{DAY_FULL[day]}</span>
              <span className="text-[11px] text-muted-foreground">
                {lanes.flat().length} class
                {lanes.flat().length === 1 ? "" : "es"}
              </span>
            </div>
            <div className="space-y-2">
              {lanes
                .flat()
                .sort((a, b) => toMin(a.session.start) - toMin(b.session.start))
                .map((c) => (
                  <ClassCard key={c.session.sid} c={c} compact />
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Course key — useful on paper */}
      <div className="rounded-lg border border-border print:break-inside-avoid">
        <div className="border-b border-border bg-muted px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Courses ({picks.length})
        </div>
        <div className="grid gap-x-6 gap-y-1 p-3 text-xs sm:grid-cols-2 print:grid-cols-2">
          {picks.map((p, i) => (
            <div key={p.id} className="flex min-w-0 items-baseline gap-2">
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: tone(i % 8) }}
              />
              <span className="font-mono font-bold">{p.code}</span>
              <span className="min-w-0 flex-1">{p.title}</span>
              <span className="shrink-0 text-muted-foreground">{p.cls}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="hidden text-[10px] text-muted-foreground print:block">
        Always double-check with your department's official timetable. ·
        CampusEase
      </p>
    </div>
  );
}
