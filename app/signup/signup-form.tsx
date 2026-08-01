"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(data.entries());
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Registration failed.");
      router.replace("/terminal");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>DizyTrades</strong><small>Everything Dizy™</small></div></div>
    <div className="test-chip"><i /> CREATE YOUR WORKSPACE</div>
    <h1>Create your account</h1>
    <p>Save settings, paper trades and workspace preferences in your own isolated profile.</p>
    <label><span>Username (optional)</span><input autoComplete="username" maxLength={32} minLength={3} name="username" pattern="[A-Za-z0-9_.-]{3,32}" /></label>
    <label><span>Email (optional)</span><input autoComplete="email" maxLength={254} name="email" type="email" /></label>
    <label><span>Password</span><input autoComplete="new-password" maxLength={128} minLength={12} name="password" required type="password" /></label>
    <label><span>Confirm password</span><input autoComplete="new-password" maxLength={128} minLength={12} name="passwordConfirmation" required type="password" /></label>
    <label className="signup-honeypot" aria-hidden="true"><span>Website</span><input autoComplete="off" name="website" tabIndex={-1} /></label>
    {error ? <div className="login-error" role="alert">{error}</div> : null}
    <button disabled={loading || !enabled} type="submit">{enabled ? loading ? "Creating workspace…" : "Create account" : "Registration unavailable"}</button>
    <p className="recovery-notice">Password reset is not yet self-service. Keep your sign-in details somewhere secure.</p>
    <Link className="signup-link" href="/login">Already have an account? Sign in</Link>
    <Link className="school-login-link" href="/">Return to DizyTrades</Link>
    <div className="login-safety"><b>SIMULATION ONLY</b><span>Account creation does not enable exchange connectivity or live execution.</span></div>
  </form>;
}
