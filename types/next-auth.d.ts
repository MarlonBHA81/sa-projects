import type { Role, Department } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      department: Department | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    department: Department | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    department: Department | null;
  }
}
