import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { databaseSession } from "../../../lib/auth-db";
import { SESSION_COOKIE } from "../../../lib/auth";
import { validRequestOrigin } from "../../../lib/request-security";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

async function ownerContext() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value || "";
  const user = databaseSession(sessionToken);
  return user?.id === "rob" && user.role === "owner" ? { user } : null;
}

export async function POST(request: Request) {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: noStore });

  return NextResponse.json(
    {
      error: "Legacy Render egress ceremony retired. Use the provider-neutral self-hosted write-credential ceremony.",
    },
    { status: 410, headers: noStore },
  );
}
