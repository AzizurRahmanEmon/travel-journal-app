import path from "node:path";
import { defineConfig } from "vitest/config";

process.env.DATABASE_URL ??= "postgres://localhost:5432/travel_journal_test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
process.env.TOTP_ENCRYPTION_KEY ??= "test-totp-encryption-key";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
  },
});
