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
  if (!origin) return process.env.NODE_ENV !== "production";

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
