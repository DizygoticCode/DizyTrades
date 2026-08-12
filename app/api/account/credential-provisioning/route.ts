import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { databaseSession, consumeRateLimit } from "../../../lib/auth-db";
import { SESSION_COOKIE } from "../../../lib/auth";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";
import { beginProvisioningAuthorization, credentialStatus, provisioningAvailability, provisionCredential, revokeCredential, type ProvisioningPurpose } from "../../../lib/credential-provisioning";

export const runtime = "nodejs";
const COOKIE = "dizytrades_provisioning_authorization";
const noStore = { "Cache-Control": "no-store" };
function response(body: object, status = 200) { return NextResponse.json(body, { status, headers: noStore }); }
async function ownerContext() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value || "";
  const user = databaseSession(sessionToken);
  return user?.id === "rob" && user.role === "owner" ? { user, sessionToken } : null;
}
async function boundedJson(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2_048) throw new Error("INVALID_REQUEST");
  const text = await request.text(); if (Buffer.byteLength(text) > 2_048) throw new Error("INVALID_REQUEST");
  return JSON.parse(text) as Record<string, unknown>;
}
function clearAuthorization(result: NextResponse) { result.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/account/credential-provisioning", maxAge: 0 }); return result; }

export async function GET(request: Request) {
  const context = await ownerContext(); if (!context) return response({ error: "Not found." }, 404);
  const availability = provisioningAvailability();
  const accountRef = new URL(request.url).searchParams.get("accountRef") || "owner-primary";
  try { return response({ availability, credential: credentialStatus(context.user.id, accountRef) }); }
  catch { return response({ availability, credential: null }); }
}

export async function POST(request: Request) {
  const context = await ownerContext(); if (!context) return response({ error: "Not found." }, 404);
  if (!validRequestOrigin(request)) return response({ error: "Invalid request." }, 403);
  const ip = requestIp(request);
  if (consumeRateLimit([`credential-provisioning:user:${context.user.id}`, `credential-provisioning:ip:${ip}`], 8, 15 * 60_000)) return response({ error: "Too many attempts." }, 429);
  let body: Record<string, unknown>;
  try { body = await boundedJson(request); } catch { return response({ error: "Invalid request." }, 400); }
  const action = body.action;
  try {
    if (action === "authorize") {
      const purpose = body.purpose as ProvisioningPurpose;
      if (purpose !== "provision" && purpose !== "revoke") throw new Error("INVALID_REQUEST");
      const token = await beginProvisioningAuthorization({ userId: context.user.id, sessionToken: context.sessionToken, purpose, password: String(body.password || ""), totp: String(body.totp || "") });
      const result = response({ authorized: true, purpose });
      result.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/account/credential-provisioning", maxAge: 300 });
      return result;
    }
    const token = (await cookies()).get(COOKIE)?.value || "";
    if (action === "provision") {
      const credential = provisionCredential({ token, userId: context.user.id, sessionToken: context.sessionToken, accountRef: String(body.accountRef || ""), apiKey: String(body.apiKey || ""), apiSecret: String(body.apiSecret || "") });
      return clearAuthorization(response({ credential }));
    }
    if (action === "revoke") {
      revokeCredential({ token, userId: context.user.id, sessionToken: context.sessionToken, accountRef: String(body.accountRef || "") });
      return clearAuthorization(response({ revoked: true }));
    }
    throw new Error("INVALID_REQUEST");
  } catch (error) {
    const kind = String(error);
    if (kind.includes("PROVISIONING_UNAVAILABLE")) return clearAuthorization(response({ error: "Credential provisioning is disabled." }, 503));
    if (kind.includes("ALREADY_CONFIGURED")) return clearAuthorization(response({ error: "Credentials are already configured; revoke them before provisioning again." }, 409));
    return clearAuthorization(response({ error: "The credential ceremony could not be completed." }, 403));
  }
}
