import { replace } from './utils.mjs';

await replace(
  'app/manual-paper-ticket.tsx',
  'import { HistoricalDizyFlowEventAdapter } from "./lib/historical-dizyflow-events";\n',
  'import { HistoricalDizyFlowEventAdapter } from "./lib/historical-dizyflow-events";\nimport {clampContractLeverage,leverageStopsForContract,type MexcContractMetadata} from "./lib/mexc-contract-metadata";\n',
);
await replace('app/manual-paper-ticket.tsx', 'const leverageStops = [1, 2, 3, 5, 10, 20];\n', '');
await replace(
  'app/manual-paper-ticket.tsx',
  '  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null);',
  '  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null),[contract,setContract]=useState<MexcContractMetadata|null>(null);',
);
await replace(
  'app/manual-paper-ticket.tsx',
  '{const payload=(await response.json()) as { account: Account;riskPrice?:{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null };setAccount(payload.account);setRiskState(payload.riskPrice??null)}',
  '{const payload=(await response.json()) as { account: Account;riskPrice?:{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null;contract?:MexcContractMetadata|null };setAccount(payload.account);setRiskState(payload.riskPrice??null);setContract(payload.contract??null)}',
);
await replace(
  'app/manual-paper-ticket.tsx',
  '  useEffect(()=>{if(!account?.positions[symbol])return;const timer=window.setInterval(()=>void load(),5000);return()=>window.clearInterval(timer)},[account?.positions,symbol,load]);',
  '  useEffect(()=>{if(!account?.positions[symbol])return;const timer=window.setInterval(()=>void load(),5000);return()=>window.clearInterval(timer)},[account?.positions,symbol,load]);\n  useEffect(()=>{if(!contract)return;/* eslint-disable-next-line react-hooks/set-state-in-effect -- clamp persisted leverage to current public contract rules */setLeverage(current=>String(clampContractLeverage(Number(current),contract)))},[contract]);',
);
await replace(
  'app/manual-paper-ticket.tsx',
  '        data = (await response.json()) as { account?: Account; error?: string };\n      if (!response.ok)\n        throw new Error(data.error || "Manual Paper request failed");',
  '        data = (await response.json()) as { account?: Account; error?: string|{message?:string} };\n      if (!response.ok)\n        throw new Error(typeof data.error==="string"?data.error:data.error?.message||"Manual Paper request failed");',
);
await replace(
  'app/manual-paper-ticket.tsx',
  '    leverageNumber = Math.max(1, Number(leverage) || 1),',
  '    leverageNumber = contract?clampContractLeverage(Number(leverage),contract):Math.max(1,Number(leverage)||1),\n    leverageStops=leverageStopsForContract(contract),',
);
await replace(
  'app/manual-paper-ticket.tsx',
  '      invalidAmount;',
  '      invalidAmount ||\n      !contract;',
);
await replace(
  'app/manual-paper-ticket.tsx',
  `            <section>\n              <div className={styles.sectionTitle}>\n                <span>Leverage · simulator fallback range</span>\n                <b>{leverageNumber}×</b>\n              </div>\n              <div className={styles.leverages}>\n                {leverageStops.map((value) => (\n                  <button\n                    key={value}\n                    className={leverageNumber === value ? styles.active : ""}\n                    onClick={() => {\n                      setLeverage(String(value));\n                      if (sizePercent > 0)\n                        setAmount(\n                          String(\n                            sliderToAmount(sizePercent, equity, mode, value),\n                          ),\n                        );\n                    }}\n                  >\n                    {value}×\n                  </button>\n                ))}\n              </div>\n            </section>`,
  `            <section>\n              <div className={styles.sectionTitle}>\n                <span>{contract?\`Leverage · MEXC public range \${contract.minLeverage}–\${contract.maxLeverage}×\`:"Leverage · MEXC rules unavailable"}</span>\n                <b>{leverageNumber}×</b>\n              </div>\n              <label>\n                Selected leverage\n                <input type="number" min={contract?.minLeverage??1} max={contract?.maxLeverage??20} step="1" value={leverage} disabled={!contract} onChange={event=>{const value=contract?clampContractLeverage(Number(event.target.value),contract):1;setLeverage(String(value));if(sizePercent>0)setAmount(String(sliderToAmount(sizePercent,equity,mode,value)))}} />\n              </label>\n              <div className={styles.leverages}>\n                {leverageStops.map((value) => (\n                  <button\n                    key={value}\n                    className={leverageNumber === value ? styles.active : ""}\n                    disabled={!contract}\n                    onClick={() => {\n                      setLeverage(String(value));\n                      if (sizePercent > 0)\n                        setAmount(\n                          String(\n                            sliderToAmount(sizePercent, equity, mode, value),\n                          ),\n                        );\n                    }}\n                  >\n                    {value}×\n                  </button>\n                ))}\n              </div>\n            </section>`,
);
await replace(
  'app/manual-paper-ticket.tsx',
  '                ["Leverage", `${leverageNumber}×`],\n                ["Estimated fee", money(fee)],',
  '                ["Leverage", `${leverageNumber}×`],\n                ["MEXC contract range", contract?`${contract.minLeverage}–${contract.maxLeverage}×`:"Unavailable"],\n                ["Maintenance margin", contract?`${(contract.maintenanceMarginRate*100).toFixed(3)}%`:"Simulator fallback"],\n                ["Estimated fee", money(fee)],',
);
await replace(
  'app/manual-paper-ticket.tsx',
  '              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\n',
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\n              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\n',
);
