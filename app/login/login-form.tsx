"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";

export default function LoginForm() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setHydrated(true), []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: data.get("identifier"),
          password: data.get("password"),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Sign-in failed.");
      router.replace("/terminal");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const continueAsViewer = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/viewer", { method: "POST" });
      if (!response.ok) throw new Error("Viewer session unavailable.");
      router.replace("/terminal");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Viewer session unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const interactive = hydrated && !loading;

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div><strong>DizyTrades</strong><small>Everything Dizy™</small></div>
      </div>
      <div className="test-chip"><i /> SIMULATION WORKSPACE</div>
      <h1>Welcome back</h1>
      <p>Sign in to your charting, signals, order-flow and paper-trading workspace.</p>
      <label>
        <span>Username or email</span>
        <input autoComplete="username" name="identifier" required />
      </label>
      <label>
        <span>Password</span>
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      {error ? <div className="login-error" role="alert">{error}</div> : null}
      <button disabled={!interactive} type="submit">
        {loading ? "Opening workspace…" : "Open DizyTrades"}
      </button>
      <a className="signup-link" href="/signup">Create an account</a>
      <button className="viewer-login" disabled={!interactive} onClick={continueAsViewer} type="button">
        Open View-Only Terminal
      </button>
      <a className="school-login-link" href="/school">Explore {SCHOOL_DISPLAY_NAME}</a>
      <div className="login-safety">
        <b>SIMULATION ONLY</b>
        <span>No exchange credentials or live-order route is enabled.</span>
      </div>
    </form>
  );
}
