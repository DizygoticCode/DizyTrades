"use client";
import styles from "./manual-paper-ticket.module.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { PAPER_SIZE_STOPS, sliderToAmount } from "./lib/manual-paper-sizing";
type Mode = "fixed-margin" | "fixed-notional" | "equity-percent";
type Position = {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  leverage: number;
  margin?: number;
  stopLoss?: number;
  takeProfit?: number;
};
type Fill = {
  fillId: string;
  side: string;
  symbol: string;
  price: number;
  quantity: number;
  fee: number;
  realisedPnl: number;
  timestamp: string;
};
type Account = {
  cashBalance: number;
  realisedPnl: number;
  fees: number;
  positions: Record<string, Position>;
  fills: Fill[];
  settings: {
    enabled: boolean;
    commissionPct: number;
    confirmationRequired: boolean;
    panelHeight: number;
    panelCollapsed: boolean;
    panelHidden?: boolean;
    defaultSizeMode: Mode;
    defaultAmount: number;
    defaultEquityPct: number;
    defaultLeverage: number;
  };
};
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
const leverageStops = [1, 2, 3, 5, 10, 20];
export function ManualPaperTicket({
  symbol,
  publicPrice,
  readOnly,
}: {
  symbol: string;
  publicPrice: number | null;
  readOnly: boolean;
}) {
  const [account, setAccount] = useState<Account | null>(null),
    [tab, setTab] = useState<"positions" | "history" | "account">("positions"),
    [side, setSide] = useState<"long" | "short">("long"),
    [mode, setMode] = useState<Mode>("fixed-margin"),
    [amount, setAmount] = useState("100"),
    [sizePercent, setSizePercent] = useState(0),
    [leverage, setLeverage] = useState("1"),
    [stopLoss, setStopLoss] = useState(""),
    [takeProfit, setTakeProfit] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [hidden, setHidden] = useState(false),
    [height, setHeight] = useState(390);
  const load = useCallback(async () => {
    const response = await fetch("/api/manual-paper");
    if (response.ok)
      setAccount(((await response.json()) as { account: Account }).account);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external account synchronisation
    void load().catch(() => setError("Unable to load Manual Paper account."));
  }, [load]);
  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/manual-paper", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        data = (await response.json()) as { account?: Account; error?: string };
      if (!response.ok)
        throw new Error(data.error || "Manual Paper request failed");
      if (data.account) setAccount(data.account);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Manual Paper request failed",
      );
    } finally {
      setBusy(false);
    }
  }, []);
  const position = account?.positions[symbol],
    mark = publicPrice ?? position?.entryPrice ?? 0,
    unrealised = position
      ? (mark - position.entryPrice) *
        position.quantity *
        (position.side === "long" ? 1 : -1)
      : 0,
    equity = Math.max(0, (account?.cashBalance ?? 0) + unrealised),
    used = Object.values(account?.positions ?? {}).reduce(
      (sum, p) => sum + (p.margin ?? (p.quantity * p.entryPrice) / p.leverage),
      0,
    ),
    amountNumber = Math.max(0, Number(amount) || 0),
    leverageNumber = Math.max(1, Number(leverage) || 1),
    margin = Math.max(
      0,
      mode === "equity-percent"
        ? (equity * amountNumber) / 100
        : mode === "fixed-notional"
          ? amountNumber / leverageNumber
          : amountNumber,
    ),
    notional = Math.max(
      0,
      mode === "fixed-notional" ? amountNumber : margin * leverageNumber,
    ),
    quantity = publicPrice && publicPrice > 0 ? notional / publicPrice : 0,
    fee = Math.max(
      0,
      (notional * (account?.settings.commissionPct ?? 0)) / 100,
    ),
    remaining = equity - used - margin - fee,
    invalidAmount = !Number.isFinite(quantity) || quantity <= 0 || margin < 0;
  const choosePercent = useCallback(
    (percent: number) => {
      const safe = Math.min(100, Math.max(0, percent));
      setSizePercent(safe);
      setAmount(String(sliderToAmount(safe, equity, mode, leverageNumber)));
    },
    [equity, mode, leverageNumber],
  );
  const submit = useCallback(
    async (orderSide: "long" | "short") => {
      if (
        readOnly ||
        !account?.settings.enabled ||
        !publicPrice ||
        invalidAmount
      )
        return;
      if (
        account.settings.confirmationRequired &&
        !window.confirm(
          `${orderSide === "long" ? "Open Long" : "Open Short"} in Manual Paper? No exchange order will be sent.`,
        )
      )
        return;
      await post({
        action: "order",
        symbol,
        side: orderSide,
        sizeMode: mode,
        amount: Number(amount),
        leverage: Number(leverage),
        stopLoss: stopLoss ? Number(stopLoss) : null,
        takeProfit: takeProfit ? Number(takeProfit) : null,
        confirmReverse: Boolean(position && position.side !== orderSide),
        idempotencyKey: crypto.randomUUID(),
      });
    },
    [
      readOnly,
      account,
      publicPrice,
      invalidAmount,
      post,
      symbol,
      mode,
      amount,
      leverage,
      stopLoss,
      takeProfit,
      position,
    ],
  );
  useEffect(() => {
    const quick = (event: Event) => {
      if (readOnly) return;
      const value = (event as CustomEvent<"long" | "short">).detail;
      setHidden(false);
      setCollapsed(false);
      void submit(value);
    };
    const open = () => setHidden(false);
    window.addEventListener("manual-paper-quick", quick);
    window.addEventListener("manual-paper-open", open);
    return () => {
      window.removeEventListener("manual-paper-quick", quick);
      window.removeEventListener("manual-paper-open", open);
    };
  }, [readOnly, submit]);
  const action = (value: string, extra: Record<string, unknown> = {}) =>
      post({
        action: value,
        symbol,
        idempotencyKey: crypto.randomUUID(),
        ...extra,
      }),
    positions = useMemo(
      () => Object.values(account?.positions ?? {}),
      [account],
    ),
    disabled =
      busy ||
      readOnly ||
      !account?.settings.enabled ||
      !publicPrice ||
      invalidAmount;
  if (hidden)
    return (
      <button className={styles.reopen} onClick={() => setHidden(false)}>
        Open Manual Paper
      </button>
    );
  return (
    <section
      className={`${styles.panel} ${collapsed ? styles.collapsed : ""}`}
      style={collapsed ? undefined : { height }}
    >
      <div
        className={styles.resize}
        onPointerDown={(event) => {
          const start = event.clientY,
            initial = height;
          const move = (e: PointerEvent) =>
              setHeight(
                Math.max(260, Math.min(650, initial + start - e.clientY)),
              ),
            up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
      <header className={styles.header}>
        <strong>Manual Paper</strong>
        <span className={styles.simulation}>Simulation only</span>
        <span
          className={
            account?.settings.enabled ? styles.enabled : styles.disabled
          }
        >
          {account?.settings.enabled ? "Enabled" : "Disabled"}
        </span>
        <span>
          Equity <b>{money(equity)}</b>
        </span>
        <span>
          Unrealised{" "}
          <b className={unrealised >= 0 ? styles.positive : styles.negative}>
            {money(unrealised)}
          </b>
        </span>
        <div className={styles.headerSpacer} />
        <button
          aria-label="Minimise Manual Paper"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "▴" : "—"}
        </button>
        <button aria-label="Hide Manual Paper" onClick={() => setHidden(true)}>
          ×
        </button>
      </header>
      {!collapsed ? (
        <div className={styles.body}>
          <aside className={styles.ticket}>
            <section>
              <div className={styles.sectionTitle}>
                <span>Direction</span>
                <span>{side === "long" ? "Buy / Long" : "Sell / Short"}</span>
              </div>
              <div className={styles.sideSelector}>
                <button
                  className={side === "long" ? styles.longActive : ""}
                  onClick={() => setSide("long")}
                >
                  Long
                </button>
                <button
                  className={side === "short" ? styles.shortActive : ""}
                  onClick={() => setSide("short")}
                >
                  Short
                </button>
              </div>
            </section>
            <div className={styles.twoColumns}>
              <label>
                Order type
                <select disabled>
                  <option>Market</option>
                </select>
              </label>
              <label>
                Sizing mode
                <select
                  value={mode}
                  onChange={(e) => {
                    const next = e.target.value as Mode;
                    setMode(next);
                    if (sizePercent > 0)
                      setAmount(
                        String(
                          sliderToAmount(
                            sizePercent,
                            equity,
                            next,
                            leverageNumber,
                          ),
                        ),
                      );
                  }}
                >
                  <option value="fixed-margin">Fixed margin</option>
                  <option value="fixed-notional">Fixed notional</option>
                  <option value="equity-percent">Equity percentage</option>
                </select>
              </label>
            </div>
            <label>
              Amount{" "}
              <span className={styles.unit}>
                {mode === "equity-percent" ? "%" : "USDT"}
              </span>
              <input
                aria-invalid={invalidAmount}
                type="number"
                min="0"
                value={amount}
                onChange={(e) => {
                  setSizePercent(0);
                  setAmount(e.target.value);
                }}
              />
              {invalidAmount ? (
                <small className={styles.fieldError}>
                  Enter a valid positive amount.
                </small>
              ) : null}
            </label>
            <section>
              <div className={styles.sectionTitle}>
                <span>Leverage</span>
                <b>{leverageNumber}×</b>
              </div>
              <div className={styles.leverages}>
                {leverageStops.map((value) => (
                  <button
                    key={value}
                    className={leverageNumber === value ? styles.active : ""}
                    onClick={() => {
                      setLeverage(String(value));
                      if (sizePercent > 0)
                        setAmount(
                          String(
                            sliderToAmount(sizePercent, equity, mode, value),
                          ),
                        );
                    }}
                  >
                    {value}×
                  </button>
                ))}
              </div>
            </section>
            <section>
              <div className={styles.sectionTitle}>
                <span>Position size</span>
                <b>{sizePercent}%</b>
              </div>
              <div
                className={styles.sizeControl}
                style={{ "--size-percent": `${sizePercent}%` } as CSSProperties}
              >
                <div className={styles.sliderRow}>
                  <input
                    aria-label="Manual Paper position size percentage"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={sizePercent}
                    onChange={(e) => choosePercent(Number(e.target.value))}
                  />
                </div>
                <div className={styles.sliderMarks}>
                  {PAPER_SIZE_STOPS.map((percent) => (
                    <button
                      key={percent}
                      className={sizePercent === percent ? styles.active : ""}
                      onClick={() => choosePercent(percent)}
                    >
                      <i />
                      {percent}%
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <div className={styles.twoColumns}>
              <label>
                Stop loss
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Take profit
                <input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className={styles.preview}>
              <h4>Order estimate</h4>
              {[
                ["Mark price", money(mark)],
                ["Quantity", quantity.toFixed(8)],
                ["Margin", money(margin)],
                ["Notional", money(notional)],
                ["Leverage", `${leverageNumber}×`],
                ["Estimated fee", money(fee)],
                ["Remaining equity", money(remaining)],
              ].map(([label, value]) => (
                <span key={label}>
                  <small>{label}</small>
                  <b>{value}</b>
                </span>
              ))}
            </div>
            <div className={styles.openActions}>
              <button
                className={styles.openLong}
                disabled={disabled}
                onClick={() => void submit("long")}
              >
                {busy ? "Submitting…" : "Open Long"}
              </button>
              <button
                className={styles.openShort}
                disabled={disabled}
                onClick={() => void submit("short")}
              >
                {busy ? "Submitting…" : "Open Short"}
              </button>
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </aside>
          <main className={styles.workspace}>
            <nav className={styles.tabs}>
              {(["positions", "history", "account"] as const).map((value) => (
                <button
                  className={tab === value ? styles.active : ""}
                  onClick={() => setTab(value)}
                  key={value}
                >
                  {value === "account"
                    ? "Assets / Account"
                    : value === "history"
                      ? "Order History"
                      : "Positions"}
                </button>
              ))}
            </nav>
            {tab === "positions" ? (
              <div className={styles.tableWrap}>
                <div className={styles.toolbar}>
                  <button
                    className={styles.danger}
                    disabled={readOnly || busy || !positions.length}
                    onClick={() => {
                      if (window.confirm("Flatten all paper positions?"))
                        void action("flatten-all");
                    }}
                  >
                    Flatten All
                  </button>
                </div>
                {!positions.length ? (
                  <div className={styles.empty}>
                    No open paper positions
                    <small>Simulated positions will appear here.</small>
                  </div>
                ) : (
                  <div className={styles.positionTable}>
                    <div className={styles.tableHead}>
                      {[
                        "Symbol",
                        "Side",
                        "Size",
                        "Entry / Mark",
                        "Lev.",
                        "Margin",
                        "Unrealised P/L · ROE",
                        "TP / SL",
                        "Actions",
                      ].map((v) => (
                        <span key={v}>{v}</span>
                      ))}
                    </div>
                    {positions.map((p) => {
                      const pnl =
                          (mark - p.entryPrice) *
                          p.quantity *
                          (p.side === "long" ? 1 : -1),
                        m =
                          p.margin ?? (p.quantity * p.entryPrice) / p.leverage;
                      return (
                        <div className={styles.positionRow} key={p.symbol}>
                          <span>
                            <b>{p.symbol}</b>
                          </span>
                          <span
                            className={
                              p.side === "long"
                                ? styles.positive
                                : styles.negative
                            }
                          >
                            {p.side.toUpperCase()}
                          </span>
                          <span>{p.quantity.toFixed(6)}</span>
                          <span>
                            {money(p.entryPrice)}
                            <small>{money(mark)}</small>
                          </span>
                          <span>{p.leverage}×</span>
                          <span>{money(m)}</span>
                          <span
                            className={
                              pnl >= 0 ? styles.positive : styles.negative
                            }
                          >
                            {money(pnl)}
                            <small>
                              {m ? ((pnl / m) * 100).toFixed(2) : "0.00"}%
                            </small>
                          </span>
                          <span>
                            {p.stopLoss ?? "—"}
                            <small>{p.takeProfit ?? "—"}</small>
                          </span>
                          <span className={styles.rowActions}>
                            {[25, 50, 75].map((percentage) => (
                              <button
                                key={percentage}
                                onClick={() =>
                                  void action("partial-close", { percentage })
                                }
                              >
                                Close {percentage}%
                              </button>
                            ))}
                            <button
                              className={styles.danger}
                              onClick={() => void action("flash-close")}
                            >
                              Flash Close
                            </button>
                            <button onClick={() => void action("reverse")}>
                              Reverse
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : tab === "history" ? (
              <div className={styles.history}>
                {!account?.fills.length ? (
                  <div className={styles.empty}>No paper order history</div>
                ) : (
                  account.fills
                    .slice()
                    .reverse()
                    .map((fill) => (
                      <div key={fill.fillId}>
                        <span>{new Date(fill.timestamp).toLocaleString()}</span>
                        <b>
                          {fill.side} {fill.symbol}
                        </b>
                        <span>
                          {fill.quantity.toFixed(6)} @ {money(fill.price)}
                        </span>
                        <span
                          className={
                            fill.realisedPnl >= 0
                              ? styles.positive
                              : styles.negative
                          }
                        >
                          {money(fill.realisedPnl)}
                        </span>
                      </div>
                    ))
                )}
              </div>
            ) : (
              <div className={styles.summary}>
                {[
                  ["Cash balance", money(account?.cashBalance ?? 0)],
                  ["Equity", money(equity)],
                  ["Realised P/L", money(account?.realisedPnl ?? 0)],
                  ["Fees paid", money(account?.fees ?? 0)],
                ].map(([label, value]) => (
                  <span key={label}>
                    <small>{label}</small>
                    <b>{value}</b>
                  </span>
                ))}
              </div>
            )}
          </main>
        </div>
      ) : null}
    </section>
  );
}
