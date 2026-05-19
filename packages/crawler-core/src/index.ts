import { PageSnapshotSchema } from "@searchops/types";

export { parseHtml } from "./html.js";
export { extractSeoSignals } from "./signals.js";
export { classifyInternalLink, normalizeUrl } from "./url.js";
export type { ExtractSeoSignalsInput } from "./signals.js";

export const crawlerCorePackage = "crawler-core" as const;

export function createPlaceholderSnapshot(url: string) {
  return PageSnapshotSchema.parse({
    url,
    h1Count: 0
  });
}
