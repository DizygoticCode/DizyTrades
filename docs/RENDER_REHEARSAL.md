# Render deployment rehearsal

DizyTrades uses a read-only GitHub Actions rehearsal to verify that the configured Render service is reachable, that the expected commit becomes the live deploy, and that production still reports the simulation-only health contract. The same workflow now opens the public view-only terminal and exercises the deployed DizyFlow presentation boundary.

## Required GitHub Actions secrets

- `RENDER_API_KEY` — a Render account API key stored only as an encrypted repository secret.
- `RENDER_SERVICE_ID` — the `srv-...` identifier for the DizyTrades web service.

The workflow never prints either value and never requests Render environment variables.

## Automatic runs

The rehearsal runs:

1. on pull requests that change the rehearsal, heatmap acceptance contract or roadmap, without requiring the branch commit to be deployed;
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
- no Render write endpoint was called;
- the public view-only terminal opened without private-account access;
- DizyFlow reached a live, recovering or Replay presentation rather than remaining off or loading;
- Heatmap and Bubbles remained independently controllable;
- the chart canvases contained rendered pixels;
- toggling the heatmap changed the rendered chart;
- changing bounded heatmap aggregation and grouping preferences changed the renderer;
- the chart and DizyFlow controls remained usable after a compact viewport resize.

The sanitised JSON evidence is retained as a GitHub Actions artifact for 30 days. It contains state labels, booleans, canvas dimensions, sampled-pixel counts and checksums only. It does not retain page text, screenshots, prices, trades, order-book rows or browser-storage inventories.

## Deliberate exclusions

This rehearsal does not:

- trigger, cancel, roll back, suspend or resume a deploy;
- read or modify Render environment variables;
- read build logs or application request logs;
- modify service settings, disks or domains;
- apply a production backup restore;
- submit orders or interact with private account state;
- export raw public-market evidence from the browser.

A successful read-only rehearsal is deployment and presentation evidence, not proof that persistent-disk recovery works or that displayed liquidity predicts future price.

## Credential hygiene

Use a dedicated temporary API key where practical. Revoke it in Render Account Settings when the rehearsal programme is complete or whenever exposure is suspected. Never paste the key into chat, an issue, a pull request, a workflow file or a repository variable.
