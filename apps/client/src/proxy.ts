import { AUTH_CONFIG } from "@rogue/auth";
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(AUTH_CONFIG.COOKIE.NAMES.SESSION);

  const isProtected = AUTH_CONFIG.ROUTES.PROTECTED.some((r) =>
    pathname.startsWith(r),
  );

  const isAuthPage = (
    AUTH_CONFIG.ROUTES.AUTH_PAGES as readonly string[]
  ).includes(pathname);

  if (isProtected && !hasSession) {
    return NextResponse.redirect(
      new URL(AUTH_CONFIG.ROUTES.SIGN_IN_PAGE, request.url),
    );
  }

  if (isAuthPage && hasSession) {
    return NextResponse.redirect(
      new URL(AUTH_CONFIG.ROUTES.DEFAULT_REDIRECT, request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/game/:path*", "/sign-in", "/sign-up"],
};
