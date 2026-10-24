/**
 * CampusEase illustration system.
 *
 * One coherent flat-vector style, used everywhere:
 *  - fills and strokes come only from the design tokens (var(--...) in CSS),
 *    so artwork automatically matches light and night themes;
 *  - no outlines — depth comes from the darker brand inks (#deep / primary);
 *  - geometry is chibi-consistent: one head size, rounded bodies, dot eyes +
 *    smile arc, same corner radii;
 *  - motion lives on individual `.ill-*` groups (float / bob / sway), avoids
 *    whole-canvas animation, and collapses to static under
 *    prefers-reduced-motion (see styles.css).
 *
 * Artwork is decorative: every export is hidden from assistive tech by
 * default; pass `label` when a figure has no adjacent text describing it.
 */

const LINE = "var(--border)";

/* Shared little pieces ---------------------------------------------------- */

function Sparkle({
  x,
  y,
  size,
  fill,
  className,
}: {
  x: number;
  y: number;
  size: number;
  fill: string;
  className?: string;
}) {
  const s = size;
  return (
    <path
      className={className}
      d={`M ${x} ${y - s} C ${x + s * 0.18} ${y - s * 0.3} ${x + s * 0.3} ${y - s * 0.18} ${x + s} ${y} C ${x + s * 0.3} ${y + s * 0.18} ${x + s * 0.18} ${y + s * 0.3} ${x} ${y + s} C ${x - s * 0.18} ${y + s * 0.3} ${x - s * 0.3} ${y + s * 0.18} ${x - s} ${y} C ${x - s * 0.3} ${y - s * 0.18} ${x - s * 0.18} ${y - s * 0.3} ${x} ${y - s} Z`}
      fill={fill}
    />
  );
}

function ClockFace({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r + 7} fill="var(--secondary)" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--card)"
        stroke="var(--deep)"
        strokeWidth={2.5}
      />
      <line
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy - r * 0.62}
        stroke="var(--deep)"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <line
        x1={cx}
        y1={cy}
        x2={cx + r * 0.45}
        y2={cy + r * 0.18}
        stroke="var(--primary)"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={2.6} fill="var(--primary)" />
    </>
  );
}

/* Hero scene --------------------------------------------------------------- */

export function HeroScene({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 560 400"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {/* backdrop blobs */}
      <ellipse
        cx={280}
        cy={225}
        rx={262}
        ry={168}
        fill="var(--secondary)"
        opacity={0.8}
      />
      <circle cx={64} cy={92} r={30} fill="var(--secondary)" />
      <circle cx={512} cy={330} r={22} fill="var(--secondary)" />

      {/* the weekly calendar card */}
      <g className="ill-s1">
        <rect
          x={152}
          y={64}
          width={272}
          height={196}
          rx={18}
          fill="var(--card)"
          stroke={LINE}
          strokeWidth={2}
        />
        {/* header strip */}
        <path
          d="M152 82 a18 18 0 0 1 18 -18 h236 a18 18 0 0 1 18 18 v14 h-272 z"
          fill="var(--primary)"
        />
        <circle cx={172} cy={80} r={4} fill="var(--warm)" />
        <circle cx={186} cy={80} r={4} fill="var(--card)" opacity={0.55} />
        <rect
          x={206}
          y={73}
          width={110}
          height={12}
          rx={6}
          fill="var(--card)"
          opacity={0.4}
        />
        {/* noon ring */}
        <ClockFace cx={396} cy={80} r={10} />

        {/* five day columns */}
        {[0, 1, 2, 3, 4].map((col) => {
          const x = 168 + col * 48;
          return (
            <g key={col}>
              <rect
                x={x}
                y={110}
                width={40}
                height={10}
                rx={5}
                fill="var(--muted)"
              />
              {/* sessions: a stable, hand-designed pattern per column */}
              <rect
                x={x}
                y={128}
                width={40}
                height={30}
                rx={8}
                fill={col % 2 ? "var(--lavender)" : "var(--secondary)"}
              />
              <rect
                x={x}
                y={166}
                width={40}
                height={30}
                rx={8}
                fill={
                  col === 2
                    ? "var(--warm)"
                    : col === 4
                      ? "var(--secondary)"
                      : "var(--muted)"
                }
              />
              <rect
                x={x}
                y={204}
                width={40}
                height={30}
                rx={8}
                fill={
                  col === 0
                    ? "var(--warm)"
                    : col === 1
                      ? "var(--muted)"
                      : "var(--secondary)"
                }
              />
              <rect
                x={x}
                y={242}
                width={40}
                height={0}
                rx={4}
                fill="transparent"
              />
            </g>
          );
        })}
      </g>

      {/* Student 1 — left, pointing at the week */}
      <g>
        {/* hair back + head */}
        <circle cx={96} cy={182} r={27} fill="var(--deep)" />
        <circle cx={99} cy={188} r={21} fill="var(--warm)" />
        {/* eyes + smile */}
        <circle cx={92} cy={186} r={2.4} fill="var(--deep)" />
        <circle cx={106} cy={186} r={2.4} fill="var(--deep)" />
        <path
          d="M 93 196 Q 99 201 105 196"
          fill="none"
          stroke="var(--deep)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        {/* body */}
        <rect
          x={76}
          y={210}
          width={40}
          height={54}
          rx={17}
          fill="var(--lavender)"
        />
        {/* raised arm (sleeve) + pointing hand */}
        <line
          x1={104}
          y1={222}
          x2={148}
          y2={196}
          stroke="var(--primary)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <circle cx={154} cy={193} r={7} fill="var(--warm)" />
        {/* resting arm */}
        <line
          x1={82}
          y1={224}
          x2={72}
          y2={248}
          stroke="var(--primary)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* legs + shoes */}
        <rect
          x={83}
          y={258}
          width={11}
          height={38}
          rx={5.5}
          fill="var(--deep)"
        />
        <rect
          x={100}
          y={258}
          width={11}
          height={38}
          rx={5.5}
          fill="var(--deep)"
        />
        <rect
          x={78}
          y={292}
          width={20}
          height={10}
          rx={5}
          fill="var(--primary)"
        />
        <rect
          x={96}
          y={292}
          width={20}
          height={10}
          rx={5}
          fill="var(--primary)"
        />
      </g>

      {/* Student 2 — right, holding the planner */}
      <g className="ill-b1">
        <circle cx={468} cy={188} r={25} fill="var(--warm)" />
        {/* hair + bun */}
        <path
          d="M 443 188 a25 25 0 0 1 50 0 q0 -6 -4 -10 a25 25 0 0 0 -42 0 q-4 4 -4 10 z"
          fill="var(--primary)"
        />
        <circle cx={468} cy={160} r={9} fill="var(--primary)" />
        <circle cx={463} cy={192} r={2.4} fill="var(--deep)" />
        <circle cx={475} cy={192} r={2.4} fill="var(--deep)" />
        <path
          d="M 464 201 Q 469 205 474 201"
          fill="none"
          stroke="var(--deep)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        {/* body */}
        <rect
          x={444}
          y={214}
          width={46}
          height={52}
          rx={17}
          fill="var(--lavender)"
        />
        {/* open planner book */}
        <g className="ill-f2">
          <path
            d="M 430 262 q 14 -8 28 0 v 20 q -14 -8 -28 0 z"
            fill="var(--card)"
            stroke="var(--deep)"
            strokeWidth={2}
          />
          <path
            d="M 486 262 q -14 -8 -28 0 v 20 q 14 -8 28 0 z"
            fill="var(--card)"
            stroke="var(--deep)"
            strokeWidth={2}
          />
          <line
            x1={458}
            y1={261}
            x2={458}
            y2={283}
            stroke="var(--deep)"
            strokeWidth={2}
          />
        </g>
        {/* arms to the planner */}
        <line
          x1={452}
          y1={228}
          x2={441}
          y2={252}
          stroke="var(--deep)"
          strokeWidth={9}
          strokeLinecap="round"
        />
        <line
          x1={484}
          y1={228}
          x2={474}
          y2={252}
          stroke="var(--deep)"
          strokeWidth={9}
          strokeLinecap="round"
        />
        {/* legs + shoes */}
        <rect
          x={452}
          y={264}
          width={11}
          height={34}
          rx={5.5}
          fill="var(--deep)"
        />
        <rect
          x={469}
          y={264}
          width={11}
          height={34}
          rx={5.5}
          fill="var(--deep)"
        />
        <rect
          x={447}
          y={294}
          width={20}
          height={10}
          rx={5}
          fill="var(--primary)"
        />
        <rect
          x={464}
          y={294}
          width={20}
          height={10}
          rx={5}
          fill="var(--primary)"
        />
      </g>

      {/* floating: clock · pencil · stack of books · sparkles */}
      <g className="ill-f1">
        <ClockFace cx={78} cy={62} r={17} />
      </g>
      <g className="ill-f2" transform="rotate(18 508 84)">
        <rect x={490} y={68} width={40} height={13} rx={6} fill="var(--warm)" />
        <path
          d="M 490 68 h 40 l -12 13 h -28 z"
          fill="var(--primary)"
          opacity={0.15}
        />
        <path d="M 497 61 l 6 -3 6 3 v 10 h -12 z" fill="var(--lavender)" />
      </g>
      <g className="ill-b1" transform="rotate(-6 92 332)">
        <rect
          x={64}
          y={318}
          width={54}
          height={12}
          rx={6}
          fill="var(--lavender)"
        />
        <rect x={70} y={306} width={54} height={12} rx={6} fill="var(--warm)" />
        <rect
          x={68}
          y={330}
          width={54}
          height={12}
          rx={6}
          fill="var(--primary)"
        />
      </g>
      <Sparkle x={250} y={44} size={7} fill="var(--warm)" className="ill-f2" />
      <Sparkle
        x={536}
        y={210}
        size={6}
        fill="var(--lavender)"
        className="ill-f1"
      />
      <Sparkle
        x={180}
        y={330}
        size={5}
        fill="var(--primary)"
        className="ill-f1"
      />
    </svg>
  );
}

/* Empty states --------------------------------------------------------------- */

export function CalendarDoodle({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 220 150"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <ellipse cx={110} cy={128} rx={92} ry={14} fill="var(--secondary)" />
      <g className="ill-s1">
        {/* calendar sheet */}
        <rect
          x={44}
          y={26}
          width={132}
          height={92}
          rx={14}
          fill="var(--card)"
          stroke={LINE}
          strokeWidth={2}
        />
        <path
          d="M44 46 a14 14 0 0 1 14 -14 h104 a14 14 0 0 1 14 14 v10 h-132 z"
          fill="var(--primary)"
        />
        <rect x={86} y={18} width={9} height={16} rx={4.5} fill="var(--deep)" />
        <rect
          x={126}
          y={18}
          width={9}
          height={16}
          rx={4.5}
          fill="var(--deep)"
        />
        {/* a mostly-empty week: a few slots, lots of quiet */}
        <rect
          x={58}
          y={66}
          width={30}
          height={22}
          rx={7}
          fill="var(--lavender)"
        />
        <rect
          x={96}
          y={66}
          width={30}
          height={22}
          rx={7}
          fill="var(--secondary)"
        />
        <rect x={134} y={66} width={30} height={22} rx={7} fill="var(--warm)" />
        <rect
          x={58}
          y={94}
          width={30}
          height={22}
          rx={7}
          fill="var(--secondary)"
        />
        <rect x={96} y={94} width={30} height={22} rx={7} fill="var(--muted)" />
        <rect
          x={134}
          y={94}
          width={30}
          height={22}
          rx={7}
          fill="var(--secondary)"
        />
      </g>
      {/* pencil resting above the sheet */}
      <g className="ill-f1" transform="rotate(-24 176 44)">
        <rect x={158} y={38} width={40} height={11} rx={5} fill="var(--warm)" />
        <path d="M 198 38 l 9 5.5 l -9 5.5 z" fill="var(--deep)" />
        <rect
          x={152}
          y={38}
          width={10}
          height={11}
          rx={3}
          fill="var(--lavender)"
        />
      </g>
      <Sparkle
        x={30}
        y={40}
        size={6}
        fill="var(--lavender)"
        className="ill-f2"
      />
      <Sparkle x={200} y={104} size={5} fill="var(--warm)" className="ill-f1" />
    </svg>
  );
}
