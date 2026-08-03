# Replay Future-Leakage Audit

Status: completed for the active simulation-only beta in August 2026.

This review covers interactive Replay, Journal Replay launch, retained Historical Replay Memory, Historical DizyFlow Replay and deterministic DizyBrain historical trade review. It verifies temporal evidence boundaries; it does not approve live execution or claim that missing historical data can be reconstructed.

## Finding corrected

Two timestamp-navigation paths used a ceiling lookup: the first candle whose opening timestamp was greater than or equal to the requested instant.

That behaviour was harmless for exact candle-open timestamps, but a timestamp inside an interval or inside a retained-history gap could move the cursor to the next candle. The chart and strategy prefix would then contain evidence that did not yet exist at the requested instant.

Both paths now use the shared `replayCursorAtOrBefore` selector:

```text
selected candle = newest retained candle whose opening time <= requested time
```

The selector uses a deterministic binary search. Journal Replay still rejects timestamps outside the loaded range instead of silently clamping them. General Replay timestamp jumps retain their existing boundary clamping while never advancing into a future candle.

## Interactive Replay boundary

`createReplaySnapshot` derives one immutable prefix ending at the authoritative cursor. DizySignals analysis and the replay-provenance DizyBrain snapshot receive only that prefix.

The adversarial audit appends extreme future candles while holding the cursor fixed and verifies that:

- the complete Replay snapshot remains byte-for-byte equivalent;
- the latest visible candle remains the cursor candle;
- no emitted trade signal has a timestamp after the cursor;
- DizyBrain Replay provenance reports the cursor timestamp rather than the loaded-history end.

Replay timers advance one candle at a time. Identity changes cancel the active session, and stale asynchronous launches are rejected by generation tokens and abort signals.

## Journal Replay launch boundary

Journal launches validate market key, symbol and timeframe before selecting a cursor. Retained memory is preferred only when its identity matches; validation or loading failure falls through to current rolling history without mixing the two arrays.

The launch cursor now selects the exact or latest prior candle. A timestamp between two candles or inside a gap cannot reveal the later candle.

## Retained Historical Replay Memory boundary

The server-side capture path:

- accepts only valid timeframe-aligned candles;
- sorts and deduplicates them;
- rejects any candle opening after the authoritative capture time;
- excludes a candle that had opened but had not closed by capture time;
- requires exact closed entry and exit candles;
- requires recorded entry and exit prices to fall inside those candles;
- preserves gaps as explicit warnings rather than fabricating candles;
- integrity-hashes the retained candle array and validates that hash on read.

The audit exercises both forming-candle exclusion and explicit post-capture rejection.

## Historical DizyFlow boundary

Historical DizyFlow sample selection is exact-or-prior only. It never interpolates and never substitutes a future sample. A prior sample older than the configured maximum age becomes unavailable rather than being carried forward indefinitely.

Replay event windows use the half-open/closed interval:

```text
previous Replay time < event time <= current Replay time
```

Backward movement emits no events. Future events remain excluded until the cursor reaches them.

## DizyBrain historical review boundary

The deterministic historical review requires exact retained signal, entry and exit candle identities. It exposes separate immutable arrays for:

- candles through signal;
- candles through entry;
- candles through exit;
- candles during the trade;
- candles strictly after entry through exit;
- candles after exit.

Setup, signal and entry evidence use their exact prefixes. Excursion evidence stops at exit. Post-exit candles remain separately labelled hindsight context; they are not inserted into pre-entry prefixes or treated as evidence that was available when the trade was opened.

## Accepted boundaries

- Replay operates on closed candle timestamps. Intrabar ordering inside a candle remains unavailable unless separately retained by an appropriate evidence source.
- A gap means the newest known prior candle may be older than one expected interval. Replay does not invent the missing candle.
- Retained post-exit candles are hindsight evidence for review only.
- Historical DizyFlow is compact retained evidence, not a reconstructed full order book or trade tape.
- Rolling-history Journal Replay remains dependent on the currently loaded bounded history when no retained memory exists.
- Live market state, current DizyFlow and current DizyBrain evidence are not substituted into historical Replay.
- Live execution remains disabled.

## Automated evidence

Tests cover:

- exact-or-prior timestamp selection at exact timestamps, inside intervals and across gaps;
- Journal Replay identity/range rejection and non-future cursor selection;
- Replay snapshot invariance under appended future candles;
- signal timestamps bounded by the Replay cursor;
- Historical DizyFlow exact/prior sample selection, stale handling, forward event windows and backward jumps;
- forming-candle exclusion and post-capture rejection in retained Replay Memory;
- exact signal, entry and exit prefixes in historical review;
- explicit isolation of post-exit hindsight candles;
- all existing Replay, retained-memory, Historical DizyFlow, Journal and DizyBrain review suites.
