import type { Metadata } from "next";
import AccountEmailActionForm from "../account-email-action-form";

export const metadata: Metadata = {
  title: "Reset Password | DizyTrades",
  description: "Request a secure password-reset link for a verified DizyTrades account.",
};

export default function ForgotPasswordPage() {
  return <main className="login-shell"><AccountEmailActionForm mode="forgot-password" /></main>;
}
