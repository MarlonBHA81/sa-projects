// Vitest setup for the integration suite. Runs before any test module (and so
// before lib/db.ts constructs its PrismaClient), pointing the connection at a
// dedicated test database. Use TEST_DATABASE_URL when provided, otherwise a
// conventional local "sa_projects_test" database (created and migrated by
// `npm run test:integration:setup`).

import { vi } from "vitest";

const TEST_DB =
  process.env.TEST_DATABASE_URL ??
  "postgresql://sa:sa_local_dev@localhost:5432/sa_projects_test?schema=public";

process.env.DATABASE_URL = TEST_DB;
process.env.DIRECT_DATABASE_URL = TEST_DB;

// The services import auth-helpers, which imports @/auth (NextAuth). NextAuth's
// runtime drags in next/server and is awkward under Vitest's Node resolver, and
// these tests never exercise session reads (they pass a SessionUser directly).
// Stub @/auth so importing auth-helpers stays cheap and side-effect free.
vi.mock("@/auth", () => ({
  auth: async () => null,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));
