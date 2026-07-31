"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="login-shell">
      <section className="login-card" role="alert">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>DizyTrades</strong><small>Workspace recovery</small></div>
        </div>
        <div className="test-chip"><i /> SOMETHING INTERRUPTED</div>
        <h1>This page could not finish loading</h1>
        <p>Your account and saved workspace have not been changed. Retry the page, open the view-only terminal, or return home.</p>
        <button onClick={reset} type="button">Retry this page</button>
        <Link className="signup-link" href="/explore">Open View-Only Terminal</Link>
        <Link className="school-login-link" href="/">Return to DizyTrades</Link>
        <div className="login-safety"><b>NO ORDER SENT</b><span>Live execution is disabled, so this interruption cannot place an exchange order.</span></div>
      </section>
    </main>
  );
}
