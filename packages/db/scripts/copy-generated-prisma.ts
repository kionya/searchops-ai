import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const source = fileURLToPath(new URL("../src/generated/prisma", import.meta.url));
const destination = fileURLToPath(new URL("../dist/generated/prisma", import.meta.url));

if (!existsSync(source)) {
  throw new Error(`Generated Prisma client not found at ${source}. Run pnpm db:generate first.`);
}

cpSync(source, destination, {
  force: true,
  recursive: true
});

console.log(`Copied generated Prisma client for ${packageRoot}`);
