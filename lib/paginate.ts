/**
 * Pagination over lists the console already holds.
 *
 * The API paginates nothing (`docs/admin-flow.md`, gap A4): every list route
 * returns its whole table in one payload. So the pages are cut here, after the
 * read, and the page number lives in the URL — a link to page 7 of the
 * catalogue survives a refresh, a share, and the back button.
 */

export type Page<T> = {
  rows: T[];
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based positions of the first and last row shown, for "1–25 sur 277". */
  from: number;
  to: number;
  size: number;
};

/** Reads `?page=` off a search param; anything unusable is page one. */
export function parsePage(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function paginate<T>(items: T[], requested: number, size: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  // A stale link to a page that no longer exists lands on the last one rather
  // than on an empty table.
  const page = Math.min(Math.max(1, requested), pageCount);
  const start = (page - 1) * size;
  const rows = items.slice(start, start + size);

  return {
    rows,
    page,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
    size,
  };
}

/**
 * Which page numbers to draw: always the first and last, a window around the
 * current one, and `null` where a run was skipped — "1 … 6 7 8 … 70".
 */
export function pageWindow(page: number, pageCount: number, radius: number = 1): (number | null)[] {
  if (pageCount <= 2 * radius + 5) {
    return Array.from({ length: pageCount }, (_unused, index) => index + 1);
  }

  const keep = new Set<number>([1, pageCount]);
  for (let candidate = page - radius; candidate <= page + radius; candidate += 1) {
    if (candidate >= 1 && candidate <= pageCount) {
      keep.add(candidate);
    }
  }
  // Never leave a single number hidden behind an ellipsis: "1 … 3" is silly
  // when "1 2 3" costs the same width.
  if (page - radius === 3) {
    keep.add(2);
  }
  if (page + radius === pageCount - 2) {
    keep.add(pageCount - 1);
  }

  const sorted = [...keep].sort((a, b) => a - b);
  const output: (number | null)[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0 && sorted[index] - sorted[index - 1] > 1) {
      output.push(null);
    }
    output.push(sorted[index]);
  }
  return output;
}
