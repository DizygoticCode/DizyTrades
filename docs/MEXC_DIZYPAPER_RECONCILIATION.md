# MEXC and DizyPaper Shadow Reconciliation

Status: credentialless, mocked and observation-only. No real MEXC account is connected.

This slice compares one fresh typed MEXC futures account snapshot with one current DizyPaper account. It produces an immutable reconciliation report. It does not synchronise, mutate, overwrite or automatically correct either state.

## Required boundaries

Reconciliation requires:

- a `fresh` MEXC account availability state;
- a DizyPaper account whose existing accounting audit has no violations;
- an explicit settlement currency, defaulting to USDT;
- optional current public marks for DizyPaper equity comparison;
- bounded numeric tolerances.

Stale or unavailable exchange state is rejected through the shared fresh-state guard before any comparison occurs.

## Account-level comparison

For the selected settlement asset, the report compares:

- MEXC available balance with DizyPaper cash balance;
- MEXC equity with marked DizyPaper equity;
- MEXC position margin with DizyPaper used margin;
- MEXC unrealised PnL with marked DizyPaper unrealised PnL.

These values are labelled shadow observations. MEXC and DizyPaper use different execution, fee, funding, margin and liquidation assumptions, so differences are not automatically defects.

DizyPaper equity and unrealised PnL are compared only when every active paper symbol has a finite positive public mark supplied by the caller. Missing marks produce unavailable comparisons and an explicit warning; they are never treated as zero movement.

If MEXC does not return the selected settlement asset, account comparisons remain unavailable rather than inventing a zero balance.

## Position identity

Positions are matched by:

- futures symbol;
- long or short side.

Each result is one of:

- `aligned`;
- `different`;
- `incomparable`;
- `exchange-only`;
- `paper-only`;
- `ambiguous-exchange`.

Multiple current MEXC positions for the same symbol and side are reported as ambiguous. The engine does not choose one arbitrarily.

## Position fields

A one-to-one match compares:

- margin mode;
- leverage;
- contract volume;
- average entry price;
- initial/assigned margin;
- estimated liquidation price.

### Contract-volume rule

MEXC `holdVol` is contract volume. DizyPaper `quantity` is base exposure.

The engine compares MEXC `holdVol` only with DizyPaper's retained `contractVolume`. When that evidence is absent, the position is `incomparable`. Base quantity is never substituted merely because both fields are numeric.

## Tolerance policy

Numeric comparisons use explicit absolute and relative tolerances. Defaults are intentionally narrow, and callers cannot configure:

- absolute tolerance above 1;
- relative tolerance above 10%.

Tolerance affects only the `withinTolerance` observation. It never mutates either source value.

## DizyPaper accounting prerequisite

The existing `manual-paper-accounting-reconciliation-v1` audit runs before shadow comparison. Any accounting violation rejects the reconciliation. Legacy or retention-window warnings remain visible in the report.

## Deliberately absent

This slice does not add:

- MEXC credentials;
- private network access;
- a browser account page;
- exchange-to-paper copying;
- automatic position creation or closure;
- order preview;
- audit persistence;
- live execution.

## Automated evidence

Tests prove:

- a fully aligned mocked account reconciles deterministically;
- account cash, equity, margin and unrealised comparisons remain field-specific;
- missing paper contract volume never falls back to base quantity;
- leverage, margin mode, entry, margin, volume and liquidation differences remain visible;
- exchange-only, paper-only and ambiguous identities are explicit;
- missing settlement assets and public marks produce unavailable comparisons;
- stale exchange state is rejected;
- invalid DizyPaper accounting is rejected;
- excessively permissive tolerances are rejected;
- reports expose no credential, signature, order or mutation surface.

Live trading remains disabled.
