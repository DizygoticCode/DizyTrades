"use client";

import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordClient() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") || "";
    window.history.replaceState(null, "", window.location.pathname);
    setToken(value || null);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          password: data.get("password"),
          passwordConfirmation: data.get("passwordConfirmation"),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Password could not be reset.");
      setComplete(true);
      setToken(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password could not be reset.");
    } finally {
      setLoading(false);
    }
  }

  if (token === null && !complete) return <div className="login-card" role="status">
    <div className="login-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>DizyTrades</strong><small>Everything Dizy™</small></div></div>
    <div className="test-chip"><i /> ACCOUNT SECURITY</div>
    <h1>Reset link unavailable</h1>
    <p>This password-reset link is missing, expired or has already been removed from the page.</p>
    <a className="signup-link" href="/forgot-password">Request a fresh reset email</a>
  </div>;

  if (complete) return <div className="login-card" role="status">
    <div className="login-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>DizyTrades</strong><small>Everything Dizy™</small></div></div>
    <div className="test-chip"><i /> PASSWORD UPDATED</div>
    <h1>Password changed</h1>
    <p>Your old DizyTrades sessions have been revoked. Sign in again with the new password.</p>
    <a className="signup-link" href="/login">Sign in</a>
  </div>;

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>DizyTrades</strong><small>Everything Dizy™</small></div></div>
    <div className="test-chip"><i /> ACCOUNT SECURITY</div>
    <h1>Choose a new password</h1>
    <p>Use between 12 and 128 characters. Successful reset revokes existing database sessions.</p>
    <label><span>New password</span><input autoComplete="new-password" maxLength={128} minLength={12} name="password" required type="password" /></label>
    <label><span>Confirm new password</span><input autoComplete="new-password" maxLength={128} minLength={12} name="passwordConfirmation" required type="password" /></label>
    {error ? <div className="login-error" role="alert">{error}</div> : null}
    <button disabled={loading || !token} type="submit">{loading ? "Updating password…" : "Update password"}</button>
    <a className="school-login-link" href="/login">Cancel and return to sign in</a>
    <div className="login-safety"><b>SINGLE USE</b><span>Password-reset tokens expire after 60 minutes and are deleted after a successful reset.</span></div>
  </form>;
}
