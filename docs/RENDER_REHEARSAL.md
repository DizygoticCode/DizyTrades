# Render deployment rehearsal

DizyTrades uses a read-only GitHub Actions rehearsal to verify that the configured Render service is reachable, that the expected commit becomes the live deploy, and that production still reports the simulation-only health contract.

## Required GitHub Actions secrets

- `RENDER_API_KEY` — a Render account API key stored only as an encrypted repository secret.
- `RENDER_SERVICE_ID` — the `srv-...` identifier for the DizyTrades web service.

The workflow never prints either value and never requests Render environment variables.

## Automatic runs

The rehearsal runs:

1. on the pull request that introduces or changes the rehearsal files, without requiring a particular deployed commit;
2. once after those files merge to `main`, waiting for that exact commit to become Render's live deploy;
3. manually through **Actions → Render deployment rehearsal → Run workflow**, optionally with a specific expected commit.

## Assertions

A successful report proves:

- the encrypted API key authenticated with Render;
- the configured service ID resolved to a Render service;
- the selected or expected deploy reached `live`;
- the service health endpoint returned HTTP 200;
- the health payload identified `dizytrades` in `test` mode;
- `liveTradingEnabled` remained `false`;
- recent service events could be read;
- no Render write endpoint was called.

The sanitised JSON evidence is retained as a GitHub Actions artifact for 30 days.

## Deliberate exclusions

This rehearsal does not:

- trigger, cancel, roll back, suspend or resume a deploy;
- read or modify environment variables;
- read build logs or application request logs;
- modify service settings, disks or domains;
- apply a production backup restore.

A successful read-only rehearsal is deployment evidence, not proof that persistent-disk recovery works. The recovery checkbox remains incomplete until a controlled backup export, validation, restore dry-run and isolated restore exercise have been performed without replacing newer production evidence.

## Credential hygiene

Use a dedicated temporary API key where practical. Revoke it in Render Account Settings when the rehearsal programme is complete or whenever exposure is suspected. Never paste the key into chat, an issue, a pull request, a workflow file or a repository variable.
