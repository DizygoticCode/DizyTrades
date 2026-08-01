import type { Lesson } from "./lessons";

type DiagramAsset = { src: string; alt: string };
type DiagramType = NonNullable<Lesson["diagram"]>;

const lessonDiagrams: Record<string, DiagramAsset> = {
  markets: { src: "/school/diagrams/long-short.svg", alt: "Long and short positions showing how profit direction changes when price rises or falls" },
  "order-types": { src: "/school/diagrams/order-types.svg", alt: "Market, limit and stop orders compared by execution speed, price control and trigger behaviour" },
  "vwap-moving-averages": { src: "/school/diagrams/vwap-moving-averages.svg", alt: "Candles with VWAP, fast and slow moving averages and a confirmed close reclaiming rising VWAP" },
  fibonacci: { src: "/school/diagrams/fibonacci.svg", alt: "Fibonacci retracement levels between a measured swing low and swing high with a hypothetical reaction zone" },
  "volume-profile": { src: "/school/diagrams/volume-profile.svg", alt: "Volume Profile rows by price with the point of control and high and low volume areas" },
  dizysignals: { src: "/school/diagrams/dizysignals-confluence.svg", alt: "Trend, structure, pattern and participation evidence combining after candle close before a hypothetical next-bar signal" },
  dizybrain: { src: "/school/diagrams/dizybrain-typed-flow.svg", alt: "Confirmed candle flowing through strategy analysis into a typed DizyBrain snapshot and deterministic setup qualification explanation" },
  "scalping-vs-swing": { src: "/school/diagrams/timeframes.svg", alt: "Fifteen-minute scalping compared with one-hour and four-hour swing analysis" },
  dizypaper: { src: "/school/diagrams/paper-simulation.svg", alt: "Manual paper planning compared with confirmed-signal simulation and next-bar entry modelling" },
  "order-flow-foundations": { src: "/school/diagrams/order-flow-foundations.svg", alt: "Resting bids and asks, aggressive orders, spread and the reasons trading moves to another price level" },
  "dom-queue-microstructure": { src: "/school/diagrams/dom-queue-priority.svg", alt: "DOM price levels showing queue priority and an aggressive order crossing the spread" },
  "heatmap-liquidity": { src: "/school/diagrams/liquidity-heatmap.svg", alt: "Liquidity heatmap with persistent and pulled walls, executed trade bubbles and a sweep and reclaim" },
  "delta-footprints": { src: "/school/diagrams/footprint-delta.svg", alt: "Bid by ask footprint cells, bar delta, imbalances and effort versus result" },
  "absorption-exhaustion": { src: "/school/diagrams/absorption-exhaustion.svg", alt: "Aggressive volume producing limited price progress, fading participation and a failed breakout trapping traders" },
  "auction-market-theory": { src: "/school/diagrams/auction-market-theory.svg", alt: "Balanced value acceptance contrasted with imbalanced price discovery and low-volume travel" },
  "market-structure-liquidity": { src: "/school/diagrams/market-structure-bos-choch.svg", alt: "Higher highs and lows, lower highs and lows, break of structure, change of character and liquidity pools" },
  "institutional-execution": { src: "/school/diagrams/institutional-execution.svg", alt: "VWAP, TWAP and percentage-of-volume institutional execution schedules" },
  "correlation-regimes": { src: "/school/diagrams/correlation-regimes.svg", alt: "Correlation matrix and price relationships changing after a market regime shift" },
  "expectancy-variance": { src: "/school/diagrams/expectancy-drawdown.svg", alt: "Uneven equity path showing expectancy, variance and a marked drawdown" },
  "professional-journaling": { src: "/school/diagrams/professional-journal.svg", alt: "Professional plan, execution, measurement and review journal loop" },
  "psychology-process": { src: "/school/diagrams/psychology-process.svg", alt: "Process controls placed between emotional triggers and trading decisions" },
  "dizy-methodology": { src: "/school/diagrams/dizy-methodology.svg", alt: "How Dizy combines independent closed-candle evidence and accepts no signal as a valid outcome" },
};

const typeDiagrams: Partial<Record<DiagramType, DiagramAsset>> = {
  candles: { src: "/school/diagrams/candlesticks.svg", alt: "Bullish and bearish candlestick anatomy with open, close, high, low, body and wick labels" },
  risk: { src: "/school/diagrams/risk-reward.svg", alt: "Risk and reward diagram showing entry, stop loss, take profit and a one-to-two risk reward ratio" },
  levels: { src: "/school/diagrams/support-resistance.svg", alt: "Price reacting between support and resistance zones" },
  flow: { src: "/school/diagrams/dom.svg", alt: "Depth of market order book with asks, bids, spread, prices, size and depth" },
  trend: { src: "/school/diagrams/channels.svg", alt: "Manual rising channel beside a regression channel with pivot touches, centre line, dispersion bands and breakout retest" },
  pattern: { src: "/school/diagrams/triangles.svg", alt: "Triangle compression with contracting swings, a confirmed breakout close and a retest" },
  cycle: { src: "/school/diagrams/wyckoff-cycle.svg", alt: "Wyckoff accumulation and distribution schematics with phases and key trading-range events" },
  waves: { src: "/school/diagrams/elliott-waves.svg", alt: "Candidate Elliott five-wave impulse followed by an ABC correction" },
};

export default function ConceptDiagram({ type, lessonSlug }: { type?: Lesson["diagram"]; lessonSlug: string }) {
  const asset = lessonDiagrams[lessonSlug] ?? (type ? typeDiagrams[type] : undefined);
  if (!asset) return null;

  return (
    <figure className="concept-diagram">
      <img src={asset.src} alt={asset.alt} style={{ display: "block", width: "100%", height: "auto" }} />
      <figcaption>Concept illustration · simplified, not market performance</figcaption>
    </figure>
  );
}
