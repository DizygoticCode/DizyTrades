import { NextResponse } from "next/server";
import { ACCOUNT_AVATAR_MAX_BYTES, consumeRateLimit, getAccountAvatar, removeAccountAvatar, setAccountAvatar } from "../../../lib/auth-db";
import { requireApiUser } from "../../../lib/auth";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";

type AvatarMime = "image/png" | "image/jpeg" | "image/webp";

function sniffAvatarMime(bytes: Uint8Array): AvatarMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function GET() {
  const user = await requireApiUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const avatar = getAccountAvatar(user);
  if (!avatar) return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  return new Response(new Uint8Array(avatar.bytes), {
    headers: {
      "cache-control": "private, no-store",
      "content-type": avatar.mime,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const ip = requestIp(request);
  if (consumeRateLimit([`profile:avatar:${user.id}`, `profile:avatar:ip:${ip}`], 10, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many avatar changes. Try again later." }, { status: 429 });
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Choose a PNG, JPEG or WebP image." }, { status: 400 }); }
  const value = form.get("avatar");
  if (!(value instanceof File) || value.size < 1 || value.size > ACCOUNT_AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: "Avatar must be a PNG, JPEG or WebP no larger than 512 KB." }, { status: 400 });
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  const mime = sniffAvatarMime(bytes);
  if (!mime || mime !== value.type) return NextResponse.json({ error: "Avatar file type did not match its contents." }, { status: 400 });
  try {
    const profile = setAccountAvatar(user, mime, bytes);
    await appendAudit(user.id, "auth.avatar-updated", { ip, mime, bytes: bytes.byteLength });
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Avatar could not be saved." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireApiUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const profile = removeAccountAvatar(user);
  await appendAudit(user.id, "auth.avatar-removed", { ip: requestIp(request) });
  return NextResponse.json({ profile });
}
