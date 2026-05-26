const absoluteUrlPattern = /^[a-z][a-z\d+\-.]*:\/\//i;

export function getApiBaseUrl(value = process.env.SEARCHOPS_API_BASE_URL): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = absoluteUrlPattern.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}
