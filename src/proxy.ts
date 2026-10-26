import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The cookie helper imports server env, which the proxy must not load. Presence is enough.
const ACCESS_COOKIE = "access_token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loggedIn = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);

  if (isProtected(pathname) && !loggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isAuthPage(pathname) && loggedIn) {
    return NextResponse.redirect(new URL("/photos", request.url));
  }
  return NextResponse.next();
}

function isProtected(pathname: string): boolean {
  return (
    pathname === "/photos" ||
    pathname.startsWith("/photos/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register";
}

export const config = {
  matcher: ["/photos", "/photos/:path*", "/settings", "/settings/:path*", "/login", "/register"],
};
