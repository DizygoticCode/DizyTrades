import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { databaseSession, consumeRateLimit } from "../../../lib/auth-db";
import { SESSION_COOKIE } from "../../../lib/auth";
import {
  declareProductionRenderEgressCeremony,
  observeProductionRenderEgressCeremony,
  type RenderEgressCeremonyIdentity,
} from "../../../lib/render-egress-ceremony";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;

async function ownerContext() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value || "";
  const user = databaseSession(sessionToken);
  return user?.id === "rob" && user.role === "owner" ? { user, sessionToken } : null;
}

async function boundedForm(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("application/x-www-form-urlencoded")) throw new Error("INVALID_REQUEST");
  const length = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(length) || length < 0 || length > 2_048) throw new Error("INVALID_REQUEST");
  const text = await request.text();
  if (Buffer.byteLength(text) > 2_048) throw new Error("INVALID_REQUEST");
  return Object.fromEntries(new URLSearchParams(text));
}

function identityFrom(body: Record<string, string>): RenderEgressCeremonyIdentity | null {
  const accountId = String(body.accountId || "").trim();
  const writeCredentialGeneration = String(body.writeCredentialGeneration || "").trim();
  if (!ID.test(accountId) || !ID.test(writeCredentialGeneration)) return null;
  return Object.freeze({ userId: "rob", accountId, writeCredentialGeneration });
}

function redirectResult(
  request: Request,
  identity: RenderEgressCeremonyIdentity | null,
  result: "declared" | "observed" | "rejected" | "invalid",
) {
  const url = new URL("/account/egress", request.url);
  if (identity) {
    url.searchParams.set("accountId", identity.accountId);
    url.searchParams.set("generation", identity.writeCredentialGeneration);
  }
  url.searchParams.set("result", result);
  return NextResponse.redirect(url, { status: 303, headers: noStore });
}

export async function POST(request: Request) {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: noStore });
  const ip = requestIp(request);
  if (consumeRateLimit([`render-egress:user:${context.user.id}`, `render-egress:ip:${ip}`], 6, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429, headers: noStore });
  }

  let body: Record<string, string>;
  try {
    body = await boundedForm(request);
  } catch {
    return redirectResult(request, null, "invalid");
  }

  const identity = identityFrom(body);
  const action = String(body.action || "");
  const currentPassword = String(body.currentPassword || "");
  const totp = String(body.totp || "");
  if (
    !identity
    || (action !== "declare" && action !== "observe")
    || currentPassword.length < 1
    || currentPassword.length > 256
    || !/^\d{6}$/.test(totp)
  ) return redirectResult(request, identity, "invalid");

  const ownerProof = Object.freeze({ sessionToken: context.sessionToken, currentPassword, totp });
  const state = action === "declare"
    ? await declareProductionRenderEgressCeremony(identity, ownerProof)
    : await observeProductionRenderEgressCeremony(identity, ownerProof);
  if (!state) return redirectResult(request, identity, "rejected");
  return redirectResult(request, identity, action === "declare" ? "declared" : "observed");
}
