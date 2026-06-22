import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Next.js 16 proxy (formerly middleware). Reads the JWT and applies the
// `authorized` callback from the edge-safe config (no Prisma/bcrypt here).
const { auth } = NextAuth(authConfig);

// BRS surfaces are hidden while project management is the primary experience.
// The routes, code and data are intact; these prefixes just redirect to
// /projects for now. Remove this block to bring the BRS experience back.
const HIDDEN_PREFIXES = ["/dashboard", "/approvals", "/insights"];

export default auth((req) => {
  // Access control is decided by the `authorized` callback in authConfig.
  // Only redirect signed-in users; unauthenticated requests fall through to
  // that callback so they still reach the login gate.
  const { pathname } = req.nextUrl;
  if (req.auth && HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/projects", req.nextUrl));
  }
});

export const config = {
  // Run on every route except API routes (they self-guard), Next internals,
  // and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
