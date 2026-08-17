"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";
import { safeAuthReturnTarget } from "@/app/lib/auth-return-target";

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export default function LoginForm({ returnTo = "/terminal" }: { returnTo?: string }) {
  const router = useRouter();
  const postLoginTarget = safeAuthReturnTarget(returnTo);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [recoveryRequested, setRecoveryRequested] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setUnverified(false);
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
      const payload = await response.json() as { error?: string; code?: string; mfaRequired?: boolean; challenge?: string };
      if (!response.ok) {
        if (payload.code === "EMAIL_UNVERIFIED") setUnverified(true);
        throw new Error(payload.error || "Sign-in failed.");
      }
      if (payload.mfaRequired && payload.challenge) { setChallenge(payload.challenge); return; }
      router.replace(postLoginTarget);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const completeMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    const proof = new FormData(event.currentTarget).get("proof");
    try {
      const response = await fetch("/api/auth/mfa/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challenge, proof }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "MFA verification failed.");
      setChallenge(""); router.replace(postLoginTarget); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "MFA verification failed."); }
    finally { setLoading(false); }
  };

  const continueAsViewer = async () => {
    setLoading(true);
    setError("");
    setUnverified(false);
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

  const requestMfaRecovery = async () => {
    setLoading(true); setError("");
    try {
      await fetch("/api/auth/mfa/email-recovery/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challenge }) });
      setRecoveryRequested(true);
    } finally { setLoading(false); }
  };

  const interactive = hydrated && !loading;

  if (challenge) return <form className="login-card" onSubmit={completeMfa}>
    <h1>Two-factor verification</h1><p>Enter your authenticator code or a one-time recovery code.</p>
    <label><span>Verification code</span><input autoComplete="one-time-code" inputMode="text" name="proof" required /></label>
    {error ? <div className="login-error" role="alert">{error}</div> : null}
    <button disabled={!interactive} type="submit">{loading ? "Verifying…" : "Verify and sign in"}</button>
    {recoveryRequested ? <div role="status">If this database account has verified email, a 15-minute recovery link has been sent.</div> : <><button className="viewer-login" type="button" onClick={requestMfaRecovery}>Lost authenticator? Recover MFA by verified email</button><p>This break-glass action disables MFA and recovery codes, revokes active sessions, and requires fresh enrolment. It does not reset your password.</p></>}
    <button className="viewer-login" type="button" onClick={() => { setChallenge(""); setRecoveryRequested(false); }}>Cancel</button>
  </form>;
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
      {error ? <div className="login-error" role="alert">{error}{unverified ? <><br /><a href="/resend-verification">Resend verification email</a></> : null}</div> : null}
      <button disabled={!interactive} type="submit">
        {loading ? "Opening workspace…" : "Open DizyTrades"}
      </button>
      <a className="signup-link" href="/forgot-password">Forgot your password?</a>
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
