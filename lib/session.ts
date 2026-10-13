import "server-only";

import { cookies, headers } from "next/headers";

import {
  ACCESS_COOKIE,
  IDENTITY_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  isSecure,
  type TokenPair,
} from "./auth-tokens";

import type { Account } from "./types";

/**
 * The admin session lives in httpOnly cookies, so a token never reaches the
 * browser's JavaScript. The access token is short-lived; `proxy.ts` renews it
 * with the refresh token before it lapses (see `lib/auth-tokens.ts`), and only
 * a refused renewal ends the session.
 */

export type Identity = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
};

async function options() {
  const incoming = await headers();
  return cookieOptions(isSecure(null, incoming.get("x-forwarded-proto")));
}

export async function createSession(
  accessToken: string,
  refreshToken: string | null,
  account: Account,
): Promise<void> {
  const store = await cookies();
  const settings = await options();

  store.set(ACCESS_COOKIE, accessToken, settings);
  if (refreshToken) {
    store.set(REFRESH_COOKIE, refreshToken, settings);
  }
  store.set(
    IDENTITY_COOKIE,
    JSON.stringify({
      id: account.id,
      fullName: account.fullName,
      phoneNumber: account.phoneNumber,
    } satisfies Identity),
    settings,
  );
}

/** Stores a renewed pair; only callable where cookies can be written. */
export async function storeTokens(pair: TokenPair): Promise<void> {
  const store = await cookies();
  const settings = await options();
  store.set(ACCESS_COOKIE, pair.accessToken, settings);
  store.set(REFRESH_COOKIE, pair.refreshToken, settings);
}

export async function readRefreshToken(): Promise<string | null> {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null;
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
  store.delete(REFRESH_COOKIE);
  store.delete(IDENTITY_COOKIE);
}
