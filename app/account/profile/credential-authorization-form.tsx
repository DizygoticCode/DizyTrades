"use client";

import { FormEvent, useState } from "react";

export default function CredentialAuthorizationForm() {
  const [message, setMessage] = useState("");
  async function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await fetch("/api/account/credential-provisioning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "authorize", purpose: data.get("purpose"), password: data.get("password"), totp: data.get("totp") }),
    });
    const body = await result.json();
    setMessage(result.ok ? `One ${String(data.get("purpose"))} submission is authorized for five minutes.` : body.error);
    form.reset();
  }
  return <form onSubmit={authorize} autoComplete="off">
    <label>Action<select name="purpose"><option value="provision">Provision</option><option value="revoke">Revoke</option></select></label>
    <label>Current password<input name="password" type="password" required maxLength={128} autoComplete="current-password" /></label>
    <label>Current authenticator code<input name="totp" inputMode="numeric" required pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" /></label>
    <button type="submit">Authorize one guarded submission</button>
    <p role="status">{message}</p>
  </form>;
}
