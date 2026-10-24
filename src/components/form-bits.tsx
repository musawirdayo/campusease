import * as React from "react";

/** Clear, compact heading used above a tool section. */
export function SectionLabel({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <h2 id={id} className="text-sm font-semibold tracking-wide text-foreground">
      {children}
    </h2>
  );
}

/** Bordered card that holds every tool section, matching the exams page. */
export function SectionCard({
  children,
  label,
  className = "",
}: {
  children: React.ReactNode;
  label?: React.ReactNode;
  className?: string;
}) {
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={label != null ? headingId : undefined}
      className={`rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none sm:p-5 ${className}`}
    >
      {label != null && (
        <div className="mb-4 border-b border-border pb-3">
          <SectionLabel id={headingId}>{label}</SectionLabel>
        </div>
      )}
      {children}
    </section>
  );
}

/** Labelled field wrapper. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1.5 flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {hint && <span className="text-[10px] font-mono">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const CONTROL =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** Consistent text input. */
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${CONTROL} ${className}`} />;
}

/** Consistent select whose onChange yields the value string. */
export function Select({
  value,
  onChange,
  children,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`${CONTROL} ${className}`}
    >
      {children}
    </select>
  );
}

/** Two-state segmented toggle — inset pill per the builder mockup. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      className="flex gap-1 rounded-[10px] border border-border/80 bg-muted/40 p-1"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          disabled={disabled || option.disabled}
          onClick={() => onChange(option.id)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40 ${
            value === option.id
              ? "bg-card text-foreground shadow-sm ring-1 ring-primary/15"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Primary call-to-action button — blue→indigo gradient per the mockups. */
export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`w-full rounded-[10px] bg-gradient-to-br from-indigo-700 via-primary to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transition-none ${className}`}
    >
      {children}
    </button>
  );
}

/** Bordered, transparent action button (the mockup's .gh). */
export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-[10px] border border-input bg-transparent px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}
