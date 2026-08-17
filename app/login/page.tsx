import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authIsConfigured, currentUser } from "../lib/auth";
import { safeAuthReturnTarget } from "../lib/auth-return-target";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign In | DizyTrades",
  description: "Sign in to your isolated DizyTrades charting, signals and paper-testing workspace.",
};

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const returnTo = safeAuthReturnTarget(first(query.returnTo));
  if (await currentUser()) redirect(returnTo);
  return (
    <main className="login-shell">
      <LoginForm returnTo={returnTo} />
      {process.env.PUBLIC_SIGNUP_ENABLED === "false" && !authIsConfigured() ? (
        <p className="config-warning">
          Test users are not configured. Add the required secret environment variables on Render.
        </p>
      ) : null}
    </main>
  );
}
