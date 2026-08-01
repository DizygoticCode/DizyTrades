import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "Create Account | DizyTrades",
  description: "Create a DizyTrades test account for saved settings, learning progress and isolated paper simulation.",
};

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await currentUser()) redirect("/terminal");
  return <main className="login-shell"><SignupForm enabled={process.env.PUBLIC_SIGNUP_ENABLED !== "false"} /></main>;
}
