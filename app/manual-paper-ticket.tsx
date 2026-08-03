"use client";
import styles from "./manual-paper-ticket.module.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { PAPER_SIZE_STOPS, sliderToAmount } from "./lib/manual-paper-sizing";
import { auditPaperLiquidation, paperAccountSummary, type PaperLiquidationAudit } from "./lib/manual-paper-engine";
import type { DizyFlowIntelligenceSnapshot } from "./lib/order-flow/intelligence";
import { compactDizyFlowSample } from "./lib/historical-dizyflow-compact";
import { HistoricalDizyFlowCaptureManager } from "./lib/historical-dizyflow-capture";
import { HistoricalDizyFlowEventAdapter } from "./lib/historical-dizyflow-events";
import {clampContractLeverage,isMexcStepAligned,leverageStopsForContract,quantizeMexcStep,sizeMexcContractOrder,type MexcContractMetadata} from "./lib/mexc-contract-metadata";
import {simulatePaperMarketDepthFill,type PaperDepthFillEvidence} from "./lib/manual-paper-depth";
import {selectMexcContractRiskTier,type PaperRiskTierSnapshot} from "./lib/manual-paper-risk-tiers";
import type {DepthEnvelope} from "./lib/order-flow/types";
type Mode = "fixed-margin" | "fixed-notional" | "equity-percent" | "risk-percent";
type FundingRate={symbol:string;fundingRate:number;minFundingRate:number;maxFundingRate:number;collectCycleHours:number;nextSettleTime:number;observedAt:number;source:"mexc-public-funding-rate"};
type FundingPayment={paymentId:string;tradeId:string;symbol:string;side:"long"|"short";settleTime:number;observedAt:number;price:number;priceSource:"fair"|"last";notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";resultingBalance:number};
type ReduceOnlyEvidence={enabled:true;calculationMethod:"position-bound-cap";source:"manual-close"|"partial-close"|"reverse"|"flatten-all"|"risk-exit"|"opposite-order-replacement";expectedTradeId:string;expectedSide:"long"|"short";positionQuantityBefore:number;requestedQuantity:number;acceptedQuantity:number;capped:boolean;filledQuantity:number;remainingQuantity:number;result:"closed"|"reduced"};
type Position = {
  tradeId: string;
  marketKey: string;
  marketType: "futures";
  openedAt: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  contractVolume?: number;
  contractSize?: number;
  priceUnit?: number;
  volUnit?: number;
  minContractVolume?: number;
  maxContractVolume?: number;
  entryDepthFill?: PaperDepthFillEvidence;
  entryPrice: number;
  leverage: number;
  margin?: number;
  marginMode: "isolated" | "cross";
  estimatedLiquidation: number;
  bankruptcyPrice?: number;
  riskTier?: PaperRiskTierSnapshot;
  liquidationAudit?: PaperLiquidationAudit;
  executionType?: "market";
  liquidityRole?: "maker" | "taker";
  feeRate?: number;
  feeSource?: "mexc-public-contract" | "legacy-settings-fallback";
  makerFeeRate?: number;
  takerFeeRate?: number;
  fundingRate?: number;
  fundingCollectCycleHours?: number;
  nextFundingTime?: number;
  fundingSource?: "mexc-public-funding-rate";
  fundingPnl?: number;
  riskPriceSource: "fair" | "last";
  lastRiskPrice: number;
  pendingRiskExit?:{reason:"stop"|"target"|"liquidation";triggeredAt:string;triggerPrice:number;priceSource:"fair"|"last"};
  stopLoss?: number;
  takeProfit?: number;
};
type Fill = {
  tradeId?: string;
  fillId: string;
  side: string;
  symbol: string;
  price: number;
  quantity: number;
  contractVolume?: number;
  entryDepthFill?: PaperDepthFillEvidence;
  exitDepthFill?: PaperDepthFillEvidence;
  reduceOnly?: ReduceOnlyEvidence;
  bankruptcyPrice?: number;
  riskTier?: PaperRiskTierSnapshot;
  liquidationAudit?: PaperLiquidationAudit;
  fee: number;
  executionType?: "market";
  liquidityRole?: "maker" | "taker";
  feeRate?: number;
  feeSource?: "mexc-public-contract" | "legacy-settings-fallback";
  makerFeeRate?: number;
  takerFeeRate?: number;
  tradingFee?: number;
  liquidationPenalty?: number;
  realisedPnl: number;
  timestamp: string;
  riskExitTrigger?:{reason:"stop"|"target"|"liquidation";triggeredAt:string;triggerPrice:number;priceSource:"fair"|"last"};
  closeReason?: "manual"|"stop"|"target"|"liquidation"|"reversal";
  netPnl?: number;
  historicalDizyFlow?:{available:boolean;memoryId:string|null;sampleCount:number;eventCount:number;coveragePct:number|null;limitations:readonly string[]};
};
type Account = {
  startingBalance: number;
  cashBalance: number;
  realisedPnl: number;
  fees: number;
  fundingPnl: number;
  fundingPayments: FundingPayment[];
  positions: Record<string, Position>;
  fills: Fill[];
  settings: {
    enabled: boolean;
    commissionPct: number;
    makerCommissionPct: number;
    slippagePct: number;
    confirmationRequired: boolean;
    panelHeight: number;
    panelCollapsed: boolean;
    panelHidden?: boolean;
    defaultSizeMode: Mode;
    defaultAmount: number;
    defaultEquityPct: number;
    defaultLeverage: number;
    maintenanceMarginPct: number;
    liquidationPenaltyPct: number;
  };
};
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
export function ManualPaperTicket({
  symbol,
  publicPrice,
  readOnly,
  marketKey,
  intelligence,
}: {
  symbol: string;
  publicPrice: number | null;
  readOnly: boolean;
  marketKey: string;
  intelligence: DizyFlowIntelligenceSnapshot | null;
}) {
  const [account, setAccount] = useState<Account | null>(null),
    [tab, setTab] = useState<"positions" | "history" | "account">("positions"),
    [side, setSide] = useState<"long" | "short">("long"),
    [mode, setMode] = useState<Mode>("fixed-margin"),
    [amount, setAmount] = useState("100"),
    [sizePercent, setSizePercent] = useState(0),
    [leverage, setLeverage] = useState("1"),
    [marginMode, setMarginMode] = useState<"isolated" | "cross">("isolated"),
    [stopLoss, setStopLoss] = useState(""),
    [takeProfit, setTakeProfit] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [hidden, setHidden] = useState(false),
    [height, setHeight] = useState(390);
  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null),[contract,setContract]=useState<MexcContractMetadata|null>(null),[funding,setFunding]=useState<FundingRate|null>(null),[depth,setDepth]=useState<DepthEnvelope|null>(null);
  const captureManager=useRef(new HistoricalDizyFlowCaptureManager()),eventAdapter=useRef(new HistoricalDizyFlowEventAdapter()),previousPosition=useRef<Position|null>(null),finalizeTimers=useRef(new Set<number>()),retryManager=useRef<HistoricalDizyFlowCaptureManager|null>(null);
  const [captureStatus,setCaptureStatus]=useState<ReturnType<HistoricalDizyFlowCaptureManager["status"]>>({state:"buffering",tradeId:null,marketKey:null,symbol:null,sampleCount:0,eventCount:0,skippedDuplicates:0,sampleLimitReached:false,eventLimitReached:false}),[captureError,setCaptureError]=useState(""),[captureWarning,setCaptureWarning]=useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/manual-paper?symbol=${encodeURIComponent(symbol)}`);
    if (response.ok)
      {const payload=(await response.json()) as { account: Account;riskPrice?:{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null;contract?:MexcContractMetadata|null;funding?:FundingRate|null;depth?:DepthEnvelope|null },nextContract=payload.contract??null;setAccount(payload.account);setRiskState(payload.riskPrice??null);setContract(nextContract);setFunding(payload.funding??null);setDepth(payload.depth??null);if(nextContract)setLeverage(current=>String(clampContractLeverage(Number(current),nextContract)))}
  }, [symbol]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external account synchronisation
    void load().catch(() => setError("Unable to load Manual Paper account."));
  }, [load]);
  useEffect(()=>{if(!account?.positions[symbol])return;const timer=window.setInterval(()=>void load(),5000);return()=>window.clearInterval(timer)},[account?.positions,symbol,load]);
  useEffect(()=>{if(readOnly||!intelligence)return;const events=eventAdapter.current.adapt(intelligence);captureManager.current.observe(compactDizyFlowSample(intelligence),{marketKey,symbol,marketType:"futures"},events);setCaptureStatus(captureManager.current.status())},[intelligence,marketKey,readOnly,symbol]);
  const uploadCapture=useCallback(async(manager=captureManager.current)=>{try{manager.retry();const draft=manager.finalise(),response=await fetch(`/api/paper/trades/${encodeURIComponent(draft.tradeId)}/historical-dizyflow`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(draft)});const payload=await response.json() as {warning?:string|null};if(!response.ok)throw new Error("Historical flow retention failed. Retry is available.");manager.markCompleted();if(retryManager.current===manager)retryManager.current=null;setCaptureError("");setCaptureWarning(payload.warning??"");await load()}catch(reason){manager.markFailed();retryManager.current=manager;setCaptureError(reason instanceof Error?reason.message:"Historical flow retention failed.")}finally{if(manager===captureManager.current)setCaptureStatus(manager.status())}},[load]);
  useEffect(()=>{const current=account?.positions[symbol]??null,previous=previousPosition.current;if(!readOnly&&previous&&(!current||current.tradeId!==previous.tradeId)){const closed=account?.fills.slice().reverse().find(fill=>fill.side==="close"&&fill.tradeId===previous.tradeId),closingManager=captureManager.current;if(closed){try{closingManager.fullClose(Date.parse(closed.timestamp));const timer=window.setTimeout(()=>{finalizeTimers.current.delete(timer);closingManager.ready(Date.parse(closed.timestamp)+15_000);void uploadCapture(closingManager)},15_000);finalizeTimers.current.add(timer)}catch{/* A missing in-memory session remains unavailable; it is never reconstructed. */}}if(current&&current.marketKey===marketKey){captureManager.current=new HistoricalDizyFlowCaptureManager();if(intelligence)captureManager.current.observe(compactDizyFlowSample(intelligence),{marketKey,symbol:current.symbol,marketType:"futures"});}}if(!readOnly&&current&&current.marketKey===marketKey&&(!previous||previous.tradeId!==current.tradeId)){try{captureManager.current.open({tradeId:current.tradeId,marketKey:current.marketKey,symbol:current.symbol,marketType:current.marketType,entryTimeMs:Date.parse(current.openedAt)})}catch{/* Duplicate lifecycle observations cannot open a second session. */}}previousPosition.current=current;setCaptureStatus(captureManager.current.status());return()=>{}},[account,intelligence,marketKey,readOnly,symbol,uploadCapture]);
  useEffect(()=>()=>{for(const timer of finalizeTimers.current)window.clearTimeout(timer);finalizeTimers.current.clear();captureManager.current.interrupt("page-session-interrupted")},[]);
  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/manual-paper", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        data = (await response.json()) as { account?: Account; error?: string|{message?:string} };
      if (!response.ok)
        throw new Error(typeof data.error==="string"?data.error:data.error?.message||"Manual Paper request failed");
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
    mark = riskState?.price ?? (position?.symbol===symbol?position.lastRiskPrice:0) ?? 0,
    unrealised = position
      ? (mark - position.entryPrice) *
        position.quantity *
        (position.side === "long" ? 1 : -1)
      : 0,
    equity = Math.max(0, (account?.cashBalance ?? 0) + unrealised),
    summary=paperAccountSummary(account?.cashBalance??0,Object.values(account?.positions??{}).map(p=>({...p,margin:p.margin??p.quantity*p.entryPrice/p.leverage})),Object.values(account?.positions??{}).map(p=>p.symbol===symbol?mark:p.lastRiskPrice)),used=summary.usedMargin,
    amountNumber = Math.max(0, Number(amount) || 0),
    leverageNumber = contract?clampContractLeverage(Number(leverage),contract):Math.max(1,Number(leverage)||1),
    leverageStops=leverageStopsForContract(contract),
    targetMargin = Math.max(
      0,
      mode === "equity-percent"||mode==="risk-percent"
        ? (equity * amountNumber) / 100
        : mode === "fixed-notional"
          ? amountNumber / leverageNumber
          : amountNumber,
    ),
    targetNotional = Math.max(
      0,
      mode === "fixed-notional" ? amountNumber : mode==="risk-percent"&&publicPrice&&Number(stopLoss)>0?equity*amountNumber/100/(Math.abs(publicPrice-Number(stopLoss))/publicPrice):targetMargin * leverageNumber,
    ),
    rawContractVolume=contract&&publicPrice&&publicPrice>0?targetNotional/(publicPrice*contract.contractSize):0,
    steppedContractVolume=contract&&rawContractVolume>0?quantizeMexcStep(rawContractVolume,contract.volUnit,"floor"):0,
    contractVolumeIssue=contract&&targetNotional>0?(steppedContractVolume<contract.minVol?`Minimum ${contract.minVol} contracts`:steppedContractVolume>contract.maxVol?`Maximum ${contract.maxVol} contracts`:null):null,
    requestedContractOrder=(()=>{try{return contract&&publicPrice&&publicPrice>0&&!contractVolumeIssue?sizeMexcContractOrder(targetNotional,publicPrice,contract):null}catch{return null}})(),
    depthPreview=(()=>{try{return contract&&depth&&publicPrice&&publicPrice>0&&requestedContractOrder?simulatePaperMarketDepthFill({side,requestedContractVolume:requestedContractOrder.contractVolume,referencePrice:publicPrice,contract,depth}):null}catch{return null}})(),
    exitDepthPreview=(()=>{try{const openVolume=position&&contract?(position.contractVolume??position.quantity/contract.contractSize):0;return position&&contract&&depth&&mark>0&&openVolume>0?simulatePaperMarketDepthFill({side:position.side,opening:false,requestedContractVolume:openVolume,openContractVolume:openVolume,minimumRemainingContractVolume:position.minContractVolume??contract.minVol,referencePrice:mark,contract,depth}):null}catch{return null}})(),
    executionPrice=depthPreview?.executionPrice??publicPrice??0,
    contractOrder=depthPreview?{contractVolume:depthPreview.filledContractVolume,quantity:depthPreview.quantity,notional:depthPreview.notional}:requestedContractOrder,
    contractVolume=contractOrder?.contractVolume??0,
    quantity=contractOrder?.quantity??0,
    notional=contractOrder?.notional??0,
    riskTierState=(()=>{try{return {tier:contract&&contractOrder?selectMexcContractRiskTier(contract,{contractVolume:contractOrder.contractVolume,notional:contractOrder.notional}):null,error:null as string|null}}catch{return {tier:null,error:"Requested size exceeds the documented public MEXC risk schedule."}}})(),
    riskTierPreview=riskTierState.tier,
    riskTierIssue=riskTierState.error??(riskTierPreview&&leverageNumber>riskTierPreview.maxLeverage?`Tier ${riskTierPreview.level} allows at most ${riskTierPreview.maxLeverage}× leverage.`:null),
    margin=leverageNumber>0?notional/leverageNumber:0,
    feeRate=contract?.takerFeeRate??(account?.settings.commissionPct??0)/100,
    feeSource=contract?"MEXC public contract":"Legacy settings fallback",
    fee = Math.max(0,notional*feeRate),
    fundingRate=funding?.fundingRate??position?.fundingRate??0,
    fundingCycle=funding?.collectCycleHours??position?.fundingCollectCycleHours??0,
    fundingSource=funding?.source??position?.fundingSource??null,
    fundingNotional=position?position.quantity*mark:notional,
    fundingSide=position?.side??side,
    estimatedFunding=(fundingSide==="long"?-1:1)*fundingNotional*fundingRate,
    nextFundingTime=funding?.nextSettleTime??position?.nextFundingTime??0,
    lastFundingPayment=account?.fundingPayments?.at(-1),
    liquidationAudit=(()=>{try{return quantity>0?auditPaperLiquidation({side,entryPrice:executionPrice,quantity,marginMode,assignedMargin:margin,crossCollateral:equity,entryFee:fee,maintenanceMarginRate:riskTierPreview?.maintenanceMarginRate??contract?.maintenanceMarginRate??(account?.settings.maintenanceMarginPct??.5)/100,liquidationPenaltyRate:(account?.settings.liquidationPenaltyPct??.1)/100}):null}catch{return null}})(),
    liquidation=liquidationAudit?.estimatedLiquidation??NaN,
    bankruptcy=liquidationAudit?.bankruptcyPrice??NaN,
    riskAmount=stopLoss&&quantity?Math.abs(executionPrice-Number(stopLoss))*quantity:0,
    rewardRisk=stopLoss&&takeProfit&&riskAmount?Math.abs(Number(takeProfit)-executionPrice)*quantity/riskAmount:0,
    remaining = equity - used - margin - fee,
    invalidPriceStep=Boolean(contract&&((stopLoss&&!isMexcStepAligned(Number(stopLoss),contract.priceUnit))||(takeProfit&&!isMexcStepAligned(Number(takeProfit),contract.priceUnit)))),
    invalidAmount = !Number.isFinite(quantity) || quantity <= 0 || margin < 0 || Boolean(contractVolumeIssue) || Boolean(riskTierIssue) || invalidPriceStep;
  const choosePercent = (percent: number) => {
    const safe = Math.min(100, Math.max(0, percent));
    setSizePercent(safe);
    setAmount(String(sliderToAmount(safe, equity, mode, leverageNumber)));
  };
  const submit = async (orderSide: "long" | "short") => {
    if (
      readOnly ||
      !account?.settings.enabled ||
      !publicPrice ||
      !contract ||
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
      marginMode,
      stopLoss: stopLoss ? Number(stopLoss) : null,
      takeProfit: takeProfit ? Number(takeProfit) : null,
      confirmReverse: Boolean(position && position.side !== orderSide),
      expectedTradeId: position?.tradeId,
      expectedSide: position?.side,
      idempotencyKey: crypto.randomUUID(),
    });
  };
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
  const action = (value: string, extra: Record<string, unknown> = {}) => {
    const actionSymbol=String(extra.symbol??symbol),actionPosition=account?.positions[actionSymbol];
    return post({action:value,symbol:actionSymbol,idempotencyKey:crypto.randomUUID(),expectedTradeId:actionPosition?.tradeId,expectedSide:actionPosition?.side,...extra});
  };
  const positions = useMemo(
      () => Object.values(account?.positions ?? {}),
      [account],
    ),
    disabled =
      busy ||
      readOnly ||
      !account?.settings.enabled ||
      !publicPrice ||
      invalidAmount ||
      !contract;
  if (hidden)
    return (
      <button className={styles.reopen} onClick={() => setHidden(false)}>
        Open Manual Paper
      </button>
    );
  return (
    <section
      id="manual-paper-panel"
      tabIndex={-1}
      aria-labelledby="manual-paper-heading"
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
        <strong id="manual-paper-heading">Manual Paper</strong>
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
        <span aria-live="polite">Manual Paper flow {captureStatus.state} · {captureStatus.sampleCount} samples · {captureStatus.eventCount} events</span>
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
                  <option value="risk-percent">Risk % (stop required)</option>
                </select>
              </label>
            </div>
            <label>
              Amount{" "}
              <span className={styles.unit}>
                {mode === "equity-percent" || mode === "risk-percent" ? "%" : "USDT"}
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
            <label>
              Margin mode
              <select value={marginMode} onChange={e=>setMarginMode(e.target.value as "isolated"|"cross")}>
                <option value="isolated">Isolated</option><option value="cross">Cross (approximation)</option>
              </select>
            </label>
            <section>
              <div className={styles.sectionTitle}>
                <span>{contract?`Leverage · MEXC public range ${contract.minLeverage}–${contract.maxLeverage}×`:"Leverage · MEXC rules unavailable"}</span>
                <b>{leverageNumber}×</b>
              </div>
              <label>
                Selected leverage
                <input type="number" min={contract?.minLeverage??1} max={contract?.maxLeverage??20} step="1" value={leverage} disabled={!contract} onChange={event=>{const value=contract?clampContractLeverage(Number(event.target.value),contract):1;setLeverage(String(value));if(sizePercent>0)setAmount(String(sliderToAmount(sizePercent,equity,mode,value)))}} />
              </label>
              <div className={styles.leverages}>
                {leverageStops.map((value) => (
                  <button
                    key={value}
                    className={leverageNumber === value ? styles.active : ""}
                    disabled={!contract}
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
                  step={contract?.priceUnit ?? "any"}
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Take profit
                <input
                  type="number"
                  step={contract?.priceUnit ?? "any"}
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className={styles.preview}>
              <h4>Order estimate</h4>
              {[
                ["Risk price", mark?`${money(mark)} · ${riskState?.source==="fair"?"Fair":"Last fallback"}`:"Awaiting Fair / Last"],
                ["Symbol", symbol],
                ["Margin mode", marginMode],
                ["Execution price", executionPrice?money(executionPrice):"—"],
                ["Contracts", contractVolume?String(contractVolume):"—"],
                ["Contract size", contract?String(contract.contractSize):"—"],
                ["Price tick", contract?String(contract.priceUnit):"—"],
                ["Quantity", quantity.toFixed(8)],
                ["Margin", money(margin)],
                ["Notional", money(notional)],
                ["Leverage", `${leverageNumber}×`],
                ["MEXC contract range", contract?`${contract.minLeverage}–${contract.maxLeverage}×`:"Unavailable"],
                ["Risk tier", riskTierPreview?`Tier ${riskTierPreview.level} · ${riskTierPreview.riskLimitType}`:"Unavailable"],
                ["Tier exposure", riskTierPreview?`${riskTierPreview.exposure.toLocaleString()} / ${riskTierPreview.maxExposure?.toLocaleString()??"unbounded"}`:"—"],
                ["Tier max leverage", riskTierPreview?`${riskTierPreview.maxLeverage}×`:"—"],
                ["Maintenance margin", riskTierPreview?`${(riskTierPreview.maintenanceMarginRate*100).toFixed(3)}%`:contract?`${(contract.maintenanceMarginRate*100).toFixed(3)}% fallback`:"Simulator fallback"],
                ["Tier source", riskTierPreview?.source??"Unavailable"],
                ["Execution assumption", "Market · taker"],
                ["Entry fill model", depthPreview?"DizyFlow visible-book walk":"Fresh depth captured on submit"],
                ["Visible fill", depthPreview?`${depthPreview.fillStatus} · ${depthPreview.filledContractVolume}/${depthPreview.requestedContractVolume} contracts`:"Preview unavailable"],
                ["Depth impact", depthPreview?`${depthPreview.priceImpactBps.toFixed(2)} bps · ${money(depthPreview.executionPrice)} avg`:"Calculated on submit"],
                ["Depth levels", depthPreview?`${depthPreview.levelsConsumed} ${depthPreview.bookSide} level${depthPreview.levelsConsumed===1?"":"s"}`:"—"],
                ["Depth snapshot", depthPreview?`v${depthPreview.snapshotVersion} · ${Math.round(depthPreview.snapshotAgeMs)}ms · ${depthPreview.sourceMode??"public depth"}`:"Not warm"],
                ["Taker fee rate", `${(feeRate*100).toFixed(4)}%`],
                ["Maker reference", contract?`${(contract.makerFeeRate*100).toFixed(4)}%`:`${(account?.settings.makerCommissionPct??0).toFixed(4)}% fallback`],
                ["Fee source", feeSource],
                ["Estimated fee", money(fee)],
                ["Funding rate", fundingSource?`${(fundingRate*100).toFixed(4)}% · ${fundingCycle}h`:"Unavailable"],
                ["Next funding", nextFundingTime?new Date(nextFundingTime).toLocaleString():"Unavailable"],
                ["Est. next funding", fundingSource?`${estimatedFunding>=0?"Receive":"Pay"} ${money(Math.abs(estimatedFunding))}`:"Unavailable"],
                ["Funding source", fundingSource??"Unavailable"],
                ["Risk amount", money(riskAmount)],
                ["Estimated liquidation", Number.isFinite(liquidation)?money(liquidation):"—"],
                ["Bankruptcy price", Number.isFinite(bankruptcy)?money(bankruptcy):"—"],
                ["Liquidation buffer", liquidationAudit?money(liquidationAudit.liquidationToBankruptcyDistance):"—"],
                ["Reward / risk", rewardRisk?`${rewardRisk.toFixed(2)}×`:"—"],
                ["Remaining equity", money(remaining)],
              ].map(([label, value]) => (
                <span key={label}>
                  <small>{label}</small>
                  <b>{value}</b>
                </span>
              ))}
            </div>
            <div className={styles.warnings}>
              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}
              {contractVolumeIssue?<span>{contractVolumeIssue}; requested size cannot be opened.</span>:null}
              {riskTierIssue?<span>{riskTierIssue}</span>:null}
              {riskTierPreview?.source==="mexc-public-contract-flat-fallback"?<span>Public tier increment fields are unavailable; this order uses the explicit flat contract MMR fallback.</span>:null}
              {invalidPriceStep&&contract?<span>Stop loss and take profit must use {contract.priceUnit} price increments.</span>:null}
              {depthPreview?.fillStatus==="partial"?<span>Visible depth fills {depthPreview.filledContractVolume} of {depthPreview.requestedContractVolume} requested contracts; the remainder is not invented.</span>:null}
              {!depth?<span>Depth preview is not warm; a fresh DizyFlow book is required and captured on submit.</span>:null}
              {position?.pendingRiskExit?<span>{`${position.pendingRiskExit.reason.toUpperCase()} triggered at ${money(position.pendingRiskExit.triggerPrice)}; the residual exit remains active until fresh visible depth can execute it.`}</span>:null}
              <span>Entries, manual exits, Reverse and Flatten All walk visible public depth. Triggered stop, target and liquidation exits persist and retry against fresh depth; unfilled residuals are never invented away.</span>
              <span>Immediate Manual Paper actions assume market execution and taker liquidity. Public fee rates do not include account-specific discounts or promotions.</span>
              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}
              {fundingSource?<span>Funding uses public settled rates with the observed {riskState?.source??position?.riskPriceSource??"risk"} price as an explicit notional approximation.</span>:null}
              {marginMode==="cross"?<span>Cross collateral is a simulator approximation, not MEXC-exact.</span>:null}
              {riskState?.source!=="fair"?<span>Fair price unavailable — explicit Last-price fallback{riskState?.stale?" (last valid mark preserved)":""}.</span>:null}
              <span>Fees and slippage are assumptions. No profit prediction or financial advice.</span>
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
            {captureWarning?<p role="status">Retained capture · {captureWarning}</p>:null}{captureError?<p className={styles.error} role="status">{captureError} <button type="button" onClick={()=>void uploadCapture(retryManager.current??captureManager.current)}>Retry flow retention</button></p>:null}
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
                        "Mode / Est. liq.",
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
                          <span>{p.marginMode}<small>Tier {p.riskTier?.level??"legacy"} · MMR {p.riskTier?`${(p.riskTier.maintenanceMarginRate*100).toFixed(3)}%`:"legacy"}</small><small>Liquidation {money(p.estimatedLiquidation)} · bankruptcy {p.bankruptcyPrice==null?"—":money(p.bankruptcyPrice)}</small>{p.pendingRiskExit?<small>{`${p.pendingRiskExit.reason.toUpperCase()} triggered · ${money(p.pendingRiskExit.triggerPrice)} · awaiting visible depth`}</small>:null}</span>
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
                            {p.symbol===symbol&&exitDepthPreview?<small>{`Exit depth ${exitDepthPreview.fillStatus} · ${exitDepthPreview.filledContractVolume}/${exitDepthPreview.requestedContractVolume} contracts · ${exitDepthPreview.levelsConsumed} levels · ${exitDepthPreview.priceImpactBps.toFixed(2)} bps`}</small>:null}
                            {[25, 50, 75].map((percentage) => (
                              <button
                                key={percentage}
                                onClick={() =>
                                  void action("partial-close", { symbol:p.symbol, percentage })
                                }
                              >
                                Close {percentage}%
                              </button>
                            ))}
                            <button
                              className={styles.danger}
                              onClick={() => void action("flash-close",{symbol:p.symbol})}
                            >
                              Flash Close
                            </button>
                            <button onClick={() => void action("reverse",{symbol:p.symbol})}>
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
                          {fill.feeSource?<small>{`${fill.executionType??"market"} · ${fill.liquidityRole??"taker"} · ${((fill.feeRate??0)*100).toFixed(4)}% · ${fill.feeSource==="mexc-public-contract"?"MEXC public":"legacy fallback"} · fee ${money(fill.fee)}`}</small>:null}
                          {fill.entryDepthFill?<small>{`entry depth ${fill.entryDepthFill.fillStatus} · ${fill.entryDepthFill.filledContractVolume}/${fill.entryDepthFill.requestedContractVolume} contracts · ${fill.entryDepthFill.levelsConsumed} levels · ${fill.entryDepthFill.priceImpactBps.toFixed(2)} bps`}</small>:null}
                          {fill.exitDepthFill?<small>{`exit depth ${fill.exitDepthFill.fillStatus} · ${fill.exitDepthFill.filledContractVolume}/${fill.exitDepthFill.requestedContractVolume} contracts · remaining ${fill.exitDepthFill.remainingPositionContractVolume??0} · ${fill.exitDepthFill.levelsConsumed} levels · ${fill.exitDepthFill.priceImpactBps.toFixed(2)} bps`}</small>:null}
                          {fill.reduceOnly?<small>{`reduce-only ${fill.reduceOnly.source} · requested ${fill.reduceOnly.requestedQuantity} · filled ${fill.reduceOnly.filledQuantity} · remaining ${fill.reduceOnly.remainingQuantity}${fill.reduceOnly.capped?" · capped":""}`}</small>:null}
                          {fill.riskTier?<small>{`risk tier ${fill.riskTier.level} · MMR ${(fill.riskTier.maintenanceMarginRate*100).toFixed(3)}% · ${fill.riskTier.source} · liq ${fill.liquidationAudit?money(fill.liquidationAudit.estimatedLiquidation):"—"} · bankruptcy ${fill.bankruptcyPrice==null?"—":money(fill.bankruptcyPrice)}`}</small>:null}
                          {fill.riskExitTrigger?<small>{`${fill.riskExitTrigger.reason} triggered ${new Date(fill.riskExitTrigger.triggeredAt).toLocaleString()} at ${money(fill.riskExitTrigger.triggerPrice)} · ${fill.riskExitTrigger.priceSource}`}</small>:null}
                          {fill.closeReason?<small>{fill.closeReason}</small>:null}
                          {fill.side==="close"?<small>{fill.historicalDizyFlow?.available?`${fill.historicalDizyFlow.limitations.length?"Limited":"Retained"} flow · ${fill.historicalDizyFlow.sampleCount} samples · ${fill.historicalDizyFlow.coveragePct??0}% coverage`:"Flow memory unavailable"}</small>:null}
                        </span>
                      </div>
                    ))
                )}
              </div>
            ) : (
              <div className={styles.summary}>
                {[
                  ["Starting balance", money(account?.startingBalance ?? 0)],
                  ["Cash balance", money(account?.cashBalance ?? 0)],
                  ["Funding P/L", money(account?.fundingPnl ?? 0)],
                  ["Last funding", lastFundingPayment?`${lastFundingPayment.cashDelta>=0?"Received":"Paid"} ${money(Math.abs(lastFundingPayment.cashDelta))} · ${lastFundingPayment.source}`:"None"],
                  ["Available balance", money(summary.availableBalance)],
                  ["Used margin", money(summary.usedMargin)],
                  ["Unrealised P/L", money(summary.unrealised)],
                  ["Equity", money(equity)],
                  ["Margin ratio / health", `${Number.isFinite(summary.marginRatio)?(summary.marginRatio*100).toFixed(2):"∞"}%`],
                  ["Active exposure", money(positions.reduce((sum,p)=>sum+p.quantity*p.entryPrice,0))],
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
