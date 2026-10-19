import * as React from "react";

/** Small all-caps label used above card content — the site-wide section marker. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground font-mono">
      {children}
    </div>
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
  return (
    <section
      className={`bg-card border border-border rounded-lg p-4 shadow-sm sm:p-5 ${className}`}
    >
      {label != null && (
        <div className="mb-3">
          <SectionLabel>{label}</SectionLabel>
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
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

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
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${CONTROL} ${className}`}
    >
      {children}
    </select>
  );
}

/** Two-state segmented toggle, matching the exams page mode switcher. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
      {options.map((option, i) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled || option.disabled}
          onClick={() => onChange(option.id)}
          className={`flex-1 px-3 py-2 transition whitespace-nowrap disabled:opacity-40 ${
            i > 0 ? "border-l border-border" : ""
          } ${value === option.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Primary call-to-action button used across tool pages. */
export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}
