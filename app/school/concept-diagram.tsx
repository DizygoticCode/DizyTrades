import type { Lesson } from "./lessons";

type DiagramAsset = { src: string; alt: string };
type DiagramType = NonNullable<Lesson["diagram"]>;

const lessonDiagrams: Record<string, DiagramAsset> = {
  markets: { src: "/school/diagrams/long-short.svg", alt: "Long and short positions showing how profit direction changes when price rises or falls" },
  "order-types": { src: "/school/diagrams/order-types.svg", alt: "Market, limit and stop orders compared by execution speed, price control and trigger behaviour" },
  fibonacci: { src: "/school/diagrams/fibonacci.svg", alt: "Fibonacci retracement levels between a measured swing low and swing high with a hypothetical reaction zone" },
  "volume-profile": { src: "/school/diagrams/volume-profile.svg", alt: "Volume Profile rows by price with the point of control and high and low volume areas" },
  "scalping-vs-swing": { src: "/school/diagrams/timeframes.svg", alt: "Fifteen-minute scalping compared with one-hour and four-hour swing analysis" },
  dizypaper: { src: "/school/diagrams/paper-simulation.svg", alt: "Manual paper planning compared with confirmed-signal simulation and next-bar entry modelling" },
};

const typeDiagrams: Partial<Record<DiagramType, DiagramAsset>> = {
  candles: { src: "/school/diagrams/candlesticks.svg", alt: "Bullish and bearish candlestick anatomy with open, close, high, low, body and wick labels" },
  risk: { src: "/school/diagrams/risk-reward.svg", alt: "Risk and reward diagram showing entry, stop loss, take profit and a one-to-two risk reward ratio" },
  levels: { src: "/school/diagrams/support-resistance.svg", alt: "Price reacting between support and resistance zones" },
  flow: { src: "/school/diagrams/dom.svg", alt: "Depth of market order book with asks, bids, spread, prices, size and depth" },
  trend: { src: "/school/diagrams/channels.svg", alt: "Rising price channel with upper and lower boundaries, a centre line and repeated price touches" },
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
