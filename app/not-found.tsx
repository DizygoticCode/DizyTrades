import Link from "next/link";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";

export default function NotFound() {
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="not-found-title">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>DizyTrades</strong><small>Everything Dizy™</small></div>
        </div>
        <div className="test-chip"><i /> ROUTE NOT FOUND</div>
        <h1 id="not-found-title">This market has moved.</h1>
        <p>The page does not exist, has been removed, or belonged to an earlier DizyTrades preview.</p>
        <Link className="button primary" href="/">Return to DizyTrades</Link>
        <Link className="signup-link" href="/explore">Open the view-only terminal</Link>
        <Link className="school-login-link" href="/school">Explore {SCHOOL_DISPLAY_NAME}</Link>
        <div className="login-safety"><b>SAFE ROUTES</b><span>Use the homepage, terminal, DizyDEX or DizyAcademy navigation.</span></div>
      </section>
    </main>
  );
}
