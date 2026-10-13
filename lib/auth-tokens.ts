/**
 * Session pieces shared by `proxy.ts` and the server code: cookie names and
 * options, reading a token's expiry, and renewing tokens.
 *
 * No `server-only` here: the proxy imports it too. Nothing in this file
 * reaches the browser — every caller runs on the server.
 *
 * The admin login returns a refresh token alongside the access token. There is
 * no `/admin/auth/refresh`, but sessions are one table for every role, and
 * `POST /app/auth/refresh` rotates any of them. Without this, the console
 * signed the administrator out as soon as the short-lived access token lapsed.
 */

export const ACCESS_COOKIE = "sonap.access";
export const REFRESH_COOKIE = "sonap.refresh";
export const IDENTITY_COOKIE = "sonap.identity";

/** The console session itself; the API's tokens are renewed inside it. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Renew this long before the access token expires, so no request lands on a dead one. */
const REFRESH_MARGIN_SECONDS = 60;

const API_BASE_URL: string = (
  process.env.CARBUGUI_API_URL ?? "https://carbugui.kedi-tech.com/api/v1"
).replace(/\/+$/, "");

/**
 * Cookies flagged `Secure` are dropped by browsers on plain HTTP — which is
 * how the console runs behind `docker run -p 3000:3000` with no proxy. So the
 * flag follows the actual scheme (as a TLS proxy reports it), and
 * `COOKIE_SECURE=true|false` overrides the guess.
 */
export function isSecure(protocol: string | null, forwardedProto: string | null): boolean {
  const forced = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (forced === "true" || forced === "false") {
    return forced === "true";
  }
  const scheme = (forwardedProto?.split(",")[0] ?? protocol ?? "").trim().replace(/:$/, "");
  return scheme === "https";
}

export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Seconds since epoch at which a JWT expires, or null when it is not a readable JWT. */
export function tokenExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }
  try {
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")),
    ) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function needsRefresh(accessToken: string | undefined, now: number = Date.now()): boolean {
  if (!accessToken) {
    return true;
  }
  const expiry = tokenExpiry(accessToken);
  return expiry !== null && expiry - REFRESH_MARGIN_SECONDS <= now / 1000;
}

export type TokenPair = { accessToken: string; refreshToken: string };

/** Rotates the pair. Null when the refresh token is refused or the API is unreachable. */
export async function renewTokens(refreshToken: string): Promise<TokenPair | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/app/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as Partial<TokenPair> & { data?: Partial<TokenPair> };
    const source = payload.data ?? payload;
    if (!source.accessToken) {
      return null;
    }
    // Some deployments rotate only the access token; keep the old refresh one then.
    return { accessToken: source.accessToken, refreshToken: source.refreshToken ?? refreshToken };
  } catch {
    return null;
  }
}
