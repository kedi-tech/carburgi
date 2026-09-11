import type { Account, Station } from "./types";

/**
 * Which station does this account speak for?
 *
 * The API cannot say. `GET /admin/accounts` returns a bare `Account`; the link
 * to a station lives in `StationMembership`, and no admin route reads it (gap
 * A2 in `docs/admin-flow.md`). So the console infers it from the login code.
 *
 * What the live server actually mints, observed on 2026-09-11: an account
 * created from this console gets the station's `slug` **verbatim** as its
 * login code — `sonap-116269` for the station whose slug is `sonap-116269`.
 * That is why the match is "the code *is* the slug, or the slug followed by a
 * dash and more" — and not "strip the trailing digits", which turned
 * `sonap-116269` into `sonap` and lost every real account.
 *
 * `loginCode` is unique in the schema, and the admin route derives it from the
 * slug, so that route can create at most one account per station. Any further
 * accounts for a station come from the team registering itself in the app.
 */

export type StationLink =
  /** Exactly one station's slug fits this code. */
  | { kind: "matched"; station: Station }
  /** No code, or a code fitting nothing in the catalogue. */
  | { kind: "unresolved"; reason: string };

/** Does this login code belong to this station? */
export function codeMatches(loginCode: string, slug: string): boolean {
  const code = loginCode.trim().toLowerCase();
  const key = slug.trim().toLowerCase();
  return key.length > 0 && (code === key || code.startsWith(`${key}-`));
}

export function linkStation(account: Account, stations: Station[]): StationLink {
  if (!account.loginCode) {
    return { kind: "unresolved", reason: "Ce compte ne porte aucun code station." };
  }

  const code = account.loginCode;
  const candidates = stations.filter((station) => codeMatches(code, station.slug));

  if (candidates.length === 0) {
    return {
      kind: "unresolved",
      reason: `Aucune station du catalogue ne correspond au code « ${code} ».`,
    };
  }

  // Slugs are unique, so at most one station matches exactly. Several can
  // match as a prefix ("sonap" and "sonap-116269" both start "sonap-116269-…");
  // the longest slug is the most specific and the one meant.
  const exact = candidates.find((station) => station.slug.toLowerCase() === code.toLowerCase());
  if (exact) {
    return { kind: "matched", station: exact };
  }
  const longest = [...candidates].sort((a, b) => b.slug.length - a.slug.length)[0];
  return { kind: "matched", station: longest };
}

/** Every station account whose code fits this station. */
export function accountsForStation(station: Station, accounts: Account[]): Account[] {
  return accounts.filter(
    (account) =>
      account.role === "STATION" &&
      account.status !== "DELETED" &&
      typeof account.loginCode === "string" &&
      codeMatches(account.loginCode, station.slug),
  );
}

/**
 * Another account already speaking for the same station. Two people claiming
 * one station is the case where a careless approval hands control of a public
 * status to a stranger, so it is surfaced before the decision, not after.
 */
export function findRivalAccounts(
  account: Account,
  link: StationLink,
  accounts: Account[],
): Account[] {
  if (link.kind !== "matched") {
    return [];
  }
  return accountsForStation(link.station, accounts).filter(
    (candidate) => candidate.id !== account.id,
  );
}
