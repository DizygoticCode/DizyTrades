import type { Metadata } from "next";
import ResetPasswordClient from "./reset-password-client";

export const metadata: Metadata = {
  title: "Choose New Password | DizyTrades",
  description: "Set a new password from a single-use DizyTrades recovery link.",
};

export default function ResetPasswordPage() {
  return <main className="login-shell"><ResetPasswordClient /></main>;
}
