import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authIsConfigured, currentUser } from "../lib/auth";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign In | DizyTrades",
  description: "Sign in to your isolated DizyTrades charting, signals and paper-testing workspace.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/terminal");
  return (
    <main className="login-shell">
      <LoginForm />
      {process.env.PUBLIC_SIGNUP_ENABLED === "false" && !authIsConfigured() ? (
        <p className="config-warning">
          Test users are not configured. Add the required secret environment variables on Render.
        </p>
      ) : null}
    </main>
  );
}
