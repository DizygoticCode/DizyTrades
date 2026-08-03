import { readFile, writeFile } from "node:fs/promises";

async function replace(path, before, after) {
  const source = await readFile(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing expected status text in ${path}`);
  await writeFile(path, source.replace(before, after));
}

await replace(
  "ROADMAP.md",
  "- [ ] simulator accounting audit",
  "- [x] simulator accounting audit",
);
await replace(
  "ROADMAP.md",
  "The authentication and storage review is recorded in [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md). It hardens fail-closed feature flags, session parsing and fallback behaviour, outage throttling, request-origin boundaries, owner-ID/path isolation and auth-database permissions while documenting accepted beta limitations.\n\nDeployment/recovery evidence now has two completed layers:",
  "The authentication and storage review is recorded in [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md). It hardens fail-closed feature flags, session parsing and fallback behaviour, outage throttling, request-origin boundaries, owner-ID/path isolation and auth-database permissions while documenting accepted beta limitations.\n\nThe simulator accounting review is recorded in [docs/SIMULATOR_ACCOUNTING_AUDIT.md](docs/SIMULATOR_ACCOUNTING_AUDIT.md). It adds executable Manual Paper cash, fee, funding and settlement reconciliation; corrects signal-simulator maximum-notional sizing; and keeps open mark-to-market positions out of completed win-rate and profit-factor statistics.\n\nDeployment/recovery evidence now has two completed layers:",
);
await replace(
  "ROADMAP.md",
  "DizyPaper Fidelity V2, workflow/accessibility, deployment observation, application recovery rehearsal and the authentication/storage threat review are complete. This milestone closes after the remaining independent engineering, simulator, Replay, backup-conflict and browser-accessibility reviews are stable.",
  "DizyPaper Fidelity V2, workflow/accessibility, deployment observation, application recovery rehearsal, authentication/storage and simulator-accounting reviews are complete. This milestone closes after the remaining independent engineering, Replay, backup-conflict and browser-accessibility reviews are stable.",
);

await replace(
  "README.md",
  "- [x] authentication and storage threat review\n\n### Active next programmes",
  "- [x] authentication and storage threat review\n- [x] simulator accounting audit and executable reconciliation\n\n### Active next programmes",
);
await replace(
  "README.md",
  "- [ ] simulator accounting and Replay future-leakage review",
  "- [ ] Replay future-leakage review",
);
await replace(
  "README.md",
  "The active authentication and storage findings, remediations and accepted beta limitations are documented in [SECURITY.md](SECURITY.md) and [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md).",
  "The active authentication, storage and simulator-accounting findings, remediations and accepted beta limitations are documented in [SECURITY.md](SECURITY.md), [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md) and [docs/SIMULATOR_ACCOUNTING_AUDIT.md](docs/SIMULATOR_ACCOUNTING_AUDIT.md).",
);

await replace(
  "RELEASE_NOTES.md",
  "### Workflow and accessibility",
  "### Simulator accounting audit\n\n- Added executable reconciliation for native Manual Paper cash, realised P/L, active entry fees, fill notional, fee components, funding and margin settlements.\n- Rejects current account and backup economic tampering instead of silently normalising contradictory values.\n- Preserves legacy and retention-bounded history honestly when complete reconstruction is unavailable.\n- Replaced lossy Manual Paper owner-ID rewriting with strict one-to-one validation.\n- Corrected confirmed-signal maximum-notional sizing so notional cannot exceed either the configured ceiling or equity-based leverage capacity.\n- Separated completed trades from open mark-to-market positions for win rate and profit factor.\n- Added realised versus marked P/L decomposition, including live mark updates.\n\n### Workflow and accessibility",
);
await replace(
  "RELEASE_NOTES.md",
  "- Simulator accounting and Replay future-leakage review.",
  "- Replay future-leakage review.",
);
