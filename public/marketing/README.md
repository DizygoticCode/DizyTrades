# DizyTrades marketing screenshots

The checked-in screenshots are part of the current repository marketing UI:

- `hero-terminal.webp` — full DizyCharts terminal with DizyFlow and DOM live
- `feature-signals.webp` — confirmed-candle confluence summary
- `feature-paper.webp` — manual DizyPaper controls
- `feature-flow.webp` — DizyFlow toolbar and large-order activity
- `feature-dom.webp` — depth-of-market visual
- `feature-learning.webp` — DizyAcademy lesson view

`app/marketing/terminal-preview.tsx` renders the hero screenshot using the shared
`app/marketing/product-visual.tsx` frame. The marketing feature visuals use
the other checked-in images through `app/marketing/real-feature-visuals.css`.

These source assets are not proof of what a separately deployed production
service currently serves. Verify its exact release and browser rendering after
an approved rollout. Do not replace images with private account balances,
user information or credentials.
