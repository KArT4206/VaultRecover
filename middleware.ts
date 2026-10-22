import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth.js v5's `auth` wrapper needs the Node runtime (bcrypt, prisma) which
// isn't available in the default edge middleware runtime here, so route
// protection for /dashboard and /recovery/* is enforced in those Server
// Components via `auth()` + redirect(), and on every API route via
// `auth()` checks. This middleware only adds baseline security headers.
export function middleware(req: NextRequest) {
  void req;
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
