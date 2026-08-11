import type { Metadata } from "next";
import VerifyEmailClient from "./verify-email-client";

export const metadata: Metadata = {
  title: "Verify Email | DizyTrades",
  description: "Confirm the email address for a DizyTrades account.",
};

export default function VerifyEmailPage() {
  return <main className="login-shell"><VerifyEmailClient /></main>;
}
