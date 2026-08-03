import { mkdir } from "node:fs/promises";
import { replaceExact, write } from "./utils.mjs";

await mkdir("app/lib", { recursive: true });
await mkdir("tests", { recursive: true });

await write(
  "app/lib/manual-paper-fees.ts",
  `import type { MexcContractMetadata } from "./mexc-contract-metadata";

export type PaperExecutionType = "market";
export type PaperLiquidityRole = "maker" | "taker";
export type PaperFeeSource = "mexc-public-contract" | "legacy-settings-fallback";

export type PaperFeeSnapshot = Readonly<{
  executionType: PaperExecutionType;
  liquidityRole: PaperLiquidityRole;
  feeRate: number;
  feeSource: PaperFeeSource;
  makerFeeRate: number;
  takerFeeRate: number;
}>;

const nonNegativeRate = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(\`Invalid paper \${field}.\`);
  return value;
};

export function mexcPublicMarketTakerFeeSnapshot(
  contract: MexcContractMetadata,
): PaperFeeSnapshot {
  return Object.freeze({
    executionType: "market",
    liquidityRole: "taker",
    feeRate: nonNegativeRate(contract.takerFeeRate, "taker fee rate"),
    feeSource: "mexc-public-contract",
    makerFeeRate: nonNegativeRate(contract.makerFeeRate, "maker fee rate"),
    takerFeeRate: nonNegativeRate(contract.takerFeeRate, "taker fee rate"),
  });
}

export function legacyMarketTakerFeeSnapshot(
  commissionPct: number,
  makerCommissionPct = commissionPct,
): PaperFeeSnapshot {
  const takerFeeRate = nonNegativeRate(commissionPct / 100, "legacy taker fee rate");
  return Object.freeze({
    executionType: "market",
    liquidityRole: "taker",
    feeRate: takerFeeRate,
    feeSource: "legacy-settings-fallback",
    makerFeeRate: nonNegativeRate(makerCommissionPct / 100, "legacy maker fee rate"),
    takerFeeRate,
  });
}

export function positionMarketTakerFeeSnapshot(
  position: Partial<PaperFeeSnapshot>,
  settings: { commissionPct: number; makerCommissionPct: number },
): PaperFeeSnapshot {
  if (
    position.executionType === "market" &&
    position.liquidityRole === "taker" &&
    position.feeSource === "mexc-public-contract" &&
    Number.isFinite(position.feeRate) &&
    Number.isFinite(position.makerFeeRate) &&
    Number.isFinite(position.takerFeeRate)
  ) {
    return Object.freeze({
      executionType: "market",
      liquidityRole: "taker",
      feeRate: nonNegativeRate(position.feeRate as number, "stored fee rate"),
      feeSource: "mexc-public-contract",
      makerFeeRate: nonNegativeRate(
        position.makerFeeRate as number,
        "stored maker fee rate",
      ),
      takerFeeRate: nonNegativeRate(
        position.takerFeeRate as number,
        "stored taker fee rate",
      ),
    });
  }
  return legacyMarketTakerFeeSnapshot(
    settings.commissionPct,
    settings.makerCommissionPct,
  );
}

export function paperExecutionFee(
  notional: number,
  snapshot: PaperFeeSnapshot,
  liquidationPenaltyRate = 0,
) {
  if (!Number.isFinite(notional) || notional < 0)
    throw new Error("Invalid paper execution notional.");
  const penaltyRate = nonNegativeRate(
    liquidationPenaltyRate,
    "liquidation penalty rate",
  );
  const tradingFee = notional * snapshot.feeRate;
  const liquidationPenalty = notional * penaltyRate;
  return Object.freeze({
    tradingFee,
    liquidationPenalty,
    totalFee: tradingFee + liquidationPenalty,
  });
}
`,
);

await replaceExact(
  "app/lib/manual-paper.ts",
  'import {isMexcStepAligned,parseMexcContractMetadata,quantizeMexcExecutionPrice,quantizeMexcStep,sizeMexcContractOrder,type MexcContractMetadata} from "./mexc-contract-metadata";\n',
  'import {isMexcStepAligned,parseMexcContractMetadata,quantizeMexcExecutionPrice,quantizeMexcStep,sizeMexcContractOrder,type MexcContractMetadata} from "./mexc-contract-metadata";\nimport {mexcPublicMarketTakerFeeSnapshot,paperExecutionFee,positionMarketTakerFeeSnapshot,type PaperExecutionType,type PaperFeeSource,type PaperLiquidityRole} from "./manual-paper-fees";\n',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'entryFee:number;riskPriceSource:RiskPriceSource;',
  'entryFee:number;executionType?:PaperExecutionType;liquidityRole?:PaperLiquidityRole;feeRate?:number;feeSource?:PaperFeeSource;makerFeeRate?:number;takerFeeRate?:number;riskPriceSource:RiskPriceSource;',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'entryFee?:number;exitFee?:number;fee:number;',
  'entryFee?:number;exitFee?:number;executionType?:PaperExecutionType;liquidityRole?:PaperLiquidityRole;feeRate?:number;feeSource?:PaperFeeSource;makerFeeRate?:number;takerFeeRate?:number;tradingFee?:number;liquidationPenalty?:number;fee:number;',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'const exits=validateExits(input.side,slipped,input.stopLoss,input.takeProfit,currentContract.priceUnit),fee=notional*account.settings.commissionPct/100;',
  'const exits=validateExits(input.side,slipped,input.stopLoss,input.takeProfit,currentContract.priceUnit),feeSnapshot=mexcPublicMarketTakerFeeSnapshot(currentContract),feeBreakdown=paperExecutionFee(notional,feeSnapshot),fee=feeBreakdown.totalFee;',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'estimatedLiquidation,entryFee:fee,riskPriceSource,lastRiskPrice:',
  'estimatedLiquidation,entryFee:fee,...feeSnapshot,riskPriceSource,lastRiskPrice:',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'estimatedLiquidation,riskPriceSource,entryFee:fee,fee,timestamp,realisedPnl:',
  'estimatedLiquidation,riskPriceSource,entryFee:fee,...feeSnapshot,tradingFee:feeBreakdown.tradingFee,liquidationPenalty:feeBreakdown.liquidationPenalty,fee,timestamp,realisedPnl:',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'notional=position.quantity*slipped,baseFee=notional*account.settings.commissionPct/100,penalty=closeReason==="liquidation"?notional*account.settings.liquidationPenaltyPct/100:0,fee=baseFee+penalty,pnl=',
  'notional=position.quantity*slipped,feeSnapshot=positionMarketTakerFeeSnapshot(position,account.settings),feeBreakdown=paperExecutionFee(notional,feeSnapshot,closeReason==="liquidation"?account.settings.liquidationPenaltyPct/100:0),baseFee=feeBreakdown.tradingFee,penalty=feeBreakdown.liquidationPenalty,fee=feeBreakdown.totalFee,pnl=',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'entryFee:position.entryFee,exitFee:fee,fee,timestamp,openedAt:',
  'entryFee:position.entryFee,exitFee:fee,...feeSnapshot,tradingFee:baseFee,liquidationPenalty:penalty,fee,timestamp,openedAt:',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'notional=closeQuantity*slipped,fee=notional*account.settings.commissionPct/100,pnl=',
  'notional=closeQuantity*slipped,feeSnapshot=positionMarketTakerFeeSnapshot(position,account.settings),feeBreakdown=paperExecutionFee(notional,feeSnapshot),fee=feeBreakdown.totalFee,pnl=',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'notional,fee,timestamp,openedAt:position.openedAt,closeReason:',
  'notional,...feeSnapshot,tradingFee:feeBreakdown.tradingFee,liquidationPenalty:feeBreakdown.liquidationPenalty,fee,timestamp,openedAt:position.openedAt,closeReason:',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'account.positions[symbol]={...position,quantity:Number((position.quantity-closeQuantity).toPrecision(15)),contractVolume:',
  'account.positions[symbol]={...position,...feeSnapshot,quantity:Number((position.quantity-closeQuantity).toPrecision(15)),contractVolume:',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'closeNotional=old.quantity*closePrice,openNotional=old.quantity*openPrice,closeFee=closeNotional*account.settings.commissionPct/100,openFee=openNotional*account.settings.commissionPct/100,pnl=',
  'closeNotional=old.quantity*closePrice,openNotional=old.quantity*openPrice,feeSnapshot=positionMarketTakerFeeSnapshot(old,account.settings),closeFeeBreakdown=paperExecutionFee(closeNotional,feeSnapshot),openFeeBreakdown=paperExecutionFee(openNotional,feeSnapshot),closeFee=closeFeeBreakdown.totalFee,openFee=openFeeBreakdown.totalFee,pnl=',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'notional:closeNotional,fee:closeFee,timestamp,openedAt:',
  'notional:closeNotional,...feeSnapshot,tradingFee:closeFeeBreakdown.tradingFee,liquidationPenalty:closeFeeBreakdown.liquidationPenalty,fee:closeFee,timestamp,openedAt:',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'notional:openNotional,fee:openFee,timestamp,realisedPnl:',
  'notional:openNotional,...feeSnapshot,tradingFee:openFeeBreakdown.tradingFee,liquidationPenalty:openFeeBreakdown.liquidationPenalty,fee:openFee,timestamp,realisedPnl:',
);
await replaceExact(
  "app/lib/manual-paper.ts",
  'account.positions[symbol]={...old,tradeId,side:openSide,entryPrice:',
  'account.positions[symbol]={...old,...feeSnapshot,tradeId,side:openSide,entryPrice:',
);

await replaceExact(
  "app/lib/manual-paper-backup.ts",
  '    entryFee: number(input.entryFee, "manualPaper.position.entryFee", 0),\n    riskPriceSource: oneOf(',
  '    entryFee: number(input.entryFee, "manualPaper.position.entryFee", 0),\n    executionType: input.executionType == null ? undefined : oneOf(input.executionType, "manualPaper.position.executionType", ["market"] as const),\n    liquidityRole: input.liquidityRole == null ? undefined : oneOf(input.liquidityRole, "manualPaper.position.liquidityRole", ["maker", "taker"] as const),\n    feeRate: input.feeRate == null ? undefined : number(input.feeRate, "manualPaper.position.feeRate", 0, 1),\n    feeSource: input.feeSource == null ? undefined : oneOf(input.feeSource, "manualPaper.position.feeSource", ["mexc-public-contract", "legacy-settings-fallback"] as const),\n    makerFeeRate: input.makerFeeRate == null ? undefined : number(input.makerFeeRate, "manualPaper.position.makerFeeRate", 0, 1),\n    takerFeeRate: input.takerFeeRate == null ? undefined : number(input.takerFeeRate, "manualPaper.position.takerFeeRate", 0, 1),\n    riskPriceSource: oneOf(',
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  '    exitFee:\n      input.exitFee == null\n        ? undefined\n        : number(input.exitFee, "manualPaper.fill.exitFee", 0),\n    fee: number(input.fee, "manualPaper.fill.fee", 0),',
  '    exitFee:\n      input.exitFee == null\n        ? undefined\n        : number(input.exitFee, "manualPaper.fill.exitFee", 0),\n    executionType: input.executionType == null ? undefined : oneOf(input.executionType, "manualPaper.fill.executionType", ["market"] as const),\n    liquidityRole: input.liquidityRole == null ? undefined : oneOf(input.liquidityRole, "manualPaper.fill.liquidityRole", ["maker", "taker"] as const),\n    feeRate: input.feeRate == null ? undefined : number(input.feeRate, "manualPaper.fill.feeRate", 0, 1),\n    feeSource: input.feeSource == null ? undefined : oneOf(input.feeSource, "manualPaper.fill.feeSource", ["mexc-public-contract", "legacy-settings-fallback"] as const),\n    makerFeeRate: input.makerFeeRate == null ? undefined : number(input.makerFeeRate, "manualPaper.fill.makerFeeRate", 0, 1),\n    takerFeeRate: input.takerFeeRate == null ? undefined : number(input.takerFeeRate, "manualPaper.fill.takerFeeRate", 0, 1),\n    tradingFee: input.tradingFee == null ? undefined : number(input.tradingFee, "manualPaper.fill.tradingFee", 0),\n    liquidationPenalty: input.liquidationPenalty == null ? undefined : number(input.liquidationPenalty, "manualPaper.fill.liquidationPenalty", 0),\n    fee: number(input.fee, "manualPaper.fill.fee", 0),',
);

await replaceExact(
  "app/manual-paper-ticket.tsx",
  '  estimatedLiquidation: number;\n  riskPriceSource:',
  '  estimatedLiquidation: number;\n  executionType?: "market";\n  liquidityRole?: "maker" | "taker";\n  feeRate?: number;\n  feeSource?: "mexc-public-contract" | "legacy-settings-fallback";\n  makerFeeRate?: number;\n  takerFeeRate?: number;\n  riskPriceSource:',
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '  fee: number;\n  realisedPnl:',
  '  fee: number;\n  executionType?: "market";\n  liquidityRole?: "maker" | "taker";\n  feeRate?: number;\n  feeSource?: "mexc-public-contract" | "legacy-settings-fallback";\n  makerFeeRate?: number;\n  takerFeeRate?: number;\n  tradingFee?: number;\n  liquidationPenalty?: number;\n  realisedPnl:',
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '    commissionPct: number;\n    slippagePct:',
  '    commissionPct: number;\n    makerCommissionPct: number;\n    slippagePct:',
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '    fee = Math.max(0,(notional * (account?.settings.commissionPct ?? 0)) / 100),\n    liquidation=',
  '    feeRate=contract?.takerFeeRate??(account?.settings.commissionPct??0)/100,\n    feeSource=contract?"MEXC public contract":"Legacy settings fallback",\n    fee = Math.max(0,notional*feeRate),\n    liquidation=',
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '                ["Maintenance margin", contract?`${(contract.maintenanceMarginRate*100).toFixed(3)}%`:"Simulator fallback"],\n                ["Estimated fee", money(fee)],',
  '                ["Maintenance margin", contract?`${(contract.maintenanceMarginRate*100).toFixed(3)}%`:"Simulator fallback"],\n                ["Execution assumption", "Market · taker"],\n                ["Taker fee rate", `${(feeRate*100).toFixed(4)}%`],\n                ["Maker reference", contract?`${(contract.makerFeeRate*100).toFixed(4)}%`:`${(account?.settings.makerCommissionPct??0).toFixed(4)}% fallback`],\n                ["Fee source", feeSource],\n                ["Estimated fee", money(fee)],',
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '                          {fill.closeReason?<small>{fill.closeReason}</small>:null}\n',
  '                          {fill.feeSource?<small>{`${fill.executionType??"market"} · ${fill.liquidityRole??"taker"} · ${((fill.feeRate??0)*100).toFixed(4)}% · ${fill.feeSource==="mexc-public-contract"?"MEXC public":"legacy fallback"} · fee ${money(fill.fee)}`}</small>:null}\n                          {fill.closeReason?<small>{fill.closeReason}</small>:null}\n',
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\n              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\n',
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\n              <span>Immediate Manual Paper actions assume market execution and taker liquidity. Public fee rates do not include account-specific discounts or promotions.</span>\n              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\n',
);

await replaceExact(
  "ROADMAP.md",
  '- [ ] maker versus taker execution assumptions\n',
  '- [x] maker versus taker execution assumptions with explicit fee provenance\n',
);
await replaceExact(
  "ROADMAP.md",
  'Current slice: maker/taker execution assumptions and fee provenance for simulated fills.\n',
  'Next slice: funding-payment modelling with explicit data provenance.\n',
);

await write(
  "tests/manual-paper-fees.test.mjs",
  `import test from "node:test";
import assert from "node:assert/strict";
import {
  legacyMarketTakerFeeSnapshot,
  mexcPublicMarketTakerFeeSnapshot,
  paperExecutionFee,
} from "../app/lib/manual-paper-fees.ts";

const contract = {
  symbol: "BTC_USDT",
  displayName: "BTCUSDT SWAP",
  contractSize: 0.001,
  minLeverage: 1,
  maxLeverage: 125,
  priceUnit: 0.1,
  volUnit: 1,
  minVol: 1,
  maxVol: 1_000_000,
  makerFeeRate: 0.0001,
  takerFeeRate: 0.0011,
  maintenanceMarginRate: 0.004,
  initialMarginRate: 0.008,
  positionOpenType: 3,
  riskLimitType: "BY_VOLUME",
};

test("public MEXC fee snapshots model immediate executions as taker fills", () => {
  const snapshot = mexcPublicMarketTakerFeeSnapshot(contract);
  assert.deepEqual(snapshot, {
    executionType: "market",
    liquidityRole: "taker",
    feeRate: 0.0011,
    feeSource: "mexc-public-contract",
    makerFeeRate: 0.0001,
    takerFeeRate: 0.0011,
  });
  assert.deepEqual(paperExecutionFee(1_000, snapshot, 0.001), {
    tradingFee: 1.1,
    liquidationPenalty: 1,
    totalFee: 2.1,
  });
});

test("legacy fee fallback remains explicit and separately labelled", () => {
  assert.deepEqual(legacyMarketTakerFeeSnapshot(0.06, 0.02), {
    executionType: "market",
    liquidityRole: "taker",
    feeRate: 0.0006,
    feeSource: "legacy-settings-fallback",
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  });
});

test("Manual Paper persists public fee provenance through open, partial close, reversal and backup", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const {
    closeManualPosition,
    partialCloseManualPosition,
    reverseManualPosition,
    submitManualOrder,
    updateManualSettings,
  } = await import("../app/lib/manual-paper.ts");
  const { validateManualPaperBackup } = await import(
    "../app/lib/manual-paper-backup.ts"
  );
  const previous = process.env.DATA_DIR;
  const root = await mkdtemp(join(tmpdir(), "dizy-paper-fees-"));
  process.env.DATA_DIR = root;
  try {
    let account = await submitManualOrder(
      "fee-owner",
      {
        idempotencyKey: "fee-open-public-0001",
        symbol: "BTC_USDT",
        side: "long",
        sizeMode: "fixed-notional",
        amount: 100,
        leverage: 10,
      },
      100,
      "fair",
      contract,
    );
    const entry = account.fills.at(-1);
    assert.equal(entry.executionType, "market");
    assert.equal(entry.liquidityRole, "taker");
    assert.equal(entry.feeSource, "mexc-public-contract");
    assert.equal(entry.feeRate, contract.takerFeeRate);
    assert.equal(entry.makerFeeRate, contract.makerFeeRate);
    assert.ok(Math.abs(entry.tradingFee - entry.notional * contract.takerFeeRate) < 1e-12);
    assert.equal(entry.liquidationPenalty, 0);
    assert.equal(account.positions.BTC_USDT.feeSource, "mexc-public-contract");

    await updateManualSettings("fee-owner", {
      commissionPct: 0.5,
      makerCommissionPct: 0.4,
    });
    account = await partialCloseManualPosition(
      "fee-owner",
      "BTC_USDT",
      "fee-partial-close-001",
      101,
      { percentage: 25 },
    );
    const partial = account.fills.at(-1);
    assert.equal(partial.feeSource, "mexc-public-contract");
    assert.equal(partial.feeRate, contract.takerFeeRate);
    assert.ok(Math.abs(partial.tradingFee - partial.notional * contract.takerFeeRate) < 1e-12);

    account = await reverseManualPosition(
      "fee-owner",
      "BTC_USDT",
      "fee-reverse-public-01",
      102,
    );
    const reverseFills = account.fills.slice(-2);
    assert.deepEqual(
      reverseFills.map((fill) => [fill.liquidityRole, fill.feeSource, fill.feeRate]),
      [
        ["taker", "mexc-public-contract", contract.takerFeeRate],
        ["taker", "mexc-public-contract", contract.takerFeeRate],
      ],
    );
    assert.equal(account.positions.BTC_USDT.feeSource, "mexc-public-contract");

    account = await closeManualPosition(
      "fee-owner",
      "BTC_USDT",
      "fee-final-close-0001",
      103,
    );
    const finalClose = account.fills.at(-1);
    assert.equal(finalClose.feeSource, "mexc-public-contract");
    assert.equal(finalClose.feeRate, contract.takerFeeRate);

    const restored = validateManualPaperBackup(account, "fee-owner");
    assert.equal(restored.fills.at(-1).feeSource, "mexc-public-contract");
    assert.equal(restored.fills.at(-1).tradingFee, finalClose.tradingFee);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
`,
);
