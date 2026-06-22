import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run against a real Postgres. They live under tests/ so the
// default `npm run test` (vitest.config.ts, lib/**/*.test.ts) stays pure and
// needs no database. Run these with `npm run test:integration`.
//
// The setup file points DATABASE_URL at a dedicated test database before any
// Prisma client is constructed, and the suite skips itself gracefully if that
// database is unreachable.
export default defineConfig({
  // Mirror the tsconfig "@/*" -> project root alias for Vitest's resolver.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Schema writes share tables; run files serially to keep cleanup simple.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
