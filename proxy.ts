import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next.js 16 proxy (formerly middleware). Reads the JWT and applies the
// `authorized` callback from the edge-safe config (no Prisma/bcrypt here).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // Access control is decided by the `authorized` callback in authConfig.
  void req;
});

export const config = {
  // Run on every route except API routes (they self-guard), Next internals,
  // and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
