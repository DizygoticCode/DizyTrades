### Goal

Extend DizyPaper visible-book execution to Reverse and Flatten All without reusing consumed liquidity.

### Intended implementation

- Carry prior consumed contract volume through immutable depth evidence.
- Make a reverse close leg consume the book before the opposite entry begins.
- Leave the old position partially open and open no opposite trade when the close leg cannot finish.
- Allow a fully closed reverse to open only the remaining visible opposite-side volume.
- Flatten each symbol through its own fresh public DizyFlow book and retain honest residual positions.
- Preserve sequential-book evidence through backup/restore and reject tampering.
- Require current contract metadata and fresh depth at the HTTP boundary.
- Keep static slippage only as a direct-test/legacy fallback.

### Boundaries

- Automatic stop, target and liquidation depth execution remains the final depth-lifecycle slice.
- No pending-order engine or live execution.

### Validation

The branch-only workflow must apply serial patch stages, run focused tests, the full unit suite, lint and production build, delete its temporary machinery, and commit the clean implementation. The final reviewed head will also require normal CI and Chromium smoke before merge.
