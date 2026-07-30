import type { Metadata } from "next";
import MarketingPage from "./marketing/marketing-page";

export const metadata: Metadata = {
  title: "Everything Dizy™ | DizyTrades",
  description: "Chart, analyse, follow, learn and test crypto markets in one simulation-first workspace.",
  openGraph: {
    title: "Everything Dizy™ | DizyTrades",
    description: "One crypto workspace for centralised markets, on-chain discovery, confirmed-candle signals, order flow, education and paper trading.",
    type: "website",
  },
};

export default function Home() {
  return <MarketingPage />;
}
