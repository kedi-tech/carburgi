import "server-only";

import { unstable_rethrow } from "next/navigation";

import { ApiError } from "./api";

/**
 * Runs a read and reports the failure instead of throwing it.
 *
 * The console is composed of independent panels: a catalogue that will not load
 * should not blank a page whose other half — the approval queue — is fine. Each
 * panel renders either its data or the reason it has none.
 *
 * `unstable_rethrow` is mandatory here: `redirect()` and `notFound()` work by
 * throwing, and swallowing those would silently break the session expiry path
 * in `lib/api.ts`.
 */
export type Loaded<T> = { data: T; error: null } | { data: null; error: string };

export async function safe<T>(read: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await read(), error: null };
  } catch (caught) {
    unstable_rethrow(caught);
    if (caught instanceof ApiError) {
      return { data: null, error: caught.message };
    }
    return { data: null, error: "Lecture impossible." };
  }
}
