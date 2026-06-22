// Create (if needed) and migrate the integration-test database, using the
// project's own Prisma tooling. Run once before `npm run test:integration`:
//
//   npm run test:integration:setup
//
// Honours TEST_DATABASE_URL; otherwise targets a local "sa_projects_test".
// Idempotent: re-running just re-applies any new migrations.

import { execSync } from "node:child_process";

const TEST_DB =
  process.env.TEST_DATABASE_URL ??
  "postgresql://sa:sa_local_dev@localhost:5432/sa_projects_test?schema=public";

// Best-effort create of the database. `prisma migrate deploy` does not create
// the database itself when the role lacks createdb, so try via psql and ignore
// "already exists".
function createDatabase(): void {
  try {
    const url = new URL(TEST_DB);
    const dbName = url.pathname.replace(/^\//, "").split("?")[0];
    const adminUrl = new URL(TEST_DB);
    adminUrl.pathname = "/postgres";
    const env = { ...process.env, PGPASSWORD: url.password };
    execSync(
      `psql "${adminUrl.toString()}" -tAc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || psql "${adminUrl.toString()}" -c "CREATE DATABASE \\"${dbName}\\""`,
      { stdio: "inherit", env, shell: "/bin/bash" },
    );
  } catch (e) {
    console.warn("Could not auto-create the test database (it may already exist):", e instanceof Error ? e.message : e);
  }
}

createDatabase();

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: TEST_DB, DIRECT_DATABASE_URL: TEST_DB },
});

console.log("Integration test database ready:", TEST_DB.replace(/:[^:@/]*@/, ":****@"));
