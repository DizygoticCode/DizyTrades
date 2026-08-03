# MEXC Account-State Availability Policy

Status: credentialless state machine only. No private MEXC account is connected.

This slice defines how a typed MEXC futures account snapshot moves between fresh, stale and unavailable states. It sits above the account-state model and below any future reconciliation, preview or user-interface layer.

## Core safety rule

Only `fresh` account state is eligible for a decision.

A stale snapshot may later be displayed as clearly labelled last-known information, but it must not drive:

- account reconciliation;
- hypothetical order previews;
- risk or margin decisions;
- live execution;
- any claim about the user's current exchange state.

The exported `requireFreshMexcAccountSnapshot` guard rejects both stale and unavailable states. Future decision code should use that guard rather than inspecting a snapshot field directly.

## Fresh state

A successful snapshot is fresh when:

- its observation timestamp is valid;
- it is not beyond the configured future-clock-skew allowance;
- its age is less than or equal to the caller's explicit maximum age.

Fresh state contains the immutable account snapshot, evaluated age and policy limit. `decisionEligible` is `true` only in this state.

The policy does not silently choose a long freshness window. Callers must provide one, and it cannot exceed five minutes. Future-clock tolerance defaults to two seconds and cannot exceed thirty seconds.

## Stale state

A snapshot becomes stale for either reason:

1. `age-limit`: the last successful observation exceeded the configured maximum age;
2. `refresh-failed`: a refresh failed while a previous snapshot was available.

A failed refresh degrades the retained snapshot immediately, even when its age remains inside the normal freshness window. This deliberately distinguishes “recently observed” from “successfully refreshed now.”

Repeated failures retain the original `staleSinceMs` transition time. They update the typed failure reason but do not pretend the snapshot became new.

## Unavailable state

State is unavailable when:

- no read-only account connection is configured;
- a refresh fails without any previous snapshot;
- snapshot timing exceeds the allowed future skew;
- retained state cannot be trusted.

Unavailable state contains no account snapshot.

## Typed failure classes

The state machine maps private-transport and schema failures to fixed, secret-free messages and explicit recovery actions.

| Failure | Recovery action |
| --- | --- |
| not configured | reconfigure |
| authentication rejected | reconfigure |
| IP whitelist rejected | reconfigure |
| Account read missing | reconfigure |
| Trade read missing | reconfigure |
| write permission required | security review |
| rate limit | retry |
| request timestamp/window rejected | retry |
| timeout | retry |
| provider unavailable | retry |
| malformed provider response | code review |
| account schema mismatch | code review |
| excessive clock skew | code review |
| unknown failure | code review |

The fixed messages do not expose provider text, credential values, stack traces or schema payloads. Provider codes may be retained as bounded numeric provenance.

A provider response indicating that a requested capability needs write permission is not treated as an invitation to broaden the key. It becomes `write-permission-rejected` and requires security review.

## Refresh transitions

- successful refresh → evaluate the new snapshot as fresh, stale-by-age or unavailable-by-clock-skew;
- failed refresh with previous fresh/stale snapshot → stale `refresh-failed` state retaining that exact immutable snapshot;
- failed refresh without previous snapshot → unavailable;
- successful refresh after stale/unavailable → fresh when the new observation satisfies policy.

No automatic retries, persistence or cache are implemented in this slice.

## Deliberately deferred

This policy does not add:

- MEXC credentials;
- a private API route;
- browser account-state display;
- retry scheduling;
- stale cache persistence;
- exchange-state reconciliation;
- order preview;
- shadow audit storage;
- live trading.

## Automated evidence

Tests prove:

- the exact freshness boundary;
- age-based staleness;
- tolerated and rejected future skew;
- immediate stale degradation after refresh failure;
- preservation of the first stale transition time;
- unavailable state when no snapshot exists;
- distinct authentication, whitelist, read-permission, write-permission, rate-limit, stale-request, malformed-response and schema classifications;
- fixed messages do not echo raw provider/schema errors;
- successful recovery from unavailable to fresh;
- stale and unavailable states cannot pass the fresh-decision guard;
- unsafe or excessively permissive timing policies are rejected.

Live trading remains disabled.
