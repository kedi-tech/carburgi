import "server-only";

import { cookies } from "next/headers";

import type { Account } from "./types";

/**
 * The admin session lives in httpOnly cookies, so a token never reaches the
 * browser's JavaScript. There is no `/admin/auth/refresh` in the API — the
 * access token is all there is — so an expired one simply ends the session and
 * sends the user back to the login screen.
 */

const ACCESS_COOKIE = "sonap.access";
const IDENTITY_COOKIE = "sonap.identity";

/** Matches the API's own token lifetime closely enough to avoid dead sessions. */
const MAX_AGE_SECONDS = 60 * 60 * 12;

export type Identity = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
};

export async function createSession(accessToken: string, account: Account): Promise<void> {
  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };

  store.set(ACCESS_COOKIE, accessToken, options);
  store.set(
    IDENTITY_COOKIE,
    JSON.stringify({
      id: account.id,
      fullName: account.fullName,
      phoneNumber: account.phoneNumber,
    } satisfies Identity),
    options,
  );
}

export async function readAccessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export async function readIdentity(): Promise<Identity | null> {
  const raw = (await cookies()).get(IDENTITY_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Identity;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(IDENTITY_COOKIE);
}
