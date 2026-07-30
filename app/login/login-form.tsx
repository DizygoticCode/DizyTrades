"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          email: data.get("identifier"),
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
      router.replace("/explore");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Viewer session unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div><strong>DizyCharts</strong><small>&amp; DizySignals</small></div>
      </div>
      <div className="test-chip"><i /> PRIVATE TEST TERMINAL</div>
      <h1>Welcome to DizyTrades</h1>
      <p>Sign in to your isolated signal, paper-test and risk workspace.</p>
      <label>
        <span>Username or email</span>
        <input autoComplete="username" name="identifier" placeholder="you@example.com" required type="text" />
      </label>
      <label>
        <span>Password</span>
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      {error ? <div className="login-error" role="alert">{error}</div> : null}
      <button disabled={loading} type="submit">
        {loading ? "Signing in…" : "Open trading terminal"}
      </button>
      <button className="viewer-login" disabled={loading} onClick={continueAsViewer} type="button">
        Continue as Viewer
      </button>
      <div className="login-safety">
        <b>TEST MODE</b>
        <span>No exchange credentials or live-order route is enabled.</span>
      </div>
    </form>
  );
}
