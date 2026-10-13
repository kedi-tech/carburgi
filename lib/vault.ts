import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The console's own record of the station credentials it has issued.
 *
 * The API keeps only a hash of a station password and shows the plaintext
 * once, and it has no admin route to reset one. Administrators asked to see an
 * agent's password again later, so the console keeps a copy — encrypted with
 * AES-256-GCM under `STATION_VAULT_KEY`, in a JSON file on the server's disk.
 *
 * The plaintext leaves this module only through `revealCredential`, which a
 * server action calls when an administrator presses « Afficher ». Listings
 * carry everything but the password.
 *
 * Without a key the vault is off: credentials are shown once, as before, and
 * nothing is written. A key that changes makes the stored passwords unreadable
 * — they are reported as such, never guessed.
 */

export type StoredCredential = {
  accountId: string;
  stationId: string;
  loginCode: string;
  fullName: string | null;
  phoneNumber: string | null;
  createdAt: string;
  /** Who issued it, for the trail. */
  createdBy: string | null;
};

type Sealed = StoredCredential & { iv: string; tag: string; secret: string };

const VAULT_PATH: string =
  process.env.STATION_VAULT_PATH?.trim() ||
  path.join(process.cwd(), ".data", "station-credentials.json");

function vaultKey(): Buffer | null {
  const raw = process.env.STATION_VAULT_KEY?.trim();
  if (!raw) {
    return null;
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("STATION_VAULT_KEY doit encoder 32 octets en base64 (openssl rand -base64 32).");
  }
  return key;
}

export function vaultEnabled(): boolean {
  try {
    return vaultKey() !== null;
  } catch {
    return false;
  }
}

async function load(): Promise<Sealed[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(/*turbopackIgnore: true*/ VAULT_PATH, "utf8"));
    return Array.isArray(parsed) ? (parsed as Sealed[]) : [];
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw caught;
  }
}

/** Write to a sibling file then rename, so a crash never leaves half a vault. */
async function persist(entries: Sealed[]): Promise<void> {
  await mkdir(path.dirname(VAULT_PATH), { recursive: true });
  const temporary = `${VAULT_PATH}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(entries, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, VAULT_PATH);
}

/** Two admins saving at once must not overwrite each other: writes queue up. */
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function strip({ iv: _iv, tag: _tag, secret: _secret, ...rest }: Sealed): StoredCredential {
  return rest;
}

/** Stores (or replaces) one account's password. A no-op when the vault is off. */
export async function saveCredential(credential: StoredCredential, password: string): Promise<boolean> {
  const key = vaultKey();
  if (!key) {
    return false;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const secret = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const sealed: Sealed = {
    ...credential,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    secret: secret.toString("base64"),
  };

  await exclusive(async () => {
    const entries = (await load()).filter((entry) => entry.accountId !== credential.accountId);
    entries.push(sealed);
    await persist(entries);
  });
  return true;
}

/** What the vault holds, without a single password in it. */
export async function listCredentials(): Promise<StoredCredential[]> {
  if (!vaultEnabled()) {
    return [];
  }
  return (await load()).map(strip);
}

/** The plaintext, or null when it is not stored or cannot be decrypted with the current key. */
export async function revealCredential(accountId: string): Promise<string | null> {
  const key = vaultKey();
  if (!key) {
    return null;
  }
  const entry = (await load()).find((candidate) => candidate.accountId === accountId);
  if (!entry) {
    return null;
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(entry.iv, "base64"));
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(entry.secret, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export async function forgetCredential(accountId: string): Promise<void> {
  if (!vaultEnabled()) {
    return;
  }
  await exclusive(async () => {
    const entries = await load();
    const kept = entries.filter((entry) => entry.accountId !== accountId);
    if (kept.length !== entries.length) {
      await persist(kept);
    }
  });
}

/**
 * A password an agent can read aloud and type on a phone: no 0/O, 1/l/I.
 * Ten characters, well above the API's six-character minimum.
 */
export function generatePassword(length: number = 10): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let password = "";
  for (let index = 0; index < length; index += 1) {
    password += alphabet[randomInt(alphabet.length)];
  }
  return password;
}
