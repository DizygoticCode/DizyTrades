export type LessonGroup = "Beginner" | "Intermediate" | "DizyTrades Tools";

export type Lesson = {
  slug: string;
  title: string;
  group: LessonGroup;
  summary: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
  diagram?: "candles" | "risk" | "levels" | "trend" | "pattern" | "cycle" | "waves" | "flow";
  chartQuery?: string;
};

const indicator = (details: {
  measures: string; appearance: string; labels: string; settings: string;
  confirmation: string; falseSignals: string; confluence: string;
}) => [
  { heading: "Measure and chart display", paragraphs: [details.measures, details.appearance] },
  { heading: "Labels, colours and settings", paragraphs: [details.labels, details.settings] },
  { heading: "Confirmation and limitations", paragraphs: [details.confirmation], bullets: [
    `False-signal watch: ${details.falseSignals}`,
    `DizySignals confluence: ${details.confluence}`,
    "Never use this tool alone. Combine market structure, risk controls, volume and a confirmed candle; agreement is evidence, not certainty.",
  ] },
];

export const lessonGroups: LessonGroup[] = ["Beginner", "Intermediate", "DizyTrades Tools"];

export const lessons: Lesson[] = [
  { slug: "welcome", title: "Welcome to DizyTrades", group: "Beginner", summary: "Learn the safe path from market observation to paper simulation.", sections: [
    { heading: "One workspace, three jobs", paragraphs: ["DizyCharts is the visual workspace, DizySignals evaluates confluence on closed candles, and DizyPaper models hypothetical entries on the following bar. DizyFlow adds order-book context. None of them predicts the future."], bullets: ["Begin with the view-only chart.", "Change one setting at a time.", "Paper-test an idea before judging it."] },
    { heading: "A learning routine", paragraphs: ["Read a lesson, follow its Try this in DizyCharts link, describe what you see before adding an indicator, and record why an idea would be invalidated."] },
  ], chartQuery: "welcome" },
  { slug: "candles-price-volume-timeframes", title: "Candles, price, volume and timeframes", group: "Beginner", summary: "Read OHLC candles, participation and timeframe context.", diagram: "candles", sections: [
    { heading: "The candle", paragraphs: ["A candle records open, high, low and close for one interval. The body spans open to close; wicks show prices visited. In DizyCharts green means close above open and red means close below open."], bullets: ["Volume bars estimate activity during each candle.", "A 15m candle contains less context than a 1H or 4H candle.", "DizySignals waits for the candle to close; a forming candle can reverse."] },
    { heading: "Top-down reading", paragraphs: ["Use a higher timeframe to identify structure, then a lower timeframe for detail. High volume only means greater participation—not automatically buying, selling or confirmation."] },
  ], chartQuery: "candles" },
  { slug: "markets", title: "Spot, futures, leverage and DEX markets", group: "Beginner", summary: "Understand ownership, contracts, liquidation and on-chain risk.", sections: [
    { heading: "Different instruments", paragraphs: ["Spot exchanges an asset directly. Futures track an underlying price through a contract and may permit long or short exposure. A DEX swaps tokens through on-chain liquidity pools."], bullets: ["Leverage magnifies gains, losses, fees and liquidation risk.", "Futures prices can diverge from spot through basis and funding.", "DEX tokens add smart-contract, liquidity, slippage and custody risks."] },
    { heading: "DizyTrades boundary", paragraphs: ["The terminal is a test and simulation environment. Live execution is locked; educational examples are not invitations to trade."] },
  ] },
  { slug: "order-types", title: "Market, limit and stop orders", group: "Beginner", summary: "Compare execution certainty, price control and trigger behaviour.", sections: [
    { heading: "Order mechanics", paragraphs: ["A market order prioritises immediate execution but can slip. A limit order sets a price boundary but may never fill. A stop becomes active after its trigger and can fill away from that trigger in a fast market."], bullets: ["Stop-market prioritises exit; stop-limit can remain unfilled.", "Spread, depth and fees affect every fill.", "A stop loss controls an exit instruction, not the maximum possible loss."] },
    { heading: "Simulation assumptions", paragraphs: ["DizyPaper results are models. Check how fills, fees and following-bar entries are represented before comparing approaches."] },
  ] },
  { slug: "risk-position-sizing", title: "Risk percentage, position sizing, stop loss and take profit", group: "Beginner", summary: "Translate invalidation distance into controlled hypothetical size.", diagram: "risk", sections: [
    { heading: "Risk first", paragraphs: ["Choose the price that invalidates the idea before choosing size. A simplified size is risk amount divided by entry-to-stop distance; contract rules, fees, slippage and leverage still matter."], bullets: ["Risk amount = account equity × chosen risk percentage.", "Wider stops require smaller size for equal risk.", "Take profit is a plan, not a promised fill."] },
    { heading: "Example", paragraphs: ["On a hypothetical 10,000 account, 0.5% risk is 50. If entry-to-stop risk is 2 per unit, the simplified size is 25 units before fees and slippage. Never increase size merely to recover a loss."] },
  ], chartQuery: "risk" },
  { slug: "support-resistance", title: "Support and resistance", group: "Intermediate", summary: "Treat repeatedly tested price areas as zones, not guarantees.", diagram: "levels", sections: indicator({ measures: "Support and resistance describe areas where prior reactions suggest an imbalance between supply and demand.", appearance: "DizyCharts draws horizontal level zones around detected pivots and optional touch markers rather than claiming an exact reversal price.", labels: "Support uses the bullish/green family, resistance the bearish/red family; labels identify level type and touches. Extended or faded portions show projection beyond observed pivots.", settings: "Adjust support/resistance visibility, touch display, line extension, label placement, padding and compact labels in View settings.", confirmation: "A closed rejection candle, renewed volume and structure holding on a higher timeframe can strengthen a level reaction.", falseSignals: "levels are often swept, news can gap through them, and repeated tests may consume liquidity.", confluence: "proximity and reaction can add context to a confirmed-candle score, alongside independent trend, volume and pattern evidence." }), chartQuery: "support-resistance" },
  { slug: "vwap-moving-averages", title: "VWAP and trend moving averages", group: "Intermediate", summary: "Compare volume-weighted fair value with smoothed trend direction.", diagram: "trend", sections: indicator({ measures: "VWAP estimates the volume-weighted average traded price; moving averages smooth price across a chosen lookback.", appearance: "DizyCharts overlays VWAP and trend-average lines directly on candles so slope, crossings and distance from price remain visible.", labels: "VWAP uses the chart accent, while faster and slower trend lines use distinct cool/warm colours; labels identify the series rather than a trade command.", settings: "Toggle VWAP and choose the indicator package and trend parameters; timeframe changes recalculate every line from that interval's data.", confirmation: "A candle closing back above rising VWAP while trend averages align and volume expands is stronger than an intrabar touch.", falseSignals: "flat, choppy markets create repeated crossings; price can remain stretched for longer than expected.", confluence: "slope, ordering and closed-candle location contribute trend context, but do not override structure or risk rules." }), chartQuery: "vwap" },
  { slug: "fibonacci", title: "Fibonacci retracements and extensions", group: "Intermediate", summary: "Map proportional pullback and projection zones between meaningful swings.", diagram: "levels", sections: indicator({ measures: "Fibonacci tools divide a selected swing into common ratios to frame possible retracement and extension areas.", appearance: "DizyCharts renders labelled horizontal ratios between detected or manually selected anchors, with optional projected extensions.", labels: "Ratio labels such as 0.382, 0.5 and 0.618 use the Fibonacci accent; they are reference zones, not probability scores.", settings: "Control Fibonacci visibility, label placement, global or manual extension and appearance; anchor choice changes every level.", confirmation: "Look for a closed reaction at a ratio that also aligns with structure, trend and participation.", falseSignals: "arbitrary anchors create arbitrary levels, and price frequently passes straight through popular ratios.", confluence: "level overlap can add modest location evidence when independent confirmed-candle factors agree." }), chartQuery: "fibonacci" },
  { slug: "trendlines-channels", title: "Trendlines, channels and linear-regression channels", group: "Intermediate", summary: "Visualise slope, boundaries and dispersion without forcing the fit.", diagram: "trend", sections: indicator({ measures: "Trendlines connect pivots, parallel channels frame a path, and regression channels estimate a best-fit trend with dispersion bands.", appearance: "DizyCharts draws pivot trendlines, manual channels and regression centre/boundary lines over price; projected portions may fade.", labels: "Bullish slopes use green, bearish slopes red, and neutral regression guides use cool accents. Labels describe geometry, not direction certainty.", settings: "Tune trendline visibility, width/style, pivot or manual extension, channel extension and global line-extension overrides.", confirmation: "Multiple respected touches plus a closed breakout and successful retest can confirm better than the first boundary poke.", falseSignals: "two points always make a line, late fits chase price, and outliers distort regression bands.", confluence: "slope and closed-candle boundary interaction provide trend/structure evidence alongside volume and levels." }), chartQuery: "channels" },
  { slug: "triangles-breakouts", title: "Triangle and breakout patterns", group: "Intermediate", summary: "Recognise compression while demanding closed-candle breakout evidence.", diagram: "pattern", sections: indicator({ measures: "Triangles measure contracting price swings; a breakout is movement beyond a defined boundary, not proof of continuation.", appearance: "DizyCharts connects converging pivots, shades completed pattern areas and places pattern labels away from candles.", labels: "Boundary colours follow bullish/bearish context; a completion label marks detected geometry, while signal bubbles are separate confirmed-candle events.", settings: "Toggle triangles, completed fills, connectors, bubble size, label placement, distance and compact labels.", confirmation: "A close beyond the boundary, relative volume expansion and a held retest provide stronger confirmation.", falseSignals: "wick breaks, low-liquidity spikes and breakouts directly into higher-timeframe resistance often fail.", confluence: "completed geometry and a confirmed close can contribute pattern evidence, weighted with trend, volume and levels." }), chartQuery: "triangles" },
  { slug: "volume-profile", title: "Volume Profile", group: "Intermediate", summary: "See where estimated activity occurred by price rather than time.", diagram: "levels", sections: indicator({ measures: "Volume Profile aggregates candle volume across price rows to estimate where activity concentrated.", appearance: "DizyCharts places horizontal profile rows at the chart edge, with the longest row marking the highest-volume area in the visible calculation.", labels: "Row colour separates up/down allocation; the profile heading and highlighted point of control describe concentration, not buyer identity.", settings: "Change visibility, row count, opacity, width percentage, maximum width, inset and heading display.", confirmation: "Acceptance around a high-volume node or a closed rejection from a low-volume area can support a structure thesis.", falseSignals: "candle-based allocation is approximate, visible-range changes alter the profile, and old volume may lose relevance.", confluence: "location relative to nodes adds participation context but cannot reveal hidden intent or guarantee support." }), chartQuery: "volume-profile" },
  { slug: "wyckoff", title: "Wyckoff accumulation, markup, distribution and markdown", group: "Intermediate", summary: "Use a cycle narrative cautiously, anchored to observable structure.", diagram: "cycle", sections: indicator({ measures: "Wyckoff phases organise range behaviour and trend transitions into accumulation, markup, distribution and markdown hypotheses.", appearance: "DizyCharts can annotate provisional stages and structure events over candles; stage labels may update as later closed candles arrive.", labels: "Accumulation/markup use constructive green/blue accents, distribution/markdown cautionary yellow/red; provisional means unconfirmed.", settings: "Toggle stage/wave visibility, provisional stages, label sizing and placement to reduce overlap.", confirmation: "Range tests, effort-versus-result volume and a confirmed break with follow-through can support—not prove—a phase interpretation.", falseSignals: "analysts can retrofit any range, phases can persist, and crypto gaps or news invalidate tidy schematics.", confluence: "stage context can influence regime scoring only when confirmed candles and independent structure evidence agree." }), chartQuery: "wyckoff" },
  { slug: "elliott-waves", title: "Elliott impulse and corrective waves", group: "Intermediate", summary: "Label a scenario without mistaking subjective counts for facts.", diagram: "waves", sections: indicator({ measures: "Elliott Wave describes a five-wave impulse and three-wave correction as a possible crowd-behaviour structure.", appearance: "DizyCharts connects detected pivots and adds numbered impulse or lettered corrective labels near swing points.", labels: "Numbers 1–5 denote a candidate impulse; A–C denotes a candidate correction. Accent changes distinguish direction, and provisional labels may repaint as pivots develop.", settings: "Toggle waves and provisional stages, then tune label size, offset, padding and connector visibility.", confirmation: "Valid swing relationships, higher-timeframe trend agreement and confirmed breaks can strengthen one count.", falseSignals: "several valid counts can coexist, pivot detection lags, and forcing a count creates hindsight bias.", confluence: "wave position supplies low-weight structure context; DizySignals still requires independent closed-candle factors." }), chartQuery: "waves" },
  { slug: "dizysignals", title: "DizySignals confluence and confirmed-candle signals", group: "DizyTrades Tools", summary: "Understand evidence scoring, closed candles and next-bar modelling.", diagram: "pattern", sections: [
    { heading: "Confluence, not prediction", paragraphs: ["DizySignals combines independent trend, structure, pattern and participation evidence. A signal appears only after its source candle is closed; simulated entry belongs to the following bar to avoid look-ahead."], bullets: ["Labels communicate direction and evidence detail, not certainty.", "Historical settings changes can change what qualifies.", "Correlated indicators should not be counted as independent proof."] },
    { heading: "Settings and failure modes", paragraphs: ["Signal visibility, detail, placement, distance, size and historical markers are display controls. A high score can still fail during regime changes, thin liquidity or abrupt news. Always define invalidation and size separately."] },
  ], chartQuery: "signals" },
  { slug: "scalping-vs-swing", title: "Scalping 15m versus Swing 1H/4H modes", group: "DizyTrades Tools", summary: "Match timeframe, noise, holding period and assumptions.", sections: [
    { heading: "Different cadence", paragraphs: ["A 15m mode generates more observations and more noise, spread and fee sensitivity. 1H/4H modes react more slowly, usually imply wider invalidation distances and expose positions to longer event risk."], bullets: ["Do not compare raw trade counts across modes.", "Size from stop distance, not timeframe preference.", "Confirm the higher-timeframe context before lower-timeframe detail."] },
  ], chartQuery: "timeframes" },
  { slug: "dizyflow", title: "DizyFlow DOM, volume bubbles, liquidity and whale alerts", group: "DizyTrades Tools", summary: "Read order-book and trade-flow context without assuming intent.", diagram: "flow", sections: [
    { heading: "What the views measure", paragraphs: ["The DOM displays currently advertised bids and asks. Volume bubbles summarise executed trades. Liquidity heatmaps retain observed resting depth, while whale alerts flag unusually large events under configured thresholds."], bullets: ["Green/bid and red/ask families indicate side, not future direction.", "Bright or large marks mean greater observed size within the view's scale.", "Orders can be cancelled, spoofed or filled elsewhere."] },
    { heading: "Use as context", paragraphs: ["Look for repeated absorption or liquidity response alongside a confirmed chart level. DizyFlow is transient microstructure evidence and does not independently create a DizySignals trade instruction."] },
  ], chartQuery: "dizyflow" },
  { slug: "dizypaper", title: "DizyPaper manual and signal simulation", group: "DizyTrades Tools", summary: "Practise manual plans and systematic signal assumptions safely.", sections: [
    { heading: "Two paper workflows", paragraphs: ["Manual paper tickets record a hypothetical entry, stop, target and validated size. Signal simulation evaluates the configured confirmed-candle rules and models entry on the next bar."], bullets: ["Paper fills are not exchange fills.", "Keep account and strategy settings isolated to your user.", "Record rejected ideas as well as selected ones."] },
    { heading: "Review", paragraphs: ["Compare the plan with the outcome, including fees, slippage assumptions and maximum adverse movement. Never treat paper profitability as permission for live execution."] },
  ], chartQuery: "paper" },
  { slug: "dizydex", title: "DizyDEX and high-risk on-chain tokens", group: "DizyTrades Tools", summary: "Identify contract, custody and liquidity hazards unique to on-chain markets.", sections: [
    { heading: "Extra layers of risk", paragraphs: ["On-chain token prices depend on pools, routes and contract behaviour. A visible chart cannot establish that a token is sellable, ownership is renounced, liquidity is locked or code is safe."], bullets: ["Verify contract address and network independently.", "Assume extreme slippage and total-loss risk in thin pools.", "Beware honeypots, taxes, upgradeable contracts, bridges and concentrated holders."] },
    { heading: "No safety signal", paragraphs: ["DizyDEX observations and DizySignals confluence are technical context only; neither audits a contract nor removes custody risk."] },
  ] },
  { slug: "simulation-results", title: "Reading simulation results without overfitting", group: "DizyTrades Tools", summary: "Evaluate sample size, drawdown and robustness—not just headline return.", sections: [
    { heading: "Read the distribution", paragraphs: ["Review trade count, win rate, average win/loss, expectancy, drawdown and exposure together. Segment by market regime and preserve unseen out-of-sample data."], bullets: ["Include realistic fees, funding and slippage.", "A few outliers can dominate total return.", "Parameter stability matters more than the single best setting."] },
    { heading: "Avoid curve fitting", paragraphs: ["If repeated tuning uses the same history, that history becomes training data. Prefer simple hypotheses, walk-forward checks and a written rule for when the approach is considered broken."] },
  ], chartQuery: "simulation" },
  { slug: "trading-safety", title: "Trading safety and common mistakes", group: "Beginner", summary: "Protect capital, credentials and decision quality.", sections: [
    { heading: "Safety checklist", paragraphs: ["This learning centre is educational and is not financial advice. Trading and on-chain markets can cause total loss; simulation cannot reproduce every real-world risk."], bullets: ["Never share seed phrases, API secrets or passwords.", "Avoid leverage while learning and never chase losses.", "Check symbol, side, size and invalidation twice.", "Pause after rule-breaking, fatigue or emotional decisions.", "Treat urgency, guaranteed returns and unsolicited links as warning signs."] },
  ] },
];

export const glossary = [
  ["Ask", "The lowest currently advertised selling price in an order book."],
  ["Bid", "The highest currently advertised buying price in an order book."],
  ["Closed candle", "A completed timeframe interval whose OHLC values no longer update."],
  ["Confluence", "Agreement among distinct pieces of evidence; it does not guarantee an outcome."],
  ["DEX", "A decentralised exchange that routes swaps through on-chain contracts or pools."],
  ["Drawdown", "A decline from an equity peak to a later trough."],
  ["Expectancy", "Average modelled profit or loss per trade across a sample."],
  ["Funding", "Periodic payment mechanism used by many perpetual futures markets."],
  ["Leverage", "Borrowed or contractual exposure that magnifies both gains and losses."],
  ["Liquidity", "The capacity to trade size with limited price impact; also resting depth in context."],
  ["Look-ahead bias", "Using information that was not available at the simulated decision time."],
  ["OHLC", "Open, high, low and close prices for one candle interval."],
  ["Point of control", "The price row with the greatest estimated Volume Profile activity."],
  ["Slippage", "The difference between an expected execution price and the achieved price."],
  ["Stop loss", "An exit instruction triggered near invalidation; it cannot guarantee the trigger price."],
  ["VWAP", "Volume-weighted average price for the configured period or session."],
] as const;

export const progressKey = "dizyschool-progress-v1";

export type ProgressStorage = Pick<Storage, "getItem" | "setItem">;
export function readProgress(storage: Pick<ProgressStorage, "getItem">) {
  try {
    const value: unknown = JSON.parse(storage.getItem(progressKey) ?? "[]");
    return Array.isArray(value) ? value.filter((slug): slug is string => typeof slug === "string" && lessons.some((lesson) => lesson.slug === slug)) : [];
  } catch { return []; }
}
export function writeProgress(storage: Pick<ProgressStorage, "setItem">, completed: string[]) {
  storage.setItem(progressKey, JSON.stringify([...new Set(completed.filter((slug) => lessons.some((lesson) => lesson.slug === slug)))]));
}

export function filterLessons(query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return lessons;
  return lessons.filter((lesson) => [lesson.title, lesson.summary, lesson.group, ...lesson.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])])].join(" ").toLocaleLowerCase().includes(term));
}
