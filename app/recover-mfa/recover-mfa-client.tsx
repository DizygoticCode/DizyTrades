"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
const subscribe = () => () => undefined;
const clientToken = () => new URLSearchParams(location.hash.slice(1)).get("token") || "";
const serverToken = () => "";
export default function RecoverMfaClient() {
  const token = useSyncExternalStore(subscribe, clientToken, serverToken);
  const [state, setState] = useState<"ready" | "loading" | "done" | "error" | "unreachable">("ready");
  useEffect(() => { if (token) history.replaceState(null, "", location.pathname); }, [token]);
  async function recover() {
    setState("loading");
    try {
      const response = await fetch("/api/auth/mfa/email-recovery/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      setState(response.ok ? "done" : "error");
    } catch {
      // A dropped connection does not establish whether the server acted.
      setState("unreachable");
    }
  }
  if (state === "done") return <div className="login-card" role="status"><h1>MFA disabled</h1><p>All sessions, challenges, and recovery codes were revoked. Sign in with your existing password, then enrol MFA again.</p><a className="signup-link" href="/login">Sign in again</a></div>;
  return <div className="login-card"><h1>Break-glass MFA recovery</h1><p>This is separate from password reset. Continuing disables your authenticator and recovery codes and revokes every active session. Your password and verified email stay unchanged.</p>{state === "error" || !token ? <div className="login-error" role="alert">Recovery link is invalid or expired.</div> : null}{state === "unreachable" ? <div className="login-error" role="alert">Connection lost. MFA recovery could not be confirmed. Check your account status before retrying.</div> : null}<button disabled={!token || state === "loading"} onClick={recover}>{state === "loading" ? "Recovering…" : "Disable MFA and revoke sessions"}</button><a className="school-login-link" href="/login">Cancel</a></div>;
}
