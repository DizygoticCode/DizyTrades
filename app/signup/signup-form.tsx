"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function SignupForm({ enabled }: { enabled: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ email: string; delivered: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(data.entries());
    const email = String(body.email || "").trim().toLowerCase();
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string; pendingVerification?: boolean; emailDelivered?: boolean };
      if (!response.ok || !payload.pendingVerification) throw new Error(payload.error || "Registration failed.");
      setPending({ email, delivered: payload.emailDelivered !== false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  if (pending) return <div className="login-card" role="status">
    <div className="login-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>DizyTrades</strong><small>Everything Dizy™</small></div></div>
    <div className="test-chip"><i /> VERIFY YOUR EMAIL</div>
    <h1>Check your inbox</h1>
    <p>We created the account for <strong>{pending.email}</strong>, but it cannot sign in until that address is verified.</p>
    {pending.delivered ? <p className="recovery-notice">Open the DizyTrades verification email and use the secure link. It expires after 24 hours.</p> : <div className="login-error">The account was created, but the first email could not be delivered. Use resend verification below.</div>}
    <Link className="signup-link" href="/resend-verification">Resend verification email</Link>
    <Link className="school-login-link" href="/login">Return to sign in</Link>
    <div className="login-safety"><b>NO SESSION YET</b><span>Email verification is required before this account can access a personal workspace.</span></div>
  </div>;

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>DizyTrades</strong><small>Everything Dizy™</small></div></div>
    <div className="test-chip"><i /> CREATE YOUR WORKSPACE</div>
    <h1>Create your account</h1>
    <p>Save settings, paper trades and workspace preferences in your own isolated profile.</p>
    <label><span>Username (optional)</span><input autoComplete="username" maxLength={32} minLength={3} name="username" pattern="[A-Za-z0-9_.-]{3,32}" /></label>
    <label><span>Email</span><input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
    <label><span>Password</span><input autoComplete="new-password" maxLength={128} minLength={12} name="password" required type="password" /></label>
    <label><span>Confirm password</span><input autoComplete="new-password" maxLength={128} minLength={12} name="passwordConfirmation" required type="password" /></label>
    <label className="signup-honeypot" aria-hidden="true"><span>Website</span><input autoComplete="off" name="website" tabIndex={-1} /></label>
    {error ? <div className="login-error" role="alert">{error}</div> : null}
    <button disabled={loading || !enabled} type="submit">{enabled ? loading ? "Creating account…" : "Create account" : "Registration unavailable"}</button>
    <p className="recovery-notice">Email verification is required. Once verified, this address can also be used for self-service password recovery.</p>
    <Link className="signup-link" href="/login">Already have an account? Sign in</Link>
    <Link className="school-login-link" href="/">Return to DizyTrades</Link>
    <div className="login-safety"><b>SIMULATION ONLY</b><span>Account creation does not enable exchange connectivity or live execution.</span></div>
  </form>;
}
