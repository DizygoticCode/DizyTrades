"use client";

import { FormEvent, useState } from "react";

export default function CredentialProvisioningPanel({ enabled }: { enabled: boolean }) {
  const [message, setMessage] = useState(enabled ? "Not configured." : "Unavailable — custody and provisioning are disabled by default.");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    const purpose = String(data.get("purpose"));
    const authorize = await fetch("/api/account/credential-provisioning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "authorize", purpose, password: data.get("password"), totp: data.get("totp") }) });
    if (!authorize.ok) { setMessage((await authorize.json()).error); form.reset(); return; }
    const payload = purpose === "provision" ? { action: "provision", accountRef: data.get("accountRef"), apiKey: data.get("apiKey"), apiSecret: data.get("apiSecret") } : { action: "revoke", accountRef: data.get("accountRef") };
    const result = await fetch("/api/account/credential-provisioning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await result.json(); setMessage(result.ok ? (purpose === "provision" ? "Encrypted credentials configured." : "Credentials revoked.") : body.error); form.reset();
  }
  return <section className="profile-card" aria-labelledby="credential-provisioning-title">
    <h2 id="credential-provisioning-title">Future-execution credential custody</h2>
    <p><strong>This does not enable live trading or connect to MEXC.</strong> The read-only Account Companion remains separate.</p>
    <p role="status">{message}</p>
    {enabled && <form onSubmit={submit} autoComplete="off">
      <label>Action<select name="purpose"><option value="provision">Provision</option><option value="revoke">Revoke</option></select></label>
      <label>Account reference<input name="accountRef" required maxLength={64} defaultValue="owner-primary" /></label>
      <label>Current password<input name="password" type="password" required maxLength={128} autoComplete="current-password" /></label>
      <label>Current authenticator code<input name="totp" inputMode="numeric" required pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" /></label>
      <label>Future API key<input name="apiKey" type="password" maxLength={512} autoComplete="off" /></label>
      <label>Future API secret<input name="apiSecret" type="password" maxLength={512} autoComplete="off" /></label>
      <button type="submit">Complete guarded ceremony</button>
    </form>}
  </section>;
}
