import type { Lesson } from "./lessons";

const assetDiagrams: Partial<Record<NonNullable<Lesson["diagram"]>, { src: string; alt: string }>> = {
  candles: { src: "/school/diagrams/candlesticks.svg", alt: "Bullish and bearish candlestick anatomy with open, close, high, low, body and wick labels" },
  risk: { src: "/school/diagrams/risk-reward.svg", alt: "Risk and reward diagram showing entry, stop loss, take profit and a one-to-two risk reward ratio" },
  levels: { src: "/school/diagrams/support-resistance.svg", alt: "Price reacting between support and resistance zones" },
  flow: { src: "/school/diagrams/dom.svg", alt: "Depth of market order book with asks, bids, spread, prices, size and depth" },
  trend: { src: "/school/diagrams/channels.svg", alt: "Rising price channel with upper and lower boundaries, a centre line and repeated price touches" },
  pattern: { src: "/school/diagrams/triangles.svg", alt: "Triangle compression with contracting swings, a confirmed breakout close and a retest" },
  cycle: { src: "/school/diagrams/wyckoff-cycle.svg", alt: "Wyckoff cycle showing accumulation, markup, distribution and markdown as a cautious market hypothesis" },
  waves: { src: "/school/diagrams/elliott-waves.svg", alt: "Candidate Elliott five-wave impulse followed by an ABC correction" },
};

export default function ConceptDiagram({ type }: { type: NonNullable<Lesson["diagram"]> }) {
  const asset = assetDiagrams[type];
  if (!asset) return null;

  return (
    <figure className="concept-diagram">
      <img src={asset.src} alt={asset.alt} style={{ display: "block", width: "100%", height: "auto" }} />
      <figcaption>Concept illustration · simplified, not market performance</figcaption>
    </figure>
  );
}
