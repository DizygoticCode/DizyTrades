"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DexMarket } from "./lib/dex/types";
import type { MarketDescriptor } from "./lib/market/types";
import {
  marketBadge,
  marketSubtitle,
  searchMarkets,
  type MarketTab,
} from "./lib/market/catalogue";

type Source = "mexc" | "dex";
type Props = {
  markets: MarketDescriptor[];
  selectedMarketKey: string;
  favourites: string[];
  onFavourite: (key: string) => void;
  onSelect: (market: MarketDescriptor) => void;
  onClose: () => void;
};
const primaryTabs: MarketTab[] = ["favorites", "all", "spot", "futures"];
type Instrument = "all" | "perpetual" | "delivery" | "pre-market";
const dexPrimary = ["Favorites", "All", "Solana", "BNB"];
const dexVenues = [
  "All venues",
  "Pump.fun",
  "PumpSwap",
  "Raydium",
  "PancakeSwap",
];
const dexDiscovery = [
  "New Pairs",
  "Trending",
  "Graduated",
  "High Volume",
  "High Liquidity",
  "Gainers",
  "Losers",
];
const compactMoney = (value?: number) =>
  value === undefined
    ? "—"
    : Intl.NumberFormat("en", {
        notation: "compact",
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);
const price = (value?: number) =>
  value === undefined
    ? "—"
    : Intl.NumberFormat("en", {
        style: "currency",
        currency: "USD",
        maximumSignificantDigits: 7,
      }).format(value);
const signed = (value?: number) =>
  value === undefined ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const age = (createdAt?: number, now = 0) => {
  if (!createdAt) return "age unknown";
  const minutes = Math.max(1, Math.floor((now - createdAt) / 60000));
  return minutes < 60
    ? `${minutes}m old`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h old`
      : `${Math.floor(minutes / 1440)}d old`;
};
const titleCase = (value: string) =>
  value
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("-");

function Tabs({
  items,
  value,
  onChange,
  label,
  className = "",
}: {
  items: string[];
  value: string;
  onChange: (item: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={className} aria-label={label} role="tablist">
      {items.map((item) => (
        <button
          aria-selected={value.toLowerCase() === item.toLowerCase()}
          className={value.toLowerCase() === item.toLowerCase() ? "active" : ""}
          key={item}
          onClick={() => onChange(item)}
          role="tab"
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function Logo({ url, label }: { url?: string; label: string }) {
  return (
    <span className="browser-logo">
      {url ? <img alt="" src={url} /> : label.slice(0, 2).toUpperCase()}
    </span>
  );
}
function Star({
  label,
  favourite,
  onFavourite,
}: {
  label: string;
  favourite: boolean;
  onFavourite: () => void;
}) {
  return (
    <button
      aria-label={`${favourite ? "Remove" : "Add"} ${label} ${favourite ? "from" : "to"} favorites`}
      className="browser-star"
      onClick={(event) => {
        event.stopPropagation();
        onFavourite();
      }}
      type="button"
    >
      {favourite ? "★" : "☆"}
    </button>
  );
}

function MexcRow({
  market,
  active,
  favourite,
  onFavourite,
  onSelect,
}: {
  market: MarketDescriptor;
  active: boolean;
  favourite: boolean;
  onFavourite: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      aria-selected={active}
      className={`market-browser-result-row ${active ? "selected" : ""}`}
      role="option"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <Star
        favourite={favourite}
        label={market.displayName}
        onFavourite={onFavourite}
      />
      <span className="browser-pair">
        <Logo label={market.baseAsset} />
        <span className="browser-identity">
          <strong>
            {market.displayName}
            <em className="market-badge">{marketBadge(market)}</em>
          </strong>
          <small>{marketSubtitle(market)}</small>
        </span>
      </span>
      <span className="browser-number">
        {market.lastPrice?.toLocaleString(undefined, {
          maximumSignificantDigits: 8,
        }) ?? "—"}
      </span>
      <span
        className={`browser-change ${(market.change24h ?? 0) >= 0 ? "positive" : "negative"}`}
      >
        {signed(market.change24h)}
      </span>
      <span className="browser-volume">{compactMoney(market.volume24h)}</span>
    </div>
  );
}

function DexRow({
  market,
  active,
  favourite,
  onFavourite,
  onSelect,
  now,
}: {
  market: DexMarket;
  active: boolean;
  favourite: boolean;
  onFavourite: () => void;
  onSelect: () => void;
  now: number;
}) {
  const venue = market.dex.replace(/[_-]/g, " ").toUpperCase();
  return (
    <div
      aria-selected={active}
      className={`market-browser-result-row ${active ? "selected" : ""}`}
      role="option"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <Star
        favourite={favourite}
        label={market.symbol}
        onFavourite={onFavourite}
      />
      <span className="browser-pair">
        <Logo label={market.symbol} url={market.logoUrl} />
        <span className="browser-identity">
          <strong>
            {market.symbol} / {market.quoteSymbol}
            <em className="market-badge dex">
              {venue || market.chain.toUpperCase()}
            </em>
          </strong>
          <small>
            {market.name} · {market.chain === "bsc" ? "BNB Chain" : "Solana"} ·{" "}
            {age(market.createdAt, now)}
          </small>
          <code title={market.tokenAddress}>
            {market.tokenAddress.slice(0, 6)}…{market.tokenAddress.slice(-4)}
          </code>
        </span>
      </span>
      <span className="browser-number">{price(market.priceUsd)}</span>
      <span
        className={`browser-change ${(market.changes.h24 ?? 0) >= 0 ? "positive" : "negative"}`}
      >
        {signed(market.changes.h24)}
      </span>
      <span className="browser-volume">
        {compactMoney(market.liquidityUsd)}
      </span>
    </div>
  );
}

export function MarketBrowser({
  markets,
  selectedMarketKey,
  favourites,
  onFavourite,
  onSelect,
  onClose,
}: Props) {
  const [source, setSource] = useState<Source>("mexc"),
    [query, setQuery] = useState(""),
    [marketTab, setMarketTab] = useState<MarketTab>("all"),
    [instrument, setInstrument] =
      useState<Instrument>("all"),
    [quote, setQuote] = useState("All"),
    [newOnly, setNewOnly] = useState(false),
    [hotOnly, setHotOnly] = useState(false),
    [limit, setLimit] = useState(100);
  const [dexTab, setDexTab] = useState("All DEX"),
    [dexVenue, setDexVenue] = useState("All venues"),
    [discovery, setDiscovery] = useState("Trending"),
    [dexItems, setDexItems] = useState<DexMarket[]>([]),
    [dexFavourites, setDexFavourites] = useState<string[]>([]),
    [dexSelected, setDexSelected] = useState(""),
    [cursor, setCursor] = useState("1"),
    [loading, setLoading] = useState(false),
    [degraded, setDegraded] = useState(""),
    [receivedAt, setReceivedAt] = useState(0),
    [cached, setCached] = useState(false),
    [retry, setRetry] = useState(0),
    [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    liquidity: "",
    volume: "",
    age: "",
    unit: "hours",
  });
  const [openedAt] = useState(() => Date.now());
  const dialog = useRef<HTMLDivElement>(null);
  const visible = useMemo(
    () =>
      searchMarkets(
        markets,
        query,
        marketTab,
        quote,
        new Set(favourites),
        openedAt,
      )
        .filter(
          (market) =>
            (instrument === "all" || market.contractType === instrument) &&
            (!newOnly ||
              (market.listedAt &&
                openedAt - market.listedAt <= 30 * 86_400_000)) &&
            (!hotOnly || (market.volume24h ?? 0) > 0),
        )
        .slice(0, limit),
    [
      markets,
      query,
      marketTab,
      quote,
      favourites,
      instrument,
      newOnly,
      hotOnly,
      limit,
      openedAt,
    ],
  );
  const chain = dexTab === "BNB" ? "bsc" : dexTab === "Solana" ? "solana" : "";
  const loadDex = useCallback(
    async (append = false) => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/dex/markets?query=${encodeURIComponent(query)}&chain=${chain}&cursor=${append ? cursor : "1"}`,
        );
        const payload = await response.json();
        if (!response.ok)
          throw Error(payload.degraded || "DEX provider unavailable");
        setDexItems((current) =>
          append ? [...current, ...payload.markets] : payload.markets,
        );
        setReceivedAt(payload.receivedAt || 0);
        setCached(Boolean(payload.cached));
        setDegraded(payload.degraded || "");
      } catch (error) {
        setDegraded(
          error instanceof Error ? error.message : "DEX provider unavailable",
        );
      } finally {
        setLoading(false);
      }
    },
    [query, chain, cursor],
  );
  useEffect(() => {
    if (source !== "dex") return;
    const timer = setTimeout(() => void loadDex(false), 220);
    return () => clearTimeout(timer);
  }, [source, query, chain, retry, loadDex]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  const filteredDex = useMemo(
    () =>
      dexItems.filter((item) => {
        if (dexTab === "Favorites" && !dexFavourites.includes(item.key))
          return false;
        if (
          dexVenue !== "All venues" &&
          !item.dex
            .toLowerCase()
            .includes(dexVenue.replace(".", "").toLowerCase())
        )
          return false;
        const minL = Number(filters.liquidity) || 0,
          minV = Number(filters.volume) || 0,
          maxAge =
            (Number(filters.age) || Infinity) *
            (filters.unit === "days" ? 86400000 : 3600000);
        return (
          (item.liquidityUsd ?? 0) >= minL &&
          (item.volume24h ?? 0) >= minV &&
          (!item.createdAt || openedAt - item.createdAt <= maxAge)
        );
      }),
    [dexItems, dexTab, dexVenue, dexFavourites, filters, openedAt],
  );
  return (
    <>
      <button
        aria-label="Close market browser"
        className="market-backdrop"
        onClick={onClose}
      />
      <div
        aria-label="Market Browser"
        aria-modal="true"
        className="market-browser"
        ref={dialog}
        role="dialog"
      >
        <header className="browser-header">
          <strong>Market Browser</strong>
          <Tabs
            className="market-browser-source-tabs"
            items={["MEXC", "DizyDEX"]}
            label="Market source"
            value={source === "mexc" ? "MEXC" : "DizyDEX"}
            onChange={(item) => {
              setSource(item === "DizyDEX" ? "dex" : "mexc");
              setQuery("");
              setFiltersOpen(false);
            }}
          />
          <span
            className={`provider-badge ${degraded ? "degraded" : cached ? "cached" : ""}`}
          >
            {source === "mexc"
              ? "● Live"
              : degraded
                ? "⚠ Degraded"
                : cached
                  ? "● Cached"
                  : receivedAt
                    ? "● Live"
                    : "● Connecting"}
          </span>
          {source === "dex" ? (
            <button
              aria-label="Refresh DEX markets"
              className="icon-button"
              disabled={loading}
              onClick={() => setRetry((x) => x + 1)}
              type="button"
            >
              ↻
            </button>
          ) : null}
          <button
            aria-label="Close market browser"
            className="icon-button close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="browser-controls">
          <label className="browser-search">
            <span>⌕</span>
            <input
              autoFocus
              aria-label="Search markets"
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor("1");
              }}
              placeholder={
                source === "mexc"
                  ? "Search symbol or asset…"
                  : "Search token, mint, contract or pool…"
              }
              value={query}
            />
          </label>
          <div className="browser-navigation">
            {source === "mexc" ? (
              <>
                <Tabs
                  className="market-browser-primary-tabs"
                  items={primaryTabs.map(titleCase)}
                  label="MEXC market type"
                  value={titleCase(marketTab)}
                  onChange={(x) => {
                    setMarketTab(x.toLowerCase() as MarketTab);
                    setLimit(100);
                  }}
                />
                <label className="compact-select more-select">
                  <span>More</span>
                  <select
                    aria-label="More MEXC filters"
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "new") setNewOnly((x) => !x);
                      else if (value === "hot") setHotOnly((x) => !x);
                      else setInstrument(value as Instrument);
                    }}
                    value={instrument === "all" ? "" : instrument}
                  >
                    <option value="">More ▾</option>
                    <option value="perpetual">Perpetual</option>
                    <option value="delivery">Delivery</option>
                    <option value="pre-market">Pre-Market</option>
                    <option value="new">New{newOnly ? " ✓" : ""}</option>
                    <option value="hot">Hot{hotOnly ? " ✓" : ""}</option>
                  </select>
                </label>
                <label className="compact-select quote-select">
                  <span>{quote === "All" ? "All quotes" : quote}</span>
                  <select
                    aria-label="Quote asset"
                    onChange={(event) => setQuote(event.target.value)}
                    value={quote}
                  >
                    <option value="All">All quotes</option>
                    {["USDT", "USDC", "BTC", "ETH", "MX", "Other"].map(
                      (item) => (
                        <option key={item}>{item}</option>
                      ),
                    )}
                  </select>
                </label>
              </>
            ) : (
              <>
                <Tabs
                  className="market-browser-primary-tabs"
                  items={dexPrimary}
                  label="DEX network"
                  value={dexTab}
                  onChange={setDexTab}
                />
                <label className="compact-select more-select">
                  <span>More</span>
                  <select
                    aria-label="DEX venue"
                    onChange={(event) => setDexVenue(event.target.value)}
                    value={dexVenue}
                  >
                    <option>All venues</option>
                    {dexVenues.slice(1).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="compact-select discovery-select">
                  <span>{discovery}</span>
                  <select
                    aria-label="DEX discovery"
                    onChange={(event) => setDiscovery(event.target.value)}
                    value={discovery}
                  >
                    {dexDiscovery.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <button
                  aria-expanded={filtersOpen}
                  className="filters-toggle"
                  onClick={() => setFiltersOpen((x) => !x)}
                  type="button"
                >
                  Filters ⚙
                </button>
              </>
            )}
          </div>
          {source === "dex" && filtersOpen ? (
            <div className="advanced-filters">
              <label>
                Minimum liquidity
                <input
                  min="0"
                  onChange={(e) =>
                    setFilters((x) => ({ ...x, liquidity: e.target.value }))
                  }
                  type="number"
                  value={filters.liquidity}
                />
              </label>
              <label>
                Minimum volume
                <input
                  min="0"
                  onChange={(e) =>
                    setFilters((x) => ({ ...x, volume: e.target.value }))
                  }
                  type="number"
                  value={filters.volume}
                />
              </label>
              <label>
                Maximum age
                <input
                  min="0"
                  onChange={(e) =>
                    setFilters((x) => ({ ...x, age: e.target.value }))
                  }
                  type="number"
                  value={filters.age}
                />
              </label>
              <label>
                Unit
                <select
                  onChange={(e) =>
                    setFilters((x) => ({ ...x, unit: e.target.value }))
                  }
                  value={filters.unit}
                >
                  <option>hours</option>
                  <option>days</option>
                </select>
              </label>
              <button
                onClick={() =>
                  setFilters({
                    liquidity: "",
                    volume: "",
                    age: "",
                    unit: "hours",
                  })
                }
                type="button"
              >
                Reset
              </button>
            </div>
          ) : null}
          {source === "dex" ? (
            <div className="dex-risk-strip">
              ⚠ High-risk markets · Verify contracts and liquidity.
            </div>
          ) : null}
          {source === "dex" && degraded ? (
            <details className="provider-detail">
              <summary>Cached results available</summary>
              <p>{degraded}</p>
              <button onClick={() => setRetry((x) => x + 1)} type="button">
                Retry
              </button>
            </details>
          ) : null}
        </div>
        <div className="market-browser-results-shell">
          <div className="market-browser-column-header">
            <span />
            <span>{source === "mexc" ? "Trading Pair" : "Token / Pool"}</span>
            <span>{source === "mexc" ? "Last Price" : "Price"}</span>
            <span>24h Change</span>
            <span>{source === "mexc" ? "Volume" : "Liquidity"}</span>
          </div>
          <div
            aria-busy={loading}
            aria-label={`${source === "mexc" ? "MEXC" : "DEX"} market results`}
            className="market-browser-results"
            role="listbox"
          >
            {source === "mexc" ? (
              visible.length ? (
                visible.map((m) => (
                  <MexcRow
                    active={m.key === selectedMarketKey}
                    favourite={favourites.includes(m.key)}
                    key={m.key}
                    market={m}
                    onFavourite={() => onFavourite(m.key)}
                    onSelect={() => onSelect(m)}
                  />
                ))
              ) : (
                <div className="browser-empty">
                  <b>No markets found</b>
                  <span>Try a different search or filter.</span>
                </div>
              )
            ) : filteredDex.length ? (
              filteredDex.map((m) => (
                <DexRow
                  active={m.key === dexSelected}
                  favourite={dexFavourites.includes(m.key)}
                  key={m.key}
                  market={m}
                  now={openedAt}
                  onFavourite={() =>
                    setDexFavourites((x) =>
                      x.includes(m.key)
                        ? x.filter((k) => k !== m.key)
                        : [...x, m.key],
                    )
                  }
                  onSelect={() => setDexSelected(m.key)}
                />
              ))
            ) : loading ? (
              <div className="browser-skeleton" aria-label="Loading markets">
                <i />
                <i />
                <i />
                <i />
              </div>
            ) : (
              <div className="browser-empty">
                <b>No DEX markets found</b>
                <span>
                  {degraded
                    ? "Showing the last available result set."
                    : "Try a different network or search."}
                </span>
              </div>
            )}
            {source === "dex" && !query ? (
              <button
                className="load-more"
                disabled={loading}
                onClick={() => {
                  setCursor(String(Number(cursor) + 1));
                  void loadDex(true);
                }}
                type="button"
              >
                {loading ? "Loading markets…" : "Load more markets"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
