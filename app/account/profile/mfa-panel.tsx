"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { buildTotpEnrollmentUri, totpEnrollmentQrMatrix } from "../../lib/totp-qr";

type MfaStatus = Readonly<{ enabled: boolean; pending: boolean; eligible: boolean }>;

function groupedSetupKey(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") || secret;
}

function QrCode({ secret }: { secret: string }) {
  const matrix = useMemo(() => totpEnrollmentQrMatrix(secret), [secret]);
  const path = useMemo(() => {
    const parts: string[] = [];
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (matrix[y][x]) parts.push(`M${x} ${y}h1v1h-1z`);
      }
    }
    return parts.join("");
  }, [matrix]);

  return (
    <svg
      className="mfa-qr"
      viewBox="-4 -4 49 49"
      role="img"
      aria-labelledby="mfa-qr-title mfa-qr-description"
      shapeRendering="crispEdges"
    >
      <title id="mfa-qr-title">DizyTrades authenticator setup QR code</title>
      <desc id="mfa-qr-description">Scan this code with Google Authenticator or another compatible TOTP authenticator.</desc>
      <rect x="-4" y="-4" width="49" height="49" fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

export default function MfaPanel() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/mfa/status", { cache: "no-store" })
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setMessage("Unable to load MFA status."));
  }, []);

  async function send(path: string, body: Record<string, FormDataEntryValue | null>) {
    setMessage("");
    const response = await fetch(`/api/auth/mfa/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Request failed.");
      return null;
    }
    return payload;
  }

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = await send("enroll", { password: form.get("password") });
    if (!payload) return;
    setSecret(payload.secret);
    setCopied(false);
    setCodes([]);
    setMessage("Fresh setup key created. Scan the QR code, then confirm one current 6-digit code.");
    setStatus((current) => current && ({ ...current, pending: true }));
    event.currentTarget.reset();
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = await send("confirm", { code: form.get("code") });
    if (!payload) return;
    setSecret("");
    setCopied(false);
    setCodes(payload.recoveryCodes);
    setStatus((current) => current && ({ ...current, pending: false, enabled: true }));
    setMessage("Authenticator confirmed. Save the recovery codes below before leaving this page.");
  }

  async function sensitive(event: FormEvent<HTMLFormElement>, path: "recovery" | "disable") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = await send(path, { password: form.get("password"), proof: form.get("proof") });
    if (!payload) return;
    if (path === "recovery") {
      setCodes(payload.recoveryCodes);
      setMessage("Recovery codes regenerated. Existing sessions were revoked.");
    } else {
      setCodes([]);
      setSecret("");
      setStatus((current) => current && ({ ...current, enabled: false, pending: false }));
      setMessage("MFA disabled. Existing sessions were revoked.");
    }
  }

  async function copySetupKey() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setMessage("Setup key copied. Paste it into the authenticator as a time-based key.");
    } catch {
      setCopied(false);
      setMessage("Clipboard access was blocked. Use the grouped setup key shown below.");
    }
  }

  if (!status) {
    return (
      <section className="mfa-security-card" aria-labelledby="mfa-title">
        <div className="mfa-security-heading">
          <div>
            <p className="mfa-kicker">ACCOUNT SECURITY</p>
            <h2 id="mfa-title">Multi-factor authentication</h2>
          </div>
          <span className="mfa-status-badge">Loading</span>
        </div>
        <p className="mfa-muted">Loading security status…</p>
      </section>
    );
  }

  if (!status.eligible) {
    return (
      <section className="mfa-security-card" aria-labelledby="mfa-title">
        <div className="mfa-security-heading">
          <div>
            <p className="mfa-kicker">ACCOUNT SECURITY</p>
            <h2 id="mfa-title">Multi-factor authentication</h2>
          </div>
          <span className="mfa-status-badge mfa-status-off">Unavailable</span>
        </div>
        <p className="mfa-muted">MFA is available to database accounts. Legacy owner/admin sessions remain compatible with the application but do not satisfy guarded-execution MFA.</p>
      </section>
    );
  }

  return (
    <section className="mfa-security-card" aria-labelledby="mfa-title">
      <div className="mfa-security-heading">
        <div>
          <p className="mfa-kicker">ACCOUNT SECURITY</p>
          <h2 id="mfa-title">Multi-factor authentication</h2>
          <p>Protect privileged DizyTrades actions with a time-based authenticator code. The authenticator secret remains encrypted at rest.</p>
        </div>
        <span className={`mfa-status-badge ${status.enabled ? "mfa-status-on" : "mfa-status-off"}`}>
          {status.enabled ? "Enabled" : "Not enabled"}
        </span>
      </div>

      {message ? <div className="mfa-message" role="status">{message}</div> : null}

      {!status.enabled && !secret ? (
        <div className="mfa-start-panel">
          <div>
            <h3>Connect Google Authenticator</h3>
            <p>Generate a fresh one-time setup key, then scan the QR code with your phone. Nothing is sent to an external QR service.</p>
            {status.pending ? <p className="mfa-warning">A previous enrollment is still pending. Starting again replaces that unconfirmed setup key.</p> : null}
          </div>
          <form className="mfa-form" onSubmit={enroll}>
            <label>
              <span>Current DizyTrades password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="mfa-primary" type="submit">Generate setup QR</button>
          </form>
        </div>
      ) : null}

      {!status.enabled && secret ? (
        <div className="mfa-enrollment">
          <div className="mfa-qr-card">
            <div className="mfa-step-label">STEP 1 OF 2</div>
            <h3>Scan this QR code</h3>
            <p>Google Authenticator → <strong>+</strong> → <strong>Scan a QR code</strong>.</p>
            <div className="mfa-qr-frame"><QrCode secret={secret} /></div>
            <div className="mfa-manual-key">
              <span>Manual setup key</span>
              <code>{groupedSetupKey(secret)}</code>
              <button className="mfa-secondary" type="button" onClick={copySetupKey}>{copied ? "Copied" : "Copy setup key"}</button>
              <small>If you enter it manually, choose a <strong>time-based</strong> key. Spaces are only for readability.</small>
            </div>
          </div>

          <div className="mfa-confirm-card">
            <div className="mfa-step-label">STEP 2 OF 2</div>
            <h3>Confirm the authenticator</h3>
            <p>Enter the current six-digit DizyTrades code shown on your phone. This proves the QR/manual key was imported correctly before MFA becomes active.</p>
            <form className="mfa-form" onSubmit={confirm}>
              <label>
                <span>6-digit authenticator code</span>
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  required
                />
              </label>
              <button className="mfa-primary" type="submit">Confirm and enable MFA</button>
            </form>
            <div className="mfa-restart">
              <p>If the code is invalid because the previous key was entered incorrectly, discard that authenticator entry and generate a new setup key.</p>
              <button className="mfa-secondary" type="button" onClick={() => { setSecret(""); setCopied(false); setMessage("Previous local setup display cleared. Enter your password to generate a fresh pending setup key."); }}>
                Start over with a new key
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {codes.length ? (
        <div className="mfa-recovery-codes" role="status">
          <div>
            <p className="mfa-kicker">ONE-TIME DISPLAY</p>
            <h3>Save these recovery codes now</h3>
            <p>Store them somewhere secure and separate from your password. They will not be shown again.</p>
          </div>
          <ul>{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ul>
          <button className="mfa-secondary" type="button" onClick={() => setCodes([])}>I saved the recovery codes</button>
        </div>
      ) : null}

      {status.enabled ? (
        <div className="mfa-enabled-grid">
          <div className="mfa-enabled-summary">
            <strong>Authenticator protection active</strong>
            <p>Guarded execution ceremonies can now require fresh, replay-resistant TOTP codes.</p>
          </div>
          <form className="mfa-form mfa-maintenance" onSubmit={(event) => sensitive(event, "recovery")}>
            <h3>Regenerate recovery codes</h3>
            <Reauth />
            <button className="mfa-secondary" type="submit">Regenerate and revoke sessions</button>
          </form>
          <form className="mfa-form mfa-maintenance mfa-danger-zone" onSubmit={(event) => sensitive(event, "disable")}>
            <h3>Disable MFA</h3>
            <Reauth />
            <button className="mfa-danger" type="submit">Disable MFA and revoke sessions</button>
          </form>
        </div>
      ) : null}

      {secret ? <span className="mfa-uri-proof" aria-hidden="true">{buildTotpEnrollmentUri(secret).startsWith("otpauth://totp/") ? "local-totp-qr" : ""}</span> : null}
    </section>
  );
}

function Reauth() {
  return (
    <>
      <label>
        <span>Current password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <label>
        <span>Authenticator or recovery code</span>
        <input name="proof" autoComplete="one-time-code" required />
      </label>
    </>
  );
}
