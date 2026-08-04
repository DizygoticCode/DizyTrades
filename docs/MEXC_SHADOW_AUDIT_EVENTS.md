# MEXC Shadow Audit Events

Status: credentialless immutable event foundation only. No real MEXC account is connected and no persistent audit store is added by this slice.

This boundary records minimised facts from the Read-only Account Companion foundations as deterministic SHA-256-linked events. It can record that account state was evaluated, a reconciliation was computed or a hypothetical preview was computed without copying the underlying private account state into the audit payload.

## Event kinds

The versioned schema supports three event kinds:

- `account-state-evaluated`;
- `reconciliation-computed`;
- `order-preview-computed`.

Each event contains only:

- schema version;
- deterministic event ID;
- one-based sequence;
- previous event hash;
- current event hash;
- one-way scope digest;
- event time;
- one minimised typed payload.

## Scope privacy

The caller supplies an owner/account scope identifier in memory. The event stores only:

`SHA-256("mexc-shadow-scope:v1:" + normalisedScope)`

Raw user IDs, account names and API identities are not retained in the event. Events from different scope digests cannot be appended to the same chain.

The digest prevents casual disclosure; it is not encryption. A low-entropy scope identifier could be guessed by someone who already has the digest, so any future persistent store must remain access-controlled.

## Minimised payloads

### Account-state evaluation

Records only:

- fresh, stale or unavailable status;
- decision eligibility;
- observation time when retained state exists;
- asset and open-position counts;
- bounded failure classification and provider code when applicable.

It does not record balances, symbols, position IDs or provider messages.

### Reconciliation computation

Records only:

- exchange observation time;
- settlement currency;
- counts of aligned, different, incomparable, exchange-only, paper-only and ambiguous results;
- a digest of the bounded reconciliation summary.

It does not record DizyPaper trade IDs, exchange position IDs, prices, margin, equity or notes.

### Hypothetical preview computation

Records only:

- exchange observation time;
- symbol, side and margin mode;
- calculable or blocked status;
- blocker count and blocker-set digest;
- digest of the bounded non-executable preview projection.

It does not record available balance, notional, margin, fee, price, volume or account positions.

## Hash chain

Canonical JSON sorts object keys recursively and rejects undefined, non-finite, cyclic or unsupported values. Each event hash covers:

- schema version;
- sequence;
- previous hash;
- scope digest;
- event time;
- exact typed payload.

The deterministic event ID includes the sequence and the first 20 hexadecimal characters of that event hash.

The verifier rejects:

- unsupported schemas;
- malformed sequence, time, hash or event ID;
- invalid or unexpected payload fields;
- secret-bearing or oversized payloads;
- content whose hash no longer matches;
- reordering or broken previous hashes;
- scope changes;
- backwards event time.

Appending validates the complete previous event independently, so second and later events do not assume that the previous event was sequence one.

## Integrity limitations

This hash chain is tamper-evident, not a digital signature and not non-repudiation. Anyone able to rewrite an entire unanchored file could construct a different valid chain.

A valid prefix also cannot prove that a later tail was not deleted. Detecting tail truncation requires an external trusted anchor such as a separately retained last hash, immutable object storage or another independently controlled record.

Those stronger storage and anchoring controls remain deferred. This slice provides the event schema, minimisation, deterministic construction and verification logic only.

## Persistence still open

The roadmap item for an immutable shadow audit log remains open because this slice does not yet implement:

- owner-scoped persistent storage;
- atomic append and concurrency control;
- retained last-hash anchoring;
- rotation and retention;
- export and recovery;
- administrative access policy;
- integration with a real read-only MEXC connection.

No new database, Render service, disk or paid tool is introduced.

## Automated evidence

Tests prove:

- three different source events append into one valid chain;
- second and third append validate their actual previous event;
- identical source/time/scope inputs produce identical events;
- raw scope, balances, identifiers and private details are absent;
- tampering, reordering, mixed scope and backwards time are rejected;
- malformed and secret-bearing payloads are rejected;
- canonical JSON is stable across key order and rejects unsafe values;
- a valid chain prefix remains valid while explicitly demonstrating the unanchored-tail limitation.

Live trading remains disabled.
