import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: redirect to /login when there is no session cookie.
// The real verification happens in src/server/auth.ts on every request.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("tb_session");
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except login, invite links, Microsoft sign-in, the public REST API (token auth), static assets and Next internals.
  matcher: ["/((?!login|invite|auth/microsoft|api/v1|api/docs|_next/static|_next/image|favicon.ico).*)"],
};
