# DizyFlow visual verification

The development-only route `/dizyflow-fixture` mounts the production
`DizyFlowPrimitive`; it is not a parallel or mock renderer. The fixture includes
24 confirmed candles, persistent and removed bid/ask levels, buy and sell trades,
and depth/trade events in the live interval after the final confirmed candle.

## Reproduce locally

Run the application in development mode with Node 22:

```sh
npm run dev
```

Open `http://localhost:3000/dizyflow-fixture`, then verify all of the following:

1. The bid and ask bands span multiple candles and stop where levels disappear.
2. Buy and sell bubbles are centered on their volume-weighted time and VWAP.
3. The final live liquidity segment and buy bubble appear to the right of the
   final confirmed candle.
4. Candle bodies and wicks paint over both DizyFlow layers.
5. No heatmap cell or bubble appears against the left chart margin.
6. Use **Zoom in**, **Zoom out**, and **Change vertical scale**, then drag both
   chart scales to confirm that all marks remain aligned.

Screenshots can be generated locally into the ignored `artifacts/` directory.
For example, with Playwright available:

```sh
mkdir -p artifacts
npx playwright screenshot \
  --viewport-size=1440,800 \
  --wait-for-timeout=3000 \
  http://localhost:3000/dizyflow-fixture \
  artifacts/dizyflow-fixture.png
```

The PNG is deliberately excluded from Git. This keeps the pull request entirely
text-based while preserving a repeatable browser-rendered verification workflow.
The route calls `notFound()` outside development, so it cannot be used on Render
or another production deployment.
