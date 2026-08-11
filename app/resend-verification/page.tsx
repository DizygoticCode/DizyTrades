import type { Metadata } from "next";
import AccountEmailActionForm from "../account-email-action-form";

export const metadata: Metadata = {
  title: "Resend Verification | DizyTrades",
  description: "Request a fresh DizyTrades email-verification link.",
};

export default function ResendVerificationPage() {
  return <main className="login-shell"><AccountEmailActionForm mode="resend-verification" /></main>;
}
