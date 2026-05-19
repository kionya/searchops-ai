import { parseSearchOpsEnv } from "@searchops/types";

import { buildApiServer } from "./server.js";

parseSearchOpsEnv(process.env);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const server = buildApiServer();

await server.listen({ host, port });
console.log(`SearchOps API listening on http://${host}:${port}`);