import { NormalizedUrlSchema, type LinkClassification } from "@searchops/types";

const supportedProtocols = new Set(["http:", "https:"]);

export function normalizeUrl(input: string, baseUrl?: string): string {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw new Error("URL input must not be empty");
  }

  const normalizedBase = baseUrl === undefined ? undefined : normalizeBaseUrl(baseUrl);
  let parsed: URL;
  try {
    parsed = new URL(trimmedInput, normalizedBase);
  } catch (error) {
    throw new Error(`Invalid URL: ${trimmedInput}`, { cause: error });
  }

  if (!supportedProtocols.has(parsed.protocol)) {
    throw new Error(`Only HTTP and HTTPS URLs are supported: ${trimmedInput}`);
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.pathname = normalizePathname(parsed.pathname);
  parsed.searchParams.sort();

  return NormalizedUrlSchema.parse(parsed.toString());
}

export function classifyInternalLink(input: string, baseUrl: string): LinkClassification {
  const normalizedUrl = normalizeUrl(input, baseUrl);
  const normalizedBaseUrl = normalizeUrl(baseUrl);
  const linkHost = stripWww(new URL(normalizedUrl).hostname);
  const baseHost = stripWww(new URL(normalizedBaseUrl).hostname);

  return linkHost === baseHost ? "internal" : "external";
}

function normalizePathname(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed || "/";
}

function normalizeBaseUrl(input: string): string {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw new Error("Base URL input must not be empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmedInput);
  } catch (error) {
    throw new Error(`Invalid base URL: ${trimmedInput}`, { cause: error });
  }

  if (!supportedProtocols.has(parsed.protocol)) {
    throw new Error(`Only HTTP and HTTPS base URLs are supported: ${trimmedInput}`);
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/") || "/";
  parsed.searchParams.sort();

  return NormalizedUrlSchema.parse(parsed.toString());
}

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}
