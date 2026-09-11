import type { Account, AccountRole, AccountStatus } from "./types";

/**
 * Who a broadcast goes to. The API takes bare `accountIds`; the audience is
 * the console's vocabulary, resolved against the account list right before
 * the call so that the count shown is the list sent.
 */
export type Audience = "DRIVER" | "STATION" | "BOTH";

/** What the composer offers: the three broadcasts, or a single account. */
export type Target = Audience | "ONE";

export const audienceLabels: Record<Audience, string> = {
  DRIVER: "Conducteurs",
  STATION: "Équipes stations",
  BOTH: "Conducteurs et stations",
};

export function isAudience(value: unknown): value is Audience {
  return value === "DRIVER" || value === "STATION" || value === "BOTH";
}

export function isTarget(value: unknown): value is Target {
  return isAudience(value) || value === "ONE";
}

/**
 * The slice of an account the composer's picker needs — it is sent to the
 * browser, so it carries no more than the row on the Comptes page shows.
 */
export type Person = {
  id: string;
  fullName: string | null;
  phoneNumber: string;
  role: AccountRole;
  status: AccountStatus;
  loginCode: string | null;
};

/**
 * Anyone an individual SMS can go to: a driver or a station team with a
 * number. Status is not a filter here — writing to one suspended team to say
 * why it was suspended is exactly what an individual message is for — but it
 * is shown in the picker so the choice is made knowingly.
 */
export function reachablePeople(accounts: Account[]): Person[] {
  const people: Person[] = [];
  for (const account of accounts) {
    if (account.role === "ADMIN" || account.status === "DELETED" || !account.phoneNumber) {
      continue;
    }
    people.push({
      id: account.id,
      fullName: account.fullName,
      phoneNumber: account.phoneNumber,
      role: account.role,
      status: account.status,
      loginCode: account.loginCode ?? null,
    });
  }
  return people;
}

function rolesOf(audience: Audience): AccountRole[] {
  return audience === "BOTH" ? ["DRIVER", "STATION"] : [audience];
}

/**
 * Active accounts of the chosen role(s) that carry a phone number.
 *
 * Suspended and pending accounts are left out on purpose: a station team
 * that has not been validated yet, or one that was suspended, is not someone
 * the regulator addresses by SMS. Accounts without a number would only come
 * back `SKIPPED`, so they are not counted either — the figure on screen is
 * the number of phones that will ring.
 */
export function audienceRecipients(accounts: Account[], audience: Audience): Account[] {
  const roles = rolesOf(audience);
  return accounts.filter(
    (account) =>
      roles.includes(account.role) && account.status === "ACTIVE" && Boolean(account.phoneNumber),
  );
}
