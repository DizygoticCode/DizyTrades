import type { Lesson } from "./lessons";

const assetDiagrams: Partial<Record<NonNullable<Lesson["diagram"]>, { src: string; alt: string }>> = {
  candles: { src: "/school/diagrams/candlesticks.svg", alt: "Bullish and bearish candlestick anatomy with open, close, high, low, body and wick labels" },
  risk: { src: "/school/diagrams/risk-reward.svg", alt: "Risk and reward diagram showing entry, stop loss, take profit and a one-to-two risk reward ratio" },
  levels: { src: "/school/diagrams/support-resistance.svg", alt: "Price reacting between support and resistance zones" },
  flow: { src: "/school/diagrams/dom.svg", alt: "Depth of market order book with asks, bids, spread, prices, size and depth" },
};

export default function ConceptDiagram({ type }: { type: NonNullable<Lesson["diagram"]> }) {
  const asset = assetDiagrams[type];
  if (asset) {
    return <figure className="concept-diagram"><img src={asset.src} alt={asset.alt} style={{ display: "block", width: "100%", height: "auto" }}/><figcaption>Concept illustration · simplified, not market performance</figcaption></figure>;
  }

  const common = <path className="grid" d="M20 24H580M20 72H580M20 120H580M20 168H580M100 14V190M200 14V190M300 14V190M400 14V190M500 14V190" />;
  const drawings = {
    trend: <><path className="channel" d="M35 142L560 45M35 178L560 81"/><path className="price" d="M38 146l45-26 45 13 54-39 51 13 51-34 53 15 57-40 55 18 57-40"/><text x="375" y="105">rising channel</text></>,
    pattern: <><path className="channel" d="M45 43L350 103 45 166 350 103"/><path className="price" d="M45 60l55 92 50-85 50 66 50-51 48 36 52-15 55-49 74-20"/><path className="arrow" d="M405 54l74-20"/><text x="395" y="88">close + retest?</text></>,
    cycle: <><path className="price" d="M35 143q65-34 125 0q44 28 105-60q55-70 115 3q44 55 90-22q44-62 95 58"/><text x="45" y="177">accumulation</text><text x="195" y="40">markup</text><text x="340" y="124">distribution</text><text x="475" y="174">markdown</text></>,
    waves: <><path className="price" d="M40 164L125 116 92 140 220 65 168 103 340 30 283 78 405 125 365 97 535 157"/><text x="120" y="105">1</text><text x="86" y="160">2</text><text x="218" y="55">3</text><text x="164" y="123">4</text><text x="338" y="22">5</text><text x="407" y="143">A</text><text x="358" y="89">B</text><text x="537" y="174">C</text></>,
  } as const;

  const drawing = drawings[type as keyof typeof drawings];
  return <figure className="concept-diagram"><svg role="img" aria-labelledby={`diagram-${type}`} viewBox="0 0 600 200"><title id={`diagram-${type}`}>Educational {type} concept illustration, not a performance chart</title>{common}{drawing}</svg><figcaption>Concept illustration · simplified, not market performance</figcaption></figure>;
}
