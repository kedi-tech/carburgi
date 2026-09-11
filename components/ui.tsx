import type { ReactNode } from "react";

import Icon from "./icon";

/**
 * The console's shared furniture, built to the CARBUGUI Back-Office Core spec:
 * flat white containers on a tinted canvas, crisp 1px outlines instead of
 * shadows, 4px radii, and status carried by tint rather than by weight.
 */

/* ------------------------------------------------------------------ Tone */

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

/** Status chips: tinted fill, matching border, dark readable text. */
const CHIP_TONES: Record<Tone, string> = {
  good: "bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46]",
  warn: "bg-secondary-fixed/60 border-secondary-fixed-dim text-on-secondary-fixed-variant",
  bad: "bg-error-container border-[#fecaca] text-on-error-container",
  info: "bg-surface-container-low border-surface-container-highest text-on-primary-fixed-variant",
  neutral: "bg-surface-container-low border-outline-variant text-on-surface-variant",
};

/* --------------------------------------------------------------- Headers */

/**
 * The white band at the top of every page. The eyebrow says which regulatory
 * surface this is, the actions sit opposite the title.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-outline-variant/40 bg-surface-container-lowest px-6 py-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-96 bg-gradient-to-l from-surface-container-low to-transparent"
      />
      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-surface-container-high px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
              {eyebrow}
            </span>
            {badge}
          </div>
          <h1 className="mt-1 font-display text-headline-lg text-on-surface">{title}</h1>
          {description ? (
            <p className="mt-0.5 max-w-3xl text-body-md text-outline">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

/** Section title inside the canvas. */
export function SectionHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
          {icon ? <Icon name={icon} size={20} className="text-secondary" /> : null}
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-body-sm text-outline">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- Surfaces */

export function Card({
  children,
  className = "",
  padded = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded border border-outline-variant/40 bg-surface-container-lowest ${
        padded ? "p-4" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The blue note the design puts under a page title to state the rule a screen
 * enforces. Used for regulatory context, never for decoration.
 */
export function NoteBanner({
  icon = "policy",
  title,
  children,
  aside,
}: {
  icon?: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded border border-surface-container-highest bg-surface-container-low px-4 py-3">
      <Icon name={icon} size={20} className="mt-0.5 text-secondary" />
      <div className="min-w-0 flex-1">
        <p className="text-label-md font-semibold text-on-surface">{title}</p>
        <p className="mt-0.5 text-body-sm leading-relaxed text-on-surface-variant">{children}</p>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Stats */

/** A single figure with its label and one line of context. */
export function StatCard({
  label,
  value,
  unit,
  hint,
  badge,
  tone = "neutral",
  footer,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  badge?: { text: string; tone: Tone };
  tone?: Tone;
  footer?: ReactNode;
}) {
  const valueTone =
    tone === "good"
      ? "text-on-tertiary-container"
      : tone === "warn"
        ? "text-secondary"
        : tone === "bad"
          ? "text-error"
          : "text-on-surface";

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        {badge ? <Chip tone={badge.tone}>{badge.text}</Chip> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`font-display text-display tnum ${valueTone}`}>{value}</span>
        {unit ? <span className="text-body-md text-outline">{unit}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-body-sm text-outline">{hint}</p> : null}
      {footer ? (
        <div className="mt-auto border-t border-outline-variant/30 pt-2 text-body-sm text-outline">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------------- Chips */

export function Chip({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1.5 text-label-sm font-semibold ${CHIP_TONES[tone]}`}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Tables */

/**
 * Tables are the one thing allowed to scroll sideways. The header is sticky so
 * a long catalogue keeps its column keys while it scrolls.
 */
export function TableShell({
  children,
  minWidth = 760,
}: {
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded border border-outline-variant/40 bg-surface-container-lowest">
      <table className="w-full border-collapse text-body-md" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`sticky top-0 z-10 h-9 border-b border-surface-dim bg-surface-container-low px-3 text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`border-b border-surface-container-low px-3 py-2.5 align-middle ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** Zebra striping is prohibited by the spec; rows lift on hover instead. */
export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <tr className={`transition-colors hover:bg-surface-container-low/70 ${className}`}>{children}</tr>;
}

/* --------------------------------------------------------- Empty & error */

export function EmptyState({ icon = "inbox", children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-10 text-center">
      <Icon name={icon} size={28} className="text-outline-variant" />
      <p className="max-w-md text-body-sm text-outline">{children}</p>
    </div>
  );
}

/** Shown when a read fails: the console says what broke, not just "erreur". */
export function ErrorState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded border border-[#fecaca] bg-error-container px-4 py-3">
      <Icon name="error" size={20} className="mt-0.5 text-error" />
      <div>
        <p className="text-label-md font-semibold text-on-error-container">{title}</p>
        <p className="mt-0.5 text-body-sm leading-relaxed text-on-error-container/80">{children}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Bars */

/** A 0–1 ratio drawn as a bar. `null` means nobody has declared anything yet. */
export function RateBar({ rate, width = 96 }: { rate: number | null; width?: number }) {
  if (rate === null) {
    return <span className="text-body-sm text-outline">non renseigné</span>;
  }
  const percentage = Math.round(rate * 100);
  const tone =
    rate >= 0.6 ? "bg-[#10b981]" : rate >= 0.3 ? "bg-secondary-container" : "bg-error";

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="w-12 text-right text-data tnum font-semibold text-on-surface">
        {percentage}%
      </span>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-container-high"
        style={{ width }}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Forms */

export const inputClass =
  "h-[34px] w-full rounded border border-surface-dim bg-surface-container-lowest px-2.5 text-body-md text-on-surface outline-none transition placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-container/20";

export const selectClass = `${inputClass} pr-8`;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label-md font-semibold text-on-surface-variant">{label}</span>
      {children}
      {hint ? <span className="text-body-sm text-outline">{hint}</span> : null}
    </label>
  );
}

/* --------------------------------------------------------------- Buttons */

export const buttonTones = {
  primary:
    "bg-primary-container text-on-primary hover:bg-primary disabled:opacity-50 border border-transparent",
  accent:
    "bg-secondary-container text-on-secondary-fixed hover:bg-secondary-fixed-dim disabled:opacity-50 border border-transparent",
  ghost:
    "bg-surface-container-lowest text-on-surface border border-surface-dim hover:bg-surface-container-low disabled:opacity-50",
  danger:
    "bg-surface-container-lowest text-error border border-[#fecaca] hover:bg-error-container disabled:opacity-50",
  solidDanger: "bg-error text-on-error hover:bg-on-error-container border border-transparent",
} as const;

export type ButtonTone = keyof typeof buttonTones;

export const buttonClass = (tone: ButtonTone = "ghost") =>
  `inline-flex h-[34px] items-center justify-center gap-1.5 rounded px-3 text-label-md font-semibold transition-colors active:scale-[0.98] ${buttonTones[tone]}`;

/** A plain link styled as a button — for navigation, not for decisions. */
export function LinkButton({
  href,
  children,
  tone = "ghost",
  icon,
}: {
  href: string;
  children: ReactNode;
  tone?: ButtonTone;
  icon?: string;
}) {
  return (
    <a href={href} className={buttonClass(tone)}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </a>
  );
}
