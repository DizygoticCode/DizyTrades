# Backup Restore and Conflict Audit

Status: completed for the active simulation-only beta in August 2026.

This review covers full user backup validation, dry-run planning, additive restore, workspace restore and deterministic conflict handling. It builds on the isolated recovery rehearsal and does not claim provider-level disk rollback or multi-file database transactions.

## Findings corrected

### Paper-run identity collisions were not conflicts

Profile Paper runs are retained by deterministic ID during restore. Previously, a target run with the same ID but different content was silently preserved and reported only as an existing ID.

Dry-run and apply now compare canonical content. Matching runs are explicitly counted as idempotent; different content with the same ID blocks restore.

### Additive profile restore could silently truncate history

Profiles retain at most 50 Paper runs. The previous merge appended missing backup runs and then sliced the merged list to 50, which could discard existing history without a conflict.

Dry-run now rejects a merge whose unique run count would exceed 50. The write path repeats the check and no longer truncates during restore.

### Journal capacity was checked after evidence creation

A restore that would exceed the 2,000-entry Journal limit could create Replay, Historical DizyFlow or DizyBrain evidence before the Journal write failed. That left a deterministic partial restore with orphan evidence.

Journal capacity is now part of dry-run conflict planning. Apply refuses the plan before creating any evidence. The Journal write repeats entry-ID, trade-ID and capacity checks in case state changes between planning and writing.

### Evidence collection capacity was not preflighted

The three retained-evidence stores enforce per-user count and byte limits when each file is created. A multi-file restore could therefore create early files and fail on a later one.

Dry-run now measures the current matching-file count and byte usage, calculates the encoded bytes for genuinely new backup evidence and rejects count or byte overflow for:

- Historical Replay Memory;
- Historical DizyFlow memory;
- DizyBrain historical trade reviews.

The individual stores remain authoritative and repeat their own limits during creation.

## Conflict contract

A restore is unsafe when any of the following is true:

- backup integrity or owner identity is invalid;
- a Journal entry ID exists with different content;
- a completed trade already belongs to another Journal entry;
- the existing Journal contains duplicate entry or trade IDs;
- the additive Journal would exceed 2,000 entries;
- a Paper-run ID exists with different content;
- the existing profile contains duplicate Paper-run IDs;
- the additive Paper-run history would exceed 50 runs;
- a retained evidence ID exists with different logical content;
- retained evidence count or byte limits would be exceeded;
- a workspace ID or case-insensitive name conflicts;
- the workspace count limit would be exceeded.

No apply operation begins while deterministic conflicts remain.

## Intentional additive behaviour

- Terminal settings are replaced only when the dry-run states that they differ.
- Matching Journal entries, Paper runs, evidence files and workspace layouts are idempotent.
- Existing Manual Paper history is preserved unless the target account is empty.
- A backup containing open Manual Paper positions is not restored because its market risk is stale.
- Missing retained evidence causes repaired unavailable references rather than fabricated history.

## Write ordering and recovery boundary

Retained evidence is created before Journal entries so a successfully written Journal never points to evidence that was not created. Profile and Manual Paper writes follow the Journal.

The filesystem stores use atomic file replacement individually, but the complete restore is not one cross-file database transaction. Unexpected operating-system or disk failure can still interrupt an apply between files. The restore remains deterministic and idempotent: validate the disk, run a fresh dry-run and reapply the same integrity-bound backup. Content conflicts prevent an already-created deterministic file from being replaced with different data.

Provider persistent-disk snapshot rollback remains deferred to the guarded live-execution milestone, where isolated infrastructure and cost are justified.

## Automated evidence

Tests cover:

- matching Paper-run idempotency;
- same-ID/different-content Paper-run rejection;
- 50-run additive-capacity rejection without truncation;
- 2,000-entry Journal capacity rejection;
- proof that a Journal-capacity conflict creates no retained Replay file;
- deterministic evidence count and byte conflict classification;
- integrity-hash binding between dry-run and apply;
- cross-owner rejection;
- Manual Paper open-position refusal and existing-history preservation;
- Journal entry/trade conflicts;
- evidence content conflicts;
- workspace ID, name and count conflicts;
- isolated destructive restore and repeated idempotent dry-run.

Live trading remains disabled.
