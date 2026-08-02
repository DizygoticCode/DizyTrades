"use client";

import { useEffect, useMemo, useState } from "react";
import type { PerformanceBucket, PerformanceDashboard, PerformanceCurvePoint } from "../lib/performance-dashboard";
import styles from "./performance.module.css";

const number=(value:number|null,digits=2)=>value===null?"Unavailable":value.toLocaleString(undefined,{maximumFractionDigits:digits});
const money=(value:number|null)=>value===null?"Unavailable":`${value>=0?"+":""}${number(value)} USDT`;
const pct=(value:number|null)=>value===null?"Unavailable":`${number(value)}%`;
const ratio=(value:number|null)=>value===null?"Unavailable":number(value);
const duration=(minutes:number|null)=>minutes===null?"Unavailable":minutes<60?`${number(minutes,0)} min`:minutes<1440?`${number(minutes/60,1)} hr`:`${number(minutes/1440,1)} days`;
const sample=(level:string)=>level==="very-small"?"Very small":level==="limited"?"Limited":level==="unavailable"?"Unavailable":"Larger";

function curveGeometry(points:readonly PerformanceCurvePoint[],width=920,height=280){
  if(!points.length)return {path:"",zeroY:height/2,min:0,max:0,coordinates:[] as {x:number;y:number;point:PerformanceCurvePoint}[]};
  const values=[0,...points.map(point=>point.cumulativePnl)],min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1),padding=20;
  const x=(index:number)=>padding+(points.length===1?0:index/(points.length-1))*(width-padding*2),y=(value:number)=>padding+(max-value)/range*(height-padding*2);
  const coordinates=points.map((point,index)=>({x:x(index),y:y(point.cumulativePnl),point}));
  return {path:coordinates.map((point,index)=>`${index?"L":"M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),zeroY:y(0),min,max,coordinates};
}

function PerformanceCurve({points}:{points:readonly PerformanceCurvePoint[]}){
  const geometry=useMemo(()=>curveGeometry(points),[points]);
  if(!points.length)return <div className={styles.empty}>No realised reviewed trades are available for the curve.</div>;
  return <div className={styles.chartWrap}><svg aria-label="Cumulative realised Journal PnL curve" role="img" viewBox="0 0 920 280" preserveAspectRatio="none"><line className={styles.zero} x1="20" x2="900" y1={geometry.zeroY} y2={geometry.zeroY}/><path className={styles.curve} d={geometry.path}/>{geometry.coordinates.map(({x,y,point})=><circle className={point.pnl>=0?styles.winPoint:styles.lossPoint} cx={x} cy={y} key={point.tradeId} r="3"><title>{`${point.symbol} · ${new Date(point.closeTime).toLocaleString()} · ${money(point.pnl)} · cumulative ${money(point.cumulativePnl)}`}</title></circle>)}</svg><div className={styles.chartAxis}><span>{money(geometry.max)}</span><span>{points.length} reviewed trades</span><span>{money(geometry.min)}</span></div></div>;
}

function BreakdownTable({rows}:{rows:readonly PerformanceBucket[]}){
  return <div className={styles.tableWrap}><table><thead><tr><th>Group</th><th>Trades</th><th>W / L / F</th><th>Win rate</th><th>Net PnL</th><th>Average</th><th>Profit factor</th><th>Average R</th><th>Sample</th></tr></thead><tbody>{rows.map(row=><tr key={row.key}><th>{row.label}</th><td>{row.trades}</td><td>{row.wins} / {row.losses} / {row.flat}</td><td>{pct(row.winRatePct)}</td><td className={row.netPnl>=0?styles.positive:styles.negative}>{money(row.netPnl)}</td><td>{money(row.averagePnl)}</td><td>{ratio(row.profitFactor)}</td><td>{row.averageR===null?"Unavailable":`${number(row.averageR)} (${row.rSampleSize})`}</td><td><span className={`${styles.sample} ${styles[row.sampleLevel]}`}>{sample(row.sampleLevel)}</span></td></tr>)}</tbody></table></div>;
}

export default function PerformanceClient({userName}:{userName:string}){
  const [data,setData]=useState<PerformanceDashboard|null>(null),[archived,setArchived]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[breakdown,setBreakdown]=useState<"symbol"|"timeframe"|"direction"|"exit">("symbol");
  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>{setLoading(true);setError("");void fetch(`/api/performance?archived=${archived}`,{signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error?.message??"Performance could not be loaded.");setData(body.performance);}).catch(reason=>{if((reason as Error).name!=="AbortError")setError((reason as Error).message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},0);return()=>{window.clearTimeout(timer);controller.abort();};},[archived]);
  const rows=data?(breakdown==="symbol"?data.bySymbol:breakdown==="timeframe"?data.byTimeframe:breakdown==="direction"?data.byDirection:data.byCloseReason):[];
  const cards=data?[
    ["Reviewed trades",String(data.reviewedTrades),`${data.wins} wins · ${data.losses} losses · ${data.flat} flat`],
    ["Net realised PnL",money(data.netPnl),data.currencyLabel],
    ["Win rate",pct(data.winRatePct),"Outcome frequency, not trade quality"],
    ["Expectancy",money(data.expectancy),"Average realised PnL per reviewed trade"],
    ["Profit factor",ratio(data.profitFactor),"Gross profit ÷ gross loss"],
    ["Payoff ratio",ratio(data.payoffRatio),"Average win ÷ absolute average loss"],
    ["Maximum drawdown",money(-data.maximumDrawdown),"Peak-to-trough on cumulative reviewed PnL"],
    ["Average R",data.averageR===null?"Unavailable":number(data.averageR),`${data.rSampleSize} recorded R samples`],
    ["Average holding time",duration(data.averageHoldingMinutes),`${data.holdingSampleSize} valid durations`],
    ["Recorded fees",money(-data.totalFees),`${pct(data.feeCoveragePct)} coverage`],
    ["Longest win streak",String(data.maximumWinStreak),"Consecutive positive reviewed trades"],
    ["Longest loss streak",String(data.maximumLossStreak),"Consecutive negative reviewed trades"],
  ]:[];
  return <main className={styles.shell}><header className={styles.topbar}><div><b>DizyTrades</b><span>DizyPerformance</span></div><nav><a href="/terminal">DizyCharts</a><a href="/scanner">DizyScanner</a><a href="/journal">DizyJournal</a><strong>{userName}</strong></nav></header>
    <section className={styles.hero}><div><span>REALISED REVIEW PERFORMANCE</span><h1>Measure outcomes without confusing them with decision quality.</h1><p>Built from immutable completed-trade facts in DizyJournal. Unjournalled trades, deposits, withdrawals and unrealised PnL are outside this view.</p></div><label><input type="checkbox" checked={archived} onChange={event=>setArchived(event.target.checked)}/> Include archived Trade Reviews</label></section>
    {loading&&!data?<section className={styles.state}>Loading performance dashboard…</section>:error?<section className={styles.state} role="alert">{error}</section>:data?<>
      <section className={styles.warnings}>{data.warnings.map(warning=><p key={warning.code}><b>{warning.code.replaceAll("_"," ")}</b>{warning.message}</p>)}</section>
      <section className={styles.cards}>{cards.map(([label,value,help])=><article key={label}><span>{label}</span><strong>{value}</strong><small>{help}</small></article>)}</section>
      <section className={styles.panel}><header><div><h2>Cumulative realised Journal PnL</h2><p>Ordered by authoritative trade close time. This is not account equity.</p></div><div><b>Gross profit {money(data.grossProfit)}</b><b>Gross loss {money(-data.grossLoss)}</b></div></header><PerformanceCurve points={data.curve}/></section>
      <section className={styles.grid}><article className={styles.panel}><header><div><h2>R-multiple distribution</h2><p>{data.rSampleSize} trades with recorded initial-risk multiples · median {data.medianR===null?"unavailable":number(data.medianR)}R</p></div></header><div className={styles.bars}>{data.rDistribution.map(bucket=><div key={bucket.key}><span>{bucket.label}</span><i><em style={{width:`${bucket.percentage}%`}}/></i><b>{bucket.trades} · {pct(bucket.percentage)}</b></div>)}</div></article><article className={styles.panel}><header><div><h2>Outcome structure</h2><p>Realised money results only; process assessment remains in Journal and Behaviour.</p></div></header><dl className={styles.metrics}><div><dt>Average win</dt><dd>{money(data.averageWin)}</dd></div><div><dt>Average loss</dt><dd>{money(data.averageLoss)}</dd></div><div><dt>Gross profit</dt><dd>{money(data.grossProfit)}</dd></div><div><dt>Gross loss</dt><dd>{money(-data.grossLoss)}</dd></div><div><dt>Fee sample</dt><dd>{data.feeSampleSize} / {data.reviewedTrades}</dd></div><div><dt>Generated</dt><dd>{new Date(data.generatedAt).toLocaleString()}</dd></div></dl></article></section>
      <section className={styles.panel}><header className={styles.breakdownHeader}><div><h2>Performance breakdown</h2><p>Small samples remain explicitly labelled.</p></div><nav>{([['symbol','Symbol'],['timeframe','Timeframe'],['direction','Direction'],['exit','Exit reason']] as const).map(([key,label])=><button aria-pressed={breakdown===key} onClick={()=>setBreakdown(key)} key={key}>{label}</button>)}</nav></header>{rows.length?<BreakdownTable rows={rows}/>:<div className={styles.empty}>No breakdown data is available.</div>}</section>
    </>:null}
  </main>;
}
