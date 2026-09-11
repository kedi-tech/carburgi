import Link from "next/link";

import Icon from "@/components/icon";
import { pageWindow, type Page } from "@/lib/paginate";

type Query = Record<string, string | undefined>;

/**
 * The footer under a paginated table: "Affichage de 26 à 50 sur 277", then
 * Précédent · 1 … 6 7 8 … 12 · Suivant. Every control is a plain link carrying
 * the page's other filters, so paging never loses a search or a tab.
 *
 * Rendered as nothing when everything fits on one page — a "1 / 1" footer is
 * furniture with no job.
 */
export default function Pagination({
  page,
  pathname,
  query,
  noun = "résultat",
  param = "page",
}: {
  page: Page<unknown>;
  pathname: string;
  /** The current filters; the page parameter is overwritten per link. */
  query: Query;
  /** What a row is — "station", "compte" — for the caption. */
  noun?: string;
  /**
   * The search parameter carrying the page. Two paginated lists on one screen
   * — the history of envois and the recipients of the selected one — each
   * need their own, or paging one would reset the other.
   */
  param?: string;
}) {
  if (page.pageCount <= 1) {
    return null;
  }

  const href = (target: number) => ({
    pathname,
    query: Object.fromEntries(
      Object.entries({ ...query, [param]: target === 1 ? undefined : String(target) }).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    ),
  });

  const numberClass = (active: boolean) =>
    `inline-flex h-8 min-w-8 items-center justify-center rounded border px-2 text-label-md tnum transition-colors ${
      active
        ? "border-primary-container bg-primary-container font-bold text-on-primary"
        : "border-surface-dim bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
    }`;

  const edgeClass = (enabled: boolean) =>
    `inline-flex h-8 items-center gap-1 rounded border px-2.5 text-label-md transition-colors ${
      enabled
        ? "border-surface-dim bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
        : "pointer-events-none border-surface-container-low text-outline-variant"
    }`;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 rounded border border-outline-variant/40 bg-surface-container-lowest px-3 py-2"
    >
      <p className="text-body-sm text-on-surface-variant">
        Affichage de <span className="font-semibold tnum text-on-surface">{page.from}</span> à{" "}
        <span className="font-semibold tnum text-on-surface">{page.to}</span> sur{" "}
        <span className="font-semibold tnum text-on-surface">{page.total}</span> {noun}
        {page.total > 1 ? "s" : ""}
      </p>

      <div className="flex items-center gap-1">
        <Link
          href={href(page.page - 1)}
          aria-disabled={page.page === 1}
          className={edgeClass(page.page > 1)}
        >
          <Icon name="chevron_left" size={16} />
          Précédent
        </Link>

        {pageWindow(page.page, page.pageCount).map((entry, index) =>
          entry === null ? (
            <span
              key={`gap-${index}`}
              className="inline-flex h-8 w-6 items-center justify-center text-outline"
            >
              …
            </span>
          ) : (
            <Link
              key={entry}
              href={href(entry)}
              aria-current={entry === page.page ? "page" : undefined}
              className={numberClass(entry === page.page)}
            >
              {entry}
            </Link>
          ),
        )}

        <Link
          href={href(page.page + 1)}
          aria-disabled={page.page === page.pageCount}
          className={edgeClass(page.page < page.pageCount)}
        >
          Suivant
          <Icon name="chevron_right" size={16} />
        </Link>
      </div>
    </nav>
  );
}
