"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Icon from "@/components/icon";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Urgency counter. Amber for validations, crimson for reports, slate for support. */
  badge?: { count: number; tone: "amber" | "crimson" | "slate" };
  /** A plain figure, not an alert — the catalogue's size, for instance. */
  meta?: string;
};

export type NavGroup = { title: string; items: NavItem[] };

const BADGE_TONES = {
  amber: "bg-secondary-container text-on-secondary-container",
  crimson: "bg-error text-on-error",
  slate: "bg-surface-tint text-on-primary",
} as const;

const ICON_TONES: Record<string, string> = {
  amber: "text-secondary-container",
  crimson: "text-error",
  slate: "text-surface-tint",
};

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {groups.map((group, groupIndex) => (
        <div key={group.title} className="flex flex-col gap-1">
          <div className={groupIndex === 0 ? "px-2 pb-1" : "mt-3 border-t border-outline-variant/20 px-2 pb-1 pt-3"}>
            <span className="text-label-sm font-semibold uppercase tracking-wider text-outline-variant">
              {group.title}
            </span>
          </div>

          {group.items.map((item) => {
            const active = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-2 rounded px-2 py-2 transition-colors ${
                  active
                    ? "bg-surface-container-highest text-on-surface"
                    : "text-inverse-on-surface hover:bg-surface-variant/10 hover:text-white"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon
                    name={item.icon}
                    size={20}
                    className={
                      active
                        ? "text-on-surface"
                        : (item.badge ? ICON_TONES[item.badge.tone] : "text-outline-variant")
                    }
                  />
                  <span className={`truncate text-body-md ${active ? "font-semibold" : ""}`}>
                    {item.label}
                  </span>
                </span>

                {item.badge && item.badge.count > 0 ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-label-sm font-bold tnum ${BADGE_TONES[item.badge.tone]}`}
                  >
                    {item.badge.count}
                  </span>
                ) : item.meta ? (
                  <span
                    className={`text-body-sm tnum ${active ? "text-on-surface-variant" : "text-outline-variant"}`}
                  >
                    {item.meta}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
