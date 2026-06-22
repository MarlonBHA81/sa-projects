import type { NextAuthConfig } from "next-auth";
import type { Role, Department } from "@prisma/client";

// Edge-safe config shared by middleware and the full server config in auth.ts.
// No Node-only dependencies (Prisma, bcrypt) live here.
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/projects", nextUrl));
        }
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; role?: Role; department?: Department | null };
        if (u.id) token.id = u.id;
        if (u.role) token.role = u.role;
        token.department = u.department ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const t = token as { id?: string; role?: Role; department?: Department | null };
        if (t.id) session.user.id = t.id;
        if (t.role) session.user.role = t.role;
        session.user.department = t.department ?? null;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
