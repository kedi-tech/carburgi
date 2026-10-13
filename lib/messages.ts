import { normalizeGuineaPhone } from "./format";
import type { Account, AccountRole, AccountStatus } from "./types";

/**
 * Who a broadcast goes to. The API takes bare `accountIds`; the audience is
 * the console's vocabulary, resolved against the account list right before
 * the call so that the count shown is the list sent.
 */
export type Audience = "DRIVER" | "STATION" | "BOTH";

/**
 * What the composer offers: the three broadcasts, a single account, or the
 * accounts matching the numbers of an imported contact file.
 */
export type Target = Audience | "ONE" | "FILE";

export const audienceLabels: Record<Audience, string> = {
  DRIVER: "Conducteurs",
  STATION: "Équipes stations",
  BOTH: "Conducteurs et stations",
};

export function isAudience(value: unknown): value is Audience {
  return value === "DRIVER" || value === "STATION" || value === "BOTH";
}

export function isTarget(value: unknown): value is Target {
  return isAudience(value) || value === "ONE" || value === "FILE";
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

export type ContactImport = {
  /** Accounts whose number appears in the file, each once. */
  matched: Person[];
  /** Valid Guinean numbers with no account behind them: the API cannot text them. */
  unknown: string[];
  /** Number-like strings that are not a Guinean mobile number. */
  invalid: number;
};

/**
 * Reads the phone numbers out of a contact file — CSV or Excel saved as CSV,
 * a plain list, or a phone's vCard export — and sorts them against the
 * accounts an SMS can reach.
 *
 * The file's layout is not trusted: every run of digits that looks like a
 * phone number is taken, whatever column it sits in, and normalised to
 * `+224XXXXXXXXX`. The API sends only to account ids, so a number nobody has
 * registered with lands in `unknown` rather than being silently dropped.
 */
export function importContacts(text: string, people: Person[]): ContactImport {
  const byPhone = new Map(people.map((person) => [person.phoneNumber, person]));
  const matched = new Map<string, Person>();
  const unknown = new Set<string>();
  let invalid = 0;

  for (const candidate of text.match(/\+?\d[\d\s().-]{6,}\d/g) ?? []) {
    const phone = normalizeGuineaPhone(candidate);
    if (!phone) {
      // Dates and short codes look like digits too; only a run long enough
      // to be a phone number counts as a bad one.
      if (candidate.replace(/\D/g, "").length >= 9) {
        invalid += 1;
      }
      continue;
    }
    const person = byPhone.get(phone);
    if (person) {
      matched.set(person.id, person);
    } else {
      unknown.add(phone);
    }
  }

  return { matched: [...matched.values()], unknown: [...unknown], invalid };
}
