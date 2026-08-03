# MEXC Hypothetical Order Preview

Status: credentialless calculation only. No order is created, signed or submitted.

This slice calculates an illustrative futures position beside one fresh MEXC-shaped account snapshot. It uses public contract metadata and caller-supplied hypothetical price and volume. The result is deliberately non-executable.

## Non-execution boundary

Every preview declares:

- `hypotheticalOnly: true`;
- `executable: false`;
- a versioned calculation method;
- explicit blockers, unchecked controls and warnings.

The model has no exchange host, endpoint path, HTTP method, request body, side code, external order ID, signature or transport dependency. It cannot be passed to the private GET-only transport as an order.

A `calculable` status means only that the supplied numbers can be calculated against the available mocked account and public contract evidence. It is not exchange approval, risk approval or a promise of execution.

## Required input

The preview requires:

- fresh typed MEXC account state;
- public MEXC contract metadata for the same symbol;
- long or short side;
- isolated or cross margin mode;
- integer leverage;
- contract volume;
- hypothetical execution price;
- maker or taker fee assumption;
- settlement currency, defaulting to USDT.

Stale or unavailable account state is rejected through the shared fresh-state guard.

## Calculated estimates

When sufficient numeric input exists, the preview estimates:

- base quantity from contract volume × contract size;
- notional from base quantity × hypothetical execution price;
- effective initial-margin rate as the more conservative of selected leverage and public contract initial-margin rate;
- initial margin;
- maker or taker fee from the public contract rate;
- combined illustrative cash requirement.

These are calculation estimates, not exchange-returned order economics.

## Account context

The report observes:

- available settlement-asset balance;
- whether that available balance covers estimated margin plus fee;
- same-side and opposite-side current position counts;
- existing same-side contract volume;
- projected same-side contract volume after the hypothetical addition.

It does not reserve funds or modify account state.

## Explicit blockers

The preview can be blocked by:

- symbol/contract mismatch;
- invalid or step-misaligned price;
- invalid, step-misaligned or out-of-range volume;
- leverage outside public contract limits;
- unsupported public margin mode;
- missing settlement asset;
- insufficient available balance for the estimate;
- projected same-side volume above the public contract maximum.

Blockers remain observations. No fallback leverage, rounded volume or alternative margin mode is silently selected.

## Explicitly unchecked

The credentialless preview cannot verify:

- the user's current risk tier;
- hedge versus one-way position mode;
- pending orders and reserved margin;
- the live order book;
- actual fill price or partial fill;
- funding changes between preview and a hypothetical fill;
- whether the contract currently allows API order placement.

These are returned as a fixed `unchecked` list. Public contract limits can be broader than the user's current private-account restrictions.

The official MEXC contract metadata documents public price/volume units, leverage limits, fees, margin rates, volume limits and supported margin modes. Private risk-tier and execution controls require later read-only evidence before stronger claims are possible.

Official reference: [MEXC Contract API](https://mexcdevelop.github.io/apidocs/contract_v1_en/).

## Deliberately absent

This slice does not add:

- MEXC credentials;
- a browser/API route;
- order serialization;
- order signing;
- order placement or cancellation;
- leverage or margin modification;
- automatic DizyPaper trade creation;
- shadow audit persistence;
- live trading.

## Automated evidence

Tests prove:

- a valid mocked preview calculates quantity, notional, margin, fee and cash requirement;
- the output is always hypothetical and non-executable;
- public price, volume, leverage and margin-mode constraints produce explicit blockers;
- insufficient or missing settlement balance blocks account-capacity claims;
- projected same-side volume includes current exchange positions;
- opposite-side positions produce a position-mode warning;
- maker economics remain explicitly illustrative;
- stale account state is rejected;
- symbol and settlement identity errors fail closed;
- output contains no credential, signature, endpoint, HTTP method or request body fields.

Live trading remains disabled.
