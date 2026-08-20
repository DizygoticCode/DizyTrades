import { isIP } from "node:net";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

export function requestIp(request: Request) {
  for (const candidate of [
    firstHeaderValue(request.headers.get("x-forwarded-for")),
    firstHeaderValue(request.headers.get("x-real-ip")),
  ]) {
    if (candidate && isIP(candidate)) return candidate;
  }
  return "unknown";
}

export function validRequestOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV !== "production") return true;
    if (process.env.PLAYWRIGHT_E2E_ORIGINLESS !== "true") return false;
    try {
      const hostname = new URL(request.url).hostname;
      return hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }

  try {
    const requestUrl = new URL(request.url);
    const expectedHost = firstHeaderValue(request.headers.get("x-forwarded-host"))
      || request.headers.get("host")?.trim()
      || requestUrl.host;
    const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto")).toLowerCase();
    const expectedProtocol = forwardedProtocol === "http" || forwardedProtocol === "https"
      ? `${forwardedProtocol}:`
      : requestUrl.protocol;
    const originUrl = new URL(origin);
    return originUrl.protocol === expectedProtocol && originUrl.host === expectedHost;
  } catch {
    return false;
  }
}

export function validSameOriginNavigation(request: Request) {
  return request.headers.get("sec-fetch-site")?.toLowerCase() === "same-origin"
    && request.headers.get("sec-fetch-mode")?.toLowerCase() === "navigate"
    && request.headers.get("sec-fetch-user") === "?1";
}
