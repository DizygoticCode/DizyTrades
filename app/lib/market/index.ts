import "server-only";
import { mexcProvider } from "./mexc";
import type { ExchangeId, MarketProvider } from "./types";

const providers: Record<ExchangeId, MarketProvider> = { mexc: mexcProvider };
export const getMarketProvider = (exchange: ExchangeId) => providers[exchange];
export * from "./types";
