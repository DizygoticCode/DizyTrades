import { NextResponse } from "next/server";
import { consumeRateLimit, createAccount, createEmailVerificationTokenForUser } from "../../../lib/auth-db";
import { normaliseIdentifier, publicSignupEnabled } from "../../../lib/auth-credentials";
import { accountMailConfigured, sendVerificationEmail } from "../../../lib/account-mail";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";
const generic = (status = 400) => NextResponse.json({ error: "Registration could not be completed. Check your details and try again." }, { status });

export async function POST(request: Request) {
  if (!publicSignupEnabled()) return NextResponse.json({ error: "Registration is currently unavailable." }, { status: 403 });
  if (!accountMailConfigured()) return NextResponse.json({ error: "Email verification is temporarily unavailable." }, { status: 503 });
  if (!validRequestOrigin(request)) return generic(403);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return generic(); }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmation = typeof body.passwordConfirmation === "string" ? body.passwordConfirmation : "";
  const honeypot = typeof body.website === "string" ? body.website : "";
  const usernameValid = !username || (/^[A-Za-z0-9_.-]{3,32}$/.test(username) && !username.includes("@"));
  const emailValid = Boolean(email) && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (honeypot || !emailValid || !usernameValid || password.length < 12 || password.length > 128 || password !== confirmation) return generic();
  const ip = requestIp(request);
  const identifiers = [username, email].filter(Boolean).map(normaliseIdentifier);
  if (consumeRateLimit([`signup:ip:${ip}`, ...identifiers.map((id) => `signup:id:${id}`)], 5, 60 * 60_000)) return generic(429);
  try {
    const user = await createAccount({ username: username || undefined, email, password });
    const verification = createEmailVerificationTokenForUser(user.id);
    if (!verification) return generic(503);
    let delivered = true;
    try {
      await sendVerificationEmail(verification.email, verification.token);
    } catch {
      delivered = false;
    }
    await appendAudit(user.id, "auth.signup.pending-verification", { ip, hasUsername: Boolean(username), emailDelivered: delivered });
    return NextResponse.json({ pendingVerification: true, emailDelivered: delivered }, { status: 201 });
  } catch (error) {
    return generic(String(error).includes("AUTH_UNAVAILABLE") ? 503 : 409);
  }
}
