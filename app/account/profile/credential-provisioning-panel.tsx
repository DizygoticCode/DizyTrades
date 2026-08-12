import type { CustodyMetadata } from "../../lib/credential-custody";
import CredentialAuthorizationForm from "./credential-authorization-form";

export default function CredentialProvisioningPanel({ enabled, credential, outcome }: { enabled: boolean; credential: CustodyMetadata | null; outcome?: string }) {
  const status = !enabled
    ? "Unavailable — custody and provisioning are disabled by default."
    : credential
      ? `Configured for ${credential.accountRef}; key version ${credential.keyVersion}. Secret values cannot be read back.`
      : "Not configured.";
  return <section className="profile-card" aria-labelledby="credential-provisioning-title">
    <h2 id="credential-provisioning-title">Future-execution credential custody</h2>
    <p><strong>This does not enable live trading or connect to MEXC.</strong> The read-only Account Companion remains separate.</p>
    <p role="status">{outcome || status}</p>
    {enabled && <>
      <CredentialAuthorizationForm />
      <p>Credential values use a browser-native, server-handled submission and are never processed by client JavaScript. Authorize first, then submit exactly once.</p>
      <form method="post" action="/api/account/credential-provisioning" autoComplete="off">
        <input type="hidden" name="action" value="provision" />
        <label>Account reference<input name="accountRef" required maxLength={64} defaultValue="owner-primary" /></label>
        <label>Future API key<input name="apiKey" type="password" required maxLength={512} autoComplete="off" /></label>
        <label>Future API secret<input name="apiSecret" type="password" required maxLength={512} autoComplete="off" /></label>
        <button type="submit">Submit directly to encrypted custody</button>
      </form>
      {credential && <form method="post" action="/api/account/credential-provisioning">
        <input type="hidden" name="action" value="revoke" /><input type="hidden" name="accountRef" value={credential.accountRef} />
        <button type="submit">Revoke configured credentials</button>
      </form>}
    </>}
  </section>;
}
