"use client";

import { FormEvent, useState } from "react";

type Mode = "forgot-password" | "resend-verification";

const COPY: Record<Mode, { title: string; intro: string; button: string; endpoint: string }> = {
  "forgot-password": {
    title: "Reset your password",
    intro: "Enter the verified email address for your DizyTrades account.",
    button: "Send reset email",
    endpoint: "/api/auth/forgot-password",
  },
  "resend-verification": {
    title: "Resend verification",
    intro: "Enter the email address used when you created your DizyTrades account.",
    button: "Send verification email",
    endpoint: "/api/auth/resend-verification",
  },
};

export default function AccountEmailActionForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email") }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Account email could not be sent.");
      setMessage(payload.message || "Check your inbox.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account email could not be sent.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>DizyTrades</strong><small>Everything Dizy™</small></div></div>
    <div className="test-chip"><i /> ACCOUNT SECURITY</div>
    <h1>{copy.title}</h1>
    <p>{copy.intro}</p>
    <label><span>Email</span><input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
    {error ? <div className="login-error" role="alert">{error}</div> : null}
    {message ? <div className="recovery-notice" role="status">{message}</div> : null}
    <button disabled={loading} type="submit">{loading ? "Sending…" : copy.button}</button>
    <a className="signup-link" href="/login">Return to sign in</a>
    {mode === "forgot-password" ? <a className="school-login-link" href="/resend-verification">Need a verification email instead?</a> : null}
    <div className="login-safety"><b>PRIVACY</b><span>For account-recovery requests, DizyTrades does not reveal whether an email address exists.</span></div>
  </form>;
}
