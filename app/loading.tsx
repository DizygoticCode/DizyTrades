export default function Loading() {
  return (
    <main className="login-shell">
      <section className="login-card" aria-live="polite" aria-busy="true">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>DizyTrades</strong><small>Everything Dizy™</small></div>
        </div>
        <div className="test-chip"><i /> PREPARING WORKSPACE</div>
        <h1>Loading DizyTrades…</h1>
        <p>Preparing market data, workspace settings and the requested page.</p>
        <button disabled type="button">Please wait…</button>
        <div className="login-safety"><b>SIMULATION ONLY</b><span>Live execution remains disabled.</span></div>
      </section>
    </main>
  );
}
