import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "../../../../lib/auth";
import { consumeRateLimit, databaseSession } from "../../../../lib/auth-db";
import { requestIp, validRequestOrigin } from "../../../../lib/request-security";
import { activateProductionWriteCredential } from "../../../../lib/write-credential-activation-ceremony";
import { productionWriteCredentialCeremonyIdentity } from "../../../../lib/write-credential-provisioning-ceremony";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };
const MAX_FORM_BYTES = 2_048;
type Result = "active" | "rejected" | "invalid" | "unconfigured";

async function ownerContext() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value || "";
  const user = databaseSession(sessionToken);
  return user?.id === "rob" && user.role === "owner" ? { user, sessionToken } : null;
}

async function boundedForm(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("application/x-www-form-urlencoded")) throw new Error("INVALID_REQUEST");
  const length = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(length) || length < 0 || length > MAX_FORM_BYTES) throw new Error("INVALID_REQUEST");
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_FORM_BYTES) throw new Error("INVALID_REQUEST");
  return Object.fromEntries(new URLSearchParams(text));
}

function applicationBaseUrl() {
  const configured = process.env.APP_BASE_URL?.trim() || "";
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    throw new Error("APP_BASE_URL is not configured.");
  }
  if (base.username || base.password || base.search || base.hash) throw new Error("Invalid APP_BASE_URL.");
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("Invalid APP_BASE_URL protocol.");
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") throw new Error("APP_BASE_URL must use HTTPS in production.");
  return base.origin;
}

function redirectResult(publicBaseUrl: string, result: Result) {
  const url = new URL("/account/write-credential/activate", publicBaseUrl);
  url.searchParams.set("result", result);
  return NextResponse.redirect(url, { status: 303, headers: noStore });
}

export async function POST(request: Request) {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: noStore });
  const ip = requestIp(request);
  if (consumeRateLimit([`write-credential-activate:user:${context.user.id}`, `write-credential-activate:ip:${ip}`], 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429, headers: noStore });
  }

  let publicBaseUrl: string;
  try {
    publicBaseUrl = applicationBaseUrl();
  } catch {
    return NextResponse.json({ error: "Server redirect configuration unavailable." }, { status: 503, headers: noStore });
  }

  if (!productionWriteCredentialCeremonyIdentity()) return redirectResult(publicBaseUrl, "unconfigured");

  let body: Record<string, string>;
  try {
    body = await boundedForm(request);
  } catch {
    return redirectResult(publicBaseUrl, "invalid");
  }

  const currentPassword = String(body.currentPassword || "");
  const totp = String(body.totp || "");
  if (
    currentPassword.length < 1
    || currentPassword.length > 128
    || !/^\d{6}$/.test(totp)
    || body.orderPlacingOnlyConfirmed !== "confirmed"
    || body.mexcIpAllowlistConfirmed !== "confirmed"
    || body.activateExactGeneration !== "confirmed"
  ) return redirectResult(publicBaseUrl, "invalid");

  const ownerProof = Object.freeze({ sessionToken: context.sessionToken, currentPassword, totp });
  const activated = await activateProductionWriteCredential(
    Object.freeze({ orderPlacingOnlyConfirmed: true, mexcIpAllowlistConfirmed: true }),
    ownerProof,
  );
  return redirectResult(publicBaseUrl, activated?.status === "active" ? "active" : "rejected");
}
