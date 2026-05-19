import { isIP } from "node:net";

import { normalizeUrl } from "./url.js";

export function isUrlAllowedForCrawl(inputUrl: string, siteDomain: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(inputUrl));
    const hostname = normalizeHostname(parsed.hostname);
    return !isBlockedHostname(hostname) && isHostnameWithinDomain(hostname, siteDomain);
  } catch {
    return false;
  }
}

export function isHostnameWithinDomain(hostname: string, siteDomain: string): boolean {
  const normalizedHostname = stripWww(normalizeHostname(hostname));
  const normalizedDomain = stripWww(normalizeHostname(extractHostname(siteDomain)));

  return (
    normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`)
  );
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isBlockedIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isBlockedIpv6(normalized);
  }

  return false;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/u, "").replace(/\]$/u, "").replace(/\.$/u, "");
}

function extractHostname(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("://")) {
    return new URL(trimmed).hostname;
  }

  return trimmed;
}

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function isBlockedIpv4(ip: string): boolean {
  const octets = ip.split(".").map((part) => Number(part));
  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second !== undefined && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    return isIP(mappedIpv4) === 4 && isBlockedIpv4(mappedIpv4);
  }

  const firstGroup = normalized.split(":").find((group) => group.length > 0);
  if (firstGroup === undefined) {
    return false;
  }

  const firstValue = Number.parseInt(firstGroup, 16);
  return (
    (firstValue >= 0xfc00 && firstValue <= 0xfdff) ||
    (firstValue >= 0xfe80 && firstValue <= 0xfebf)
  );
}
