export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function validRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const expectedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
    return new URL(origin).host === expectedHost;
  } catch { return false; }
}
