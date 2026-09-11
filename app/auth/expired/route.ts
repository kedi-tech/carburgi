import { redirect } from "next/navigation";

import { clearSession } from "@/lib/session";

/**
 * Where an expired or rejected admin token lands.
 *
 * The session has to be *cleared*, and cookies can only be written from a Route
 * Handler or a Server Action — never while a page renders. `lib/api.ts` cannot
 * therefore drop the cookie itself when the API answers 401: it redirects here,
 * and this handler does the write before sending the user to the login screen.
 *
 * Without this hop the stale cookie survives, `/login` bounces back to `/` on
 * the strength of it, and the console shows a page of failed panels instead of
 * asking anyone to sign in again.
 */
export async function GET(): Promise<never> {
  await clearSession();
  redirect("/login?expired=1");
}
