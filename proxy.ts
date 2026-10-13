import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  isSecure,
  needsRefresh,
  renewTokens,
} from "@/lib/auth-tokens";

/**
 * Keeps the admin session alive while it is used.
 *
 * Before a page renders, an access token that has expired — or will within a
 * minute — is swapped for a fresh pair. The new tokens go two ways: onto the
 * request, so the render below already uses them, and onto the response, so
 * the browser keeps them. Cookies cannot be written while a page renders,
 * which is why this happens here and not in `lib/api.ts`.
 *
 * It also passes the requested path on (`x-sonap-path`), so that a 401 met
 * during rendering can bring the administrator back to where they were.
 */
export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-sonap-path", request.nextUrl.pathname + request.nextUrl.search);

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refresh || !needsRefresh(access)) {
    return NextResponse.next({ request: { headers } });
  }

  const renewed = await renewTokens(refresh);
  if (!renewed) {
    // Let the page meet the 401 and end the session the usual way.
    return NextResponse.next({ request: { headers } });
  }

  request.cookies.set(ACCESS_COOKIE, renewed.accessToken);
  request.cookies.set(REFRESH_COOKIE, renewed.refreshToken);
  headers.set("cookie", request.cookies.toString());

  const response = NextResponse.next({ request: { headers } });
  const options = cookieOptions(
    isSecure(request.nextUrl.protocol, request.headers.get("x-forwarded-proto")),
  );
  response.cookies.set(ACCESS_COOKIE, renewed.accessToken, options);
  response.cookies.set(REFRESH_COOKIE, renewed.refreshToken, options);
  return response;
}

export const config = {
  // Pages and Server Actions; not static files, images or the login screen.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|auth/expired|.*\\.(?:png|jpe?g|svg|ico|webp)$).*)"],
};
