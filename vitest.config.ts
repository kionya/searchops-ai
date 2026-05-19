import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.{test,spec}.ts"],
    exclude: ["**/dist/**", "**/.next/**", "**/node_modules/**"]
  }
});