"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ViewerLauncher() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "error">("loading");

  const launch = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/auth/viewer", { method: "POST" });
      if (!response.ok) throw new Error("Viewer session unavailable.");
      router.replace("/terminal");
      router.refresh();
    } catch {
      setState("error");
    }
  }, [router]);

  useEffect(() => {
    void launch();
  }, [launch]);

  return (
    <main className="login-shell">
      <section className="login-card" aria-live="polite">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>DizyTrades</strong><small>View-only terminal</small></div>
        </div>
        <div className="test-chip"><i /> SIMULATION ONLY</div>
        <h1>{state === "loading" ? "Opening the terminal…" : "Viewer session unavailable"}</h1>
        <p>{state === "loading" ? "Creating a temporary read-only session. No profile, exchange credentials or live-order route is used." : "The temporary viewer session could not be created. Retry, sign in, or return to the public site."}</p>
        {state === "error" ? <button onClick={() => void launch()} type="button">Retry view-only terminal</button> : <button disabled type="button">Preparing workspace…</button>}
        <Link className="signup-link" href="/login">Sign in instead</Link>
        <Link className="school-login-link" href="/">Return to Everything Dizy™</Link>
        <div className="login-safety"><b>VIEW ONLY</b><span>Public market data and simulation tools. Live execution remains disabled.</span></div>
      </section>
    </main>
  );
}
