import { DIZY_TOKEN_LOGO_URL } from "../../../dizy/token-config";

const MAX_LOGO_BYTES = 2_000_000;
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";

function unavailable() {
  return new Response(null, {
    status: 502,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  try {
    const response = await fetch(DIZY_TOKEN_LOGO_URL, {
      next: { revalidate: 86_400 },
    });

    if (!response.ok) return unavailable();

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) return unavailable();

    const body = await response.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_LOGO_BYTES) return unavailable();

    return new Response(body, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
      },
    });
  } catch {
    return unavailable();
  }
}
