# Isolated application recovery rehearsal

DizyTrades runs a destructive recovery exercise only inside two fresh operating-system temporary data roots. The source root is seeded with representative user-owned state, exported through the production backup builder, and restored through the production dry-run and apply functions into a separate target root.

## Covered state

The rehearsal currently covers:

- the complete sanitised terminal profile;
- retained Paper simulation runs;
- a migrated Manual Paper account with no open positions;
- Journal entries;
- named workspace layouts;
- empty retained Replay, Historical DizyFlow and DizyBrain Review collections;
- a separate control owner that must remain unchanged.

Individual retained-evidence validators and non-empty fixtures remain covered by the repository unit suite. The rehearsal records collection counts explicitly so zero evidence is never presented as a non-empty recovery success.

## Recovery sequence

1. Create distinct source and target temporary data roots.
2. Seed representative owner state in the source root.
3. Build the full v2 backup including workspace layouts.
4. Switch `DATA_DIR` to the empty target root.
5. Seed a different control owner.
6. Reject a tampered backup.
7. Reject cross-owner restoration.
8. Produce and inspect a dry-run plan.
9. Apply only the dry-run hash.
10. Export the restored owner again.
11. Compare a stable owner manifest that excludes volatile export/profile timestamps.
12. Run a second dry-run and prove the restore is idempotent.
13. Prove the control owner remained unchanged.
14. Write a sanitised JSON report and delete both temporary roots.

## Safety boundaries

This workflow:

- does not use production data;
- does not read the production `DATA_DIR`;
- does not call Render;
- does not use `RENDER_API_KEY` or `RENDER_SERVICE_ID`;
- does not attach or replace a Render disk;
- does not change a service, environment variable, domain or deployment;
- does not enable live trading.

The workflow proves the application backup and restore boundary against a real isolated filesystem. It does **not** prove that Render persistent-disk attachment, replacement or snapshot procedures work. That remains a separate infrastructure rehearsal requiring an isolated Render service or disk and explicit cost/impact approval.

## Evidence

The GitHub Actions workflow uploads `report.json` for 30 days. It contains backup and stable-manifest hashes, collection counts, restore results and boolean assertions. Temporary filesystem paths, user secrets and environment values are excluded.
