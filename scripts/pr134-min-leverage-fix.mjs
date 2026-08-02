import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
};

const enginePath = "app/lib/manual-paper-engine.ts";
let engine = await readFile(enginePath, "utf8");
engine = replaceOnce(
  engine,
  "export function sizePaperPosition(input:{mode:PaperSizeMode;amount:number;leverage:number;equity:number;price:number;side:PaperSide;stopLoss?:number|null;maxLeverage?:number}){\n const {amount,leverage,equity,price}=input,maxLeverage=input.maxLeverage??20;if(!valid(amount)||!valid(leverage)||!valid(maxLeverage)||leverage>maxLeverage||!valid(equity)||!valid(price))throw new Error(\"INVALID_SIZING\");",
  "export function sizePaperPosition(input:{mode:PaperSizeMode;amount:number;leverage:number;equity:number;price:number;side:PaperSide;stopLoss?:number|null;minLeverage?:number;maxLeverage?:number}){\n const {amount,leverage,equity,price}=input,minLeverage=input.minLeverage??1,maxLeverage=input.maxLeverage??20;if(!valid(amount)||!valid(leverage)||!valid(minLeverage)||!valid(maxLeverage)||maxLeverage<minLeverage||leverage<minLeverage||leverage>maxLeverage||!valid(equity)||!valid(price))throw new Error(\"INVALID_SIZING\");",
  "engine leverage range",
);
await writeFile(enginePath, engine);

const serverPath = "app/lib/manual-paper.ts";
let server = await readFile(serverPath, "utf8");
server = replaceOnce(
  server,
  "export function calculateManualSizing(input:{sizeMode:ManualSizeMode;amount:unknown;leverage:unknown;side?:ManualSide;stopLoss?:unknown;maxLeverage?:unknown},equity:number,price:number){\n const maxLeverage=number(input.maxLeverage)??20,leverageValue=number(input.leverage);if(leverageValue===null||leverageValue<1||leverageValue>maxLeverage)fail(\"INVALID_LEVERAGE\",\"leverage\",`Leverage must be between 1× and ${maxLeverage}× for this contract.`);",
  "export function calculateManualSizing(input:{sizeMode:ManualSizeMode;amount:unknown;leverage:unknown;side?:ManualSide;stopLoss?:unknown;minLeverage?:unknown;maxLeverage?:unknown},equity:number,price:number){\n const minLeverage=number(input.minLeverage)??1,maxLeverage=number(input.maxLeverage)??20,leverageValue=number(input.leverage);if(minLeverage<1||maxLeverage<minLeverage)fail(\"INVALID_LEVERAGE\",\"leverage\",\"Invalid contract leverage range.\");if(leverageValue===null||leverageValue<minLeverage||leverageValue>maxLeverage)fail(\"INVALID_LEVERAGE\",\"leverage\",`Leverage must be between ${minLeverage}× and ${maxLeverage}× for this contract.`);",
  "server leverage range",
);
server = replaceOnce(
  server,
  "stopLoss:number(input.stopLoss),maxLeverage});",
  "stopLoss:number(input.stopLoss),minLeverage,maxLeverage});",
  "engine range forwarding",
);
server = replaceOnce(
  server,
  "side:input.side,maxLeverage:contract?.maxLeverage??20},equity,marketPrice)",
  "side:input.side,minLeverage:contract?.minLeverage??1,maxLeverage:contract?.maxLeverage??20},equity,marketPrice)",
  "contract range forwarding",
);
await writeFile(serverPath, server);

const testPath = "tests/manual-paper-engine.test.mjs";
let tests = await readFile(testPath, "utf8");
tests = replaceOnce(
  tests,
  'test("symbol-specific leverage ceilings are enforced",()=>{assert.equal(sizePaperPosition({mode:"fixed-margin",amount:1,leverage:1000,maxLeverage:1000,equity:100,price:100,side:"long"}).notional,1000);assert.throws(()=>sizePaperPosition({mode:"fixed-margin",amount:1,leverage:1001,maxLeverage:1000,equity:100,price:100,side:"long"}),/INVALID_SIZING/)});',
  'test("symbol-specific leverage ranges are enforced",()=>{assert.equal(sizePaperPosition({mode:"fixed-margin",amount:1,leverage:1000,minLeverage:5,maxLeverage:1000,equity:100,price:100,side:"long"}).notional,1000);assert.throws(()=>sizePaperPosition({mode:"fixed-margin",amount:1,leverage:4,minLeverage:5,maxLeverage:1000,equity:100,price:100,side:"long"}),/INVALID_SIZING/);assert.throws(()=>sizePaperPosition({mode:"fixed-margin",amount:1,leverage:1001,minLeverage:5,maxLeverage:1000,equity:100,price:100,side:"long"}),/INVALID_SIZING/)});',
  "engine range test",
);
await writeFile(testPath, tests);
