"use client";

import { useEffect, useRef, useState } from "react";

export default function VerifyEmailClient() {
  const started = useRef(false);
  const [state, setState] = useState<"working" | "verified" | "invalid">("working");
  const [message, setMessage] = useState("Confirming your email address…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") || "";
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setState("invalid");
      setMessage("This verification link is invalid or has already been used.");
      return;
    }
    void (async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Verification failed.");
        setState("verified");
        setMessage("Email verified. Your DizyTrades account can now sign in.");
      } catch (error) {
        setState("invalid");
        setMessage(error instanceof Error ? error.message : "Verification failed.");
      }
    })();
  }, []);

  return <div className="login-card" role="status">
    <div className="login-brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><strong>DizyTrades</strong><small>Everything Dizy™</small></div></div>
    <div className="test-chip"><i /> EMAIL VERIFICATION</div>
    <h1>{state === "working" ? "Confirming email" : state === "verified" ? "Email verified" : "Verification unavailable"}</h1>
    <p>{message}</p>
    {state === "verified" ? <a className="signup-link" href="/login">Sign in to DizyTrades</a> : null}
    {state === "invalid" ? <a className="signup-link" href="/resend-verification">Request a fresh verification email</a> : null}
    <div className="login-safety"><b>SINGLE USE</b><span>Verification tokens expire after 24 hours and are removed after successful confirmation.</span></div>
  </div>;
}
