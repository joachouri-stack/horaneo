import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/global-db.ts"],
    setupFiles: ["dotenv/config"],
    // Les tests de base de données partagent une seule base : on les exécute l'un après l'autre.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
