import { glossary as baseGlossary, lessonGroups as baseGroups, lessons as baseLessons, type Lesson } from "./lessons";

export type AcademyGroup = Lesson["group"] | "Advanced Order Flow" | "Professional Practice";
export type AcademyLesson = Omit<Lesson, "group"> & { group: AcademyGroup };

type Section = AcademyLesson["sections"][number];

const enhancements: Record<string, Section[]> = {
  welcome: [
    { heading: "How to use the academy", paragraphs: ["Work from observation to explanation to simulation. First describe price and participation without indicators. Then add one tool and state what new evidence it contributes. Finally write the invalidation before testing the idea in DizyPaper."], bullets: ["Do not skip directly to signals.", "Keep correlated evidence separate from genuinely independent evidence.", "Mark lessons complete only when you can explain the concept without the diagram."] },
  ],
  "candles-price-volume-timeframes": [
    { heading: "What candles cannot tell you", paragraphs: ["A candle compresses every trade during an interval into four prices. It does not reveal the full sequence of bids, asks, cancellations, queue changes or aggressive executions that created the shape."], bullets: ["A wick is not automatically rejection.", "A large body is not automatically institutional buying or selling.", "The same candle can form from very different order-flow conditions."] },
    { heading: "Dizy tip", paragraphs: ["Use candles as a compact record of outcome. Use DizyFlow, volume and structure to investigate how that outcome may have developed."] },
  ],
  markets: [
    { heading: "Fair price, last price and liquidation", paragraphs: ["Perpetual futures venues may use a fair or mark price for unrealised profit, margin and liquidation logic while the chart also shows the last traded price. A brief last-price spike may therefore differ from the price used by the venue's risk engine."], bullets: ["Always know which price triggers stops and liquidation.", "Funding and basis can make a perpetual contract diverge from spot.", "Leverage changes required margin, not the validity of the trade idea."] },
  ],
  "order-types": [
    { heading: "Passive versus aggressive execution", paragraphs: ["A resting limit order supplies liquidity and waits in the queue. A marketable order removes available liquidity immediately. Order-flow tools attempt to separate advertised liquidity from executed aggression, but neither reveals a participant's full strategy."], bullets: ["Queue position affects whether a limit order fills.", "Large market orders can sweep several price levels.", "Cancelled liquidity never became a trade."] },
  ],
  "risk-position-sizing": [
    { heading: "Common mistakes", paragraphs: ["The most dangerous sizing error is choosing leverage first and invalidation second. Position size should come from the amount you can lose and the distance to the point that proves the idea wrong."], bullets: ["Do not move a stop merely to avoid taking a planned loss.", "Include fees, funding and realistic slippage.", "Reduce size when volatility expands rather than forcing the same notional exposure."] },
  ],
  "vwap-moving-averages": [
    { heading: "Practical interpretation", paragraphs: ["VWAP is most useful as a dynamic reference for value and execution, not as a magical crossover line. A reclaim above rising VWAP can matter when price also regains structure and aggressive selling fails to continue."], bullets: ["Repeated crosses in a flat session usually indicate balance, not opportunity.", "Distance from VWAP can show extension but cannot time mean reversion.", "Several moving averages derived from the same prices are correlated evidence."] },
  ],
  "volume-profile": [
    { heading: "Auction interpretation", paragraphs: ["High-volume areas often show acceptance: the market spent time and activity there. Low-volume areas often show rejection or rapid travel. These are auction observations, not guaranteed support and resistance."], bullets: ["The point of control can migrate as new data arrives.", "Visible-range profiles change when the chart window changes.", "Profile volume estimates do not identify hidden buyer or seller intent."] },
  ],
  dizysignals: [
    { heading: "Why DizySignals said NO", paragraphs: ["A rejected setup is part of the system, not a missing feature. DizySignals may withhold a signal because the candle has not closed, independent evidence is below threshold, risk is poor, the move is extended, or the available confirmations are merely duplicates of the same underlying information."], bullets: ["Trend passed, but structure failed.", "Structure passed, but participation was weak.", "The pattern completed directly into resistance.", "The hypothetical reward did not justify the invalidation distance.", "A signal is permission to investigate—not certainty and not an instruction."] },
    { heading: "Why a historical result can change", paragraphs: ["Changing settings changes the question being tested. A different timeframe, threshold, indicator package or visible data history can therefore produce a different set of qualifying signals without implying that closed historical candles themselves changed."] },
  ],
  dizyflow: [
    { heading: "The DizyFlow system", paragraphs: ["DizyFlow combines several views of market microstructure. The DOM shows currently advertised depth. Trade bubbles summarise executed aggression. The heatmap preserves the history of resting liquidity through time. Whale alerts identify unusually large events relative to configured thresholds. Each view answers a different question and none should be read alone."], bullets: ["DOM: where liquidity is advertised now.", "Heatmap: where meaningful liquidity persisted, moved or disappeared.", "Trade bubbles: where transactions actually occurred.", "Whale alerts: unusual size, not guaranteed informed activity."] },
    { heading: "How the liquidity heatmap works", paragraphs: ["When enabled, the heatmap records order-book depth snapshots and projects intensity by price and time. Brighter bands represent greater observed resting size within the current scaling. A band that remains in place can act as a reference for potential attraction, defence or absorption; a band that vanishes may have been cancelled, moved or consumed."], bullets: ["Brightness is relative to the selected symbol, window and scale.", "A visible wall can be cancelled before price reaches it.", "Price may trade through a wall if aggressive flow overwhelms it.", "Historical heatmap data requires continuous collection; it cannot be reconstructed perfectly from candles."] },
    { heading: "A practical DizyFlow workflow", paragraphs: ["Start with higher-timeframe structure, then inspect nearby liquidity. Watch whether aggressive trades repeatedly hit a level without moving price, whether liquidity replenishes, and whether the response survives a closed candle. Record both the evidence and the alternative explanation."], bullets: ["Absorption hypothesis: heavy aggression, limited price progress.", "Exhaustion hypothesis: aggression fades before continuation.", "Sweep hypothesis: price trades through a liquidity pool and rapidly reclaims.", "Spoofing is difficult to prove from one screen; describe cancellations rather than claiming intent."] },
  ],
  dizypaper: [
    { heading: "Build a professional review loop", paragraphs: ["A paper trade should contain the same decision record as a live professional process: thesis, evidence, invalidation, size, expected costs, management rules and post-trade review. Record setups that were correctly rejected as well as trades that were taken."], bullets: ["Separate process quality from profit or loss.", "Capture maximum favourable and adverse excursion.", "Tag the market regime and timeframe.", "Review whether the original evidence remained valid after entry."] },
  ],
  "simulation-results": [
    { heading: "Robustness before return", paragraphs: ["A strategy is more credible when similar settings work across neighbouring values, multiple regimes and unseen data. The single highest backtest result is often the least reliable because it may be exploiting noise."], bullets: ["Use walk-forward or out-of-sample checks.", "Inspect the distribution of returns rather than only the total.", "Stress fees, slippage and delayed fills.", "Check whether a small number of trades produced most of the profit."] },
  ],
};

const advancedLessons: AcademyLesson[] = [
  { slug: "order-flow-foundations", title: "Order flow: the market beneath the candles", group: "Advanced Order Flow", summary: "Understand how bids, asks, queues and executed trades create price movement.", diagram: "flow", sections: [
    { heading: "The matching process", paragraphs: ["Markets match willing buyers and sellers through an order book. Resting limit orders advertise liquidity; aggressive marketable orders consume it. Price changes when available liquidity at the current level is exhausted or withdrawn and trading moves to the next level."], bullets: ["Bid is the highest advertised buy price.", "Ask is the lowest advertised sell price.", "Spread is the gap between them.", "Displayed depth is only the visible portion of current interest."] },
    { heading: "Why institutions study flow", paragraphs: ["Large participants care about execution cost, market impact and available liquidity. Their problem is rarely whether a candle is green; it is how to transact size without moving the market excessively or revealing the full order."], bullets: ["Institutional activity is fragmented across venues and algorithms.", "A single large print does not prove a directional view.", "Execution data describes behaviour, not identity or motive."] },
  ], chartQuery: "dizyflow" },
  { slug: "dom-queue-microstructure", title: "DOM, queue position and market impact", group: "Advanced Order Flow", summary: "Read depth without confusing advertised interest with completed trades.", diagram: "flow", sections: [
    { heading: "Queue mechanics", paragraphs: ["At each price, resting orders compete for priority according to venue rules. Joining the bid does not guarantee a fill; orders ahead must trade or cancel first. Moving to the front by crossing the spread gains immediacy but pays spread and may create impact."], bullets: ["Depth can change faster than the screen refreshes.", "Hidden and iceberg quantities may exceed displayed size.", "Different venues can show different books for the same asset."] },
    { heading: "Reading changes", paragraphs: ["Focus on behaviour over time: replenishment, pulling, stacking and the response when price approaches. One snapshot is weak evidence; repeated interaction is more informative."] },
  ], chartQuery: "dizyflow" },
  { slug: "heatmap-liquidity", title: "Liquidity heatmaps: persistence, pulls and sweeps", group: "Advanced Order Flow", summary: "Interpret resting-liquidity history while respecting cancellation and spoofing risk.", diagram: "flow", sections: [
    { heading: "What a heatmap adds", paragraphs: ["A heatmap turns order-book snapshots into a time-and-price history. Persistent bright bands show where larger displayed liquidity remained visible. This helps distinguish a stable reference from a wall that appeared only briefly."], bullets: ["Liquidity can attract price because transactions need counterparties.", "Liquidity can repel price when passive orders absorb aggression.", "Liquidity can disappear before contact.", "Heatmap intensity is relative, not an absolute institutional label."] },
    { heading: "Three outcomes at a wall", paragraphs: ["Price may reject, absorb and eventually break, or sweep through and reclaim. The useful information is the combination of liquidity behaviour, executed flow and resulting price response—not the colour of the band alone."] },
  ], chartQuery: "dizyflow" },
  { slug: "delta-footprints", title: "Delta, cumulative delta and footprint logic", group: "Advanced Order Flow", summary: "Compare aggressive buying and selling with the price response they achieved.", sections: [
    { heading: "Delta", paragraphs: ["Trade delta approximates aggressive buy volume minus aggressive sell volume. Cumulative delta adds that imbalance over time. A footprint distributes executed volume within each price level of a bar."], bullets: ["Positive delta means more aggressive buying, not automatically bullish control.", "Negative delta means more aggressive selling, not automatically bearish control.", "Venue coverage and trade classification affect every calculation."] },
    { heading: "Effort versus result", paragraphs: ["Strong positive delta with little upward progress can suggest sell-side absorption. Strong negative delta with little downward progress can suggest buy-side absorption. These are hypotheses that require context and follow-through."] },
  ] },
  { slug: "absorption-exhaustion", title: "Absorption, exhaustion and trapped traders", group: "Advanced Order Flow", summary: "Recognise when aggressive effort fails to produce the expected result.", sections: [
    { heading: "Absorption", paragraphs: ["Absorption occurs when repeated aggressive orders transact against passive liquidity while price makes limited progress. The passive side may be replenishing, hidden or distributed across nearby levels."], bullets: ["Look for repeated volume at the same area.", "Confirm that price progress remains limited.", "Wait for a structural response rather than assuming reversal immediately."] },
    { heading: "Exhaustion and traps", paragraphs: ["Exhaustion describes declining aggressive participation as a move loses continuation. Traders become trapped when they enter a breakout that quickly fails and must exit through the same limited liquidity, potentially accelerating the move back through the range."] },
  ] },
  { slug: "auction-market-theory", title: "Auction market theory: value, balance and imbalance", group: "Advanced Order Flow", summary: "View price as an auction searching for areas where trade can be accepted.", sections: [
    { heading: "The auction", paragraphs: ["Markets move to discover prices that attract two-sided trade. Balance develops when value is accepted and activity rotates. Imbalance develops when one side becomes urgent and price travels to seek new liquidity."], bullets: ["Acceptance often produces time and volume.", "Rejection often produces rapid travel away.", "A breakout that cannot establish value outside the range may fail."] },
    { heading: "Combine with Volume Profile", paragraphs: ["High-volume nodes can represent accepted value, while low-volume areas can act as transition zones. Use the profile with current order flow because historical acceptance does not guarantee present liquidity."] },
  ] },
  { slug: "market-structure-liquidity", title: "Market structure, BOS, CHOCH and liquidity pools", group: "Advanced Order Flow", summary: "Use structural labels as descriptions, not mystical reversal signals.", sections: [
    { heading: "Structure language", paragraphs: ["A break of structure describes price exceeding a meaningful prior swing in the prevailing direction. A change of character describes an early break against that sequence. Both depend on how swings are selected and should be confirmed by context."], bullets: ["Internal structure is noisier than external structure.", "Equal highs and lows can concentrate stops and breakout orders.", "A liquidity sweep is not automatically a reversal."] },
    { heading: "Premium and discount", paragraphs: ["Within a defined dealing range, traders may describe the upper half as premium and the lower half as discount. This is a location framework, not evidence that price must reverse at the midpoint."] },
  ], chartQuery: "support-resistance" },
  { slug: "institutional-execution", title: "Institutional execution: VWAP, TWAP, POV and order slicing", group: "Advanced Order Flow", summary: "Understand why large orders are executed as schedules rather than single clicks.", sections: [
    { heading: "Execution objectives", paragraphs: ["Large orders create market impact. Execution algorithms divide size across time and liquidity to balance urgency, information leakage and benchmark performance."], bullets: ["VWAP schedules participation around expected volume.", "TWAP spreads execution more evenly through time.", "POV targets a percentage of observed market volume.", "Implementation shortfall compares execution with the decision price."] },
    { heading: "What retail can infer", paragraphs: ["Repeated replenishment or consistent participation may be compatible with algorithmic execution, but public data rarely proves which institution or algorithm is active. Focus on observable behaviour and response."] },
  ], chartQuery: "vwap" },
  { slug: "correlation-regimes", title: "Correlation, macro regimes and cross-market context", group: "Advanced Order Flow", summary: "Separate stable relationships from temporary regime-dependent correlations.", sections: [
    { heading: "Correlation is conditional", paragraphs: ["BTC, equities, rates, the dollar, commodities and other crypto assets can move together during one regime and decouple in another. Correlation measures co-movement over a selected sample; it does not establish causation."], bullets: ["Check timeframe and sample length.", "Watch for correlation breakdowns.", "Avoid counting several correlated markets as independent confirmations."] },
    { heading: "Lead, lag and liquidity", paragraphs: ["Large markets can transmit risk sentiment, but apparent lead-lag relationships may disappear once many traders exploit them. Use cross-market information as context rather than a deterministic trigger."] },
  ] },
  { slug: "expectancy-variance", title: "Expectancy, variance and drawdown", group: "Professional Practice", summary: "Judge a trading process by its distribution of outcomes rather than isolated wins.", sections: [
    { heading: "Expected value", paragraphs: ["A simplified expectancy is win probability multiplied by average win minus loss probability multiplied by average loss. Positive expectancy can still produce long losing runs because outcomes vary around the average."], bullets: ["Win rate without payoff size is incomplete.", "Average return can hide skew and outliers.", "Drawdown depth and duration both matter.", "A strategy can be valid and still lose over a short sample."] },
    { heading: "Sizing and survival", paragraphs: ["Position size controls how a statistical edge translates into account volatility. Kelly-style calculations can be dangerously aggressive when estimates are uncertain; conservative fractional sizing is usually more robust for simulation and research."] },
  ], chartQuery: "simulation" },
  { slug: "journaling-review", title: "Professional journaling and review", group: "Professional Practice", summary: "Create a repeatable evidence trail for taken and rejected setups.", sections: [
    { heading: "Before the trade", paragraphs: ["Record market regime, timeframe, thesis, independent evidence, invalidation, target logic, expected costs and reasons not to trade. A screenshot without a written hypothesis is not a complete journal."], bullets: ["State what would prove the idea wrong.", "Separate observation from interpretation.", "Record whether the setup meets predefined rules."] },
    { heading: "After the trade", paragraphs: ["Review execution, management, maximum favourable and adverse excursion, emotional state and whether the original reasoning remained valid. Grade process separately from profit."], bullets: ["Good process can lose.", "Bad process can win.", "Rejected trades are valuable data."] },
  ], chartQuery: "paper" },
  { slug: "trading-psychology-process", title: "Trading psychology as process design", group: "Professional Practice", summary: "Reduce emotional errors by designing rules before pressure arrives.", sections: [
    { heading: "Beyond motivation", paragraphs: ["Psychology is not solved by promising to be disciplined. Build constraints that reduce decisions under stress: predefined risk, checklists, maximum loss limits, mandatory breaks and written invalidation."], bullets: ["FOMO is often an absence of entry criteria.", "Revenge trading is often an absence of stop rules and cooldowns.", "Overconfidence is often an absence of sample-size awareness."] },
    { heading: "Decision hygiene", paragraphs: ["Fatigue, urgency and recent outcomes distort judgement. Reduce size or stop trading when you cannot follow the same process you would use in a calm state."] },
  ] },
  { slug: "dizy-methodology", title: "The Dizy methodology: evidence, confirmation and rejection", group: "Professional Practice", summary: "Understand the philosophy connecting DizyCharts, DizySignals, DizyFlow and DizyPaper.", sections: [
    { heading: "Four jobs", paragraphs: ["DizyCharts organises market context. DizySignals evaluates configured evidence after candle close. DizyFlow adds transient microstructure observations. DizyPaper tests hypothetical execution and review. No single layer is intended to replace the others."], bullets: ["Context before trigger.", "Independent evidence before confidence.", "Invalidation before size.", "Simulation before claims."] },
    { heading: "Why rejection matters", paragraphs: ["The system should explain both qualification and rejection. A setup can look attractive yet fail because evidence conflicts, liquidity is thin, the move is extended, risk is poor or the candle remains open. Patience is a measurable rule, not empty advice."] },
    { heading: "The whitepaper principle", paragraphs: ["DizyTrades should make its reasoning understandable without pretending to reveal certainty. The goal is a transparent research workstation: show what was measured, what was missing, what assumptions were made and what could invalidate the result."] },
  ], chartQuery: "signals" },
];

const enhancedBase: AcademyLesson[] = baseLessons.map((lesson) => ({
  ...lesson,
  sections: [...lesson.sections, ...(enhancements[lesson.slug] ?? [])],
}));

export const academyLessons: AcademyLesson[] = [...enhancedBase, ...advancedLessons];
export const academyLessonGroups: AcademyGroup[] = [...baseGroups, "Advanced Order Flow", "Professional Practice"];

export const academyGlossary = [
  ...baseGlossary,
  ["Absorption", "Aggressive trading meets enough passive liquidity that price makes limited progress."],
  ["Aggressive order", "An order that executes immediately against resting liquidity."],
  ["Cumulative delta", "A running total of estimated aggressive buy volume minus aggressive sell volume."],
  ["DOM", "Depth of Market: current advertised bids and asks by price."],
  ["Heatmap", "A time-and-price history of observed resting order-book liquidity."],
  ["Iceberg order", "An order that displays only part of its total quantity."],
  ["Implementation shortfall", "The difference between a decision benchmark and the final execution outcome."],
  ["Passive order", "A resting limit order that supplies displayed or hidden liquidity."],
  ["POV", "Percentage-of-volume execution that targets a share of observed market activity."],
  ["Spoofing", "Placing orders with manipulative intent to cancel; intent is difficult to prove from a chart alone."],
  ["TWAP", "Time-weighted average price execution that spreads activity through time."],
] as const;

export const academyProgressKey = "dizyschool-progress-v2";

export function readAcademyProgress(storage: Pick<Storage, "getItem">) {
  try {
    const legacy: unknown = JSON.parse(storage.getItem("dizyschool-progress-v1") ?? "[]");
    const current: unknown = JSON.parse(storage.getItem(academyProgressKey) ?? "[]");
    const values = [...(Array.isArray(legacy) ? legacy : []), ...(Array.isArray(current) ? current : [])];
    return [...new Set(values.filter((slug): slug is string => typeof slug === "string" && academyLessons.some((lesson) => lesson.slug === slug)))];
  } catch { return []; }
}

export function writeAcademyProgress(storage: Pick<Storage, "setItem">, completed: string[]) {
  storage.setItem(academyProgressKey, JSON.stringify([...new Set(completed.filter((slug) => academyLessons.some((lesson) => lesson.slug === slug)))]));
}

export function filterAcademyLessons(query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return academyLessons;
  return academyLessons.filter((lesson) => [lesson.title, lesson.summary, lesson.group, ...lesson.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])])].join(" ").toLocaleLowerCase().includes(term));
}
