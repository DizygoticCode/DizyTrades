"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JournalEntry } from "../lib/journal-model";
import {
  emptyGuidedTradeReview,
  extractGuidedTradeReview,
  guidedTradeReviewCompletion,
  renderGuidedTradeReview,
  upsertGuidedTradeReviewNotes,
  type GuidedTradeReviewDraft,
} from "../lib/guided-trade-review";
import styles from "./guided-trade-review.module.css";

const stages = [
  ["Context", "Describe the market immediately before entry.", [["context", "What was the market doing before entry?"]]],
  ["Entry", "Record only evidence genuinely available at entry.", [["entryEvidence", "What evidence justified the entry?"]]],
  ["Management", "Review whether the thesis remained valid.", [["management", "How did the thesis or management change?"]]],
  ["Exit", "Separate exit evidence from the outcome.", [["exit", "Why did you exit, and what evidence existed then?"]]],
  ["Reflection", "Finish with behaviour you can repeat or improve.", [["strength", "One thing done well"], ["improvement", "One thing to improve"], ["repeatRule", "One rule to repeat next time"]]],
] as const;

const selectedId = () => new URLSearchParams(window.location.search).get("entry");

async function fetchEntry(id: string, signal?: AbortSignal) {
  const response = await fetch(`/api/journal/${encodeURIComponent(id)}`, { signal });
  const body = await response.json() as {entry?: JournalEntry; error?: {message?: string}};
  if (!response.ok || !body.entry) throw new Error(body.error?.message ?? "Trade Review could not be loaded.");
  return body.entry;
}

function replayHref(entry: JournalEntry) {
  const replay = entry.trade?.replay;
  if (!replay?.available) return null;
  const params = new URLSearchParams({
    replayMarketKey: replay.marketKey,
    replaySymbol: replay.symbol,
    replayTimeframe: replay.timeframe,
    replayAt: String(replay.entryTimeMs),
    journalEntry: entry.id,
  });
  if (replay.memoryId) params.set("replayMemory", replay.memoryId);
  if (entry.trade?.historicalDizyFlow.memoryId) {
    params.set("replayFlowMemory", entry.trade.historicalDizyFlow.memoryId);
    params.set("replayTrade", entry.trade.tradeId);
  }
  return `/terminal?${params.toString()}`;
}

export default function GuidedReviewDock({readOnly}:{readOnly:boolean}) {
  const [entryId,setEntryId]=useState<string|null>(null);
  const [entry,setEntry]=useState<JournalEntry|null>(null);
  const [draft,setDraft]=useState<GuidedTradeReviewDraft>(emptyGuidedTradeReview);
  const [stage,setStage]=useState(0);
  const [status,setStatus]=useState<"idle"|"loading"|"saving"|"failed">("idle");
  const [message,setMessage]=useState("");
  const dialog=useRef<HTMLDialogElement>(null),launcher=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    const sync=()=>{
      const next=selectedId();
      setEntryId(next);
      if(!next){setEntry(null);dialog.current?.close();}
    };
    const initial=window.setTimeout(sync,0);
    const timer=window.setInterval(sync,350);
    window.addEventListener("popstate",sync);
    return()=>{window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener("popstate",sync);};
  },[]);

  useEffect(()=>{
    if(!entryId)return;
    const controller=new AbortController();
    void fetchEntry(entryId,controller.signal).then(value=>{
      if(value.type!=="trade-review"||!value.trade){setEntry(null);return;}
      setEntry(value);
      setDraft(extractGuidedTradeReview(value.notes)??emptyGuidedTradeReview());
      setStage(0);
      setMessage("");
      setStatus("idle");
    }).catch(reason=>{
      if((reason as Error).name!=="AbortError"){
        setEntry(null);setMessage((reason as Error).message);setStatus("failed");
      }
    });
    return()=>controller.abort();
  },[entryId]);

  const active=entry?.id===entryId?entry:null;
  const completion=useMemo(()=>guidedTradeReviewCompletion(draft),[draft]);
  const current=stages[stage];

  async function open(){
    if(!entryId)return;
    setStatus("loading");setMessage("Refreshing the selected Trade Review…");
    try{
      const latest=await fetchEntry(entryId);
      if(latest.type!=="trade-review"||!latest.trade)throw new Error("Select a Trade Review first.");
      setEntry(latest);setDraft(extractGuidedTradeReview(latest.notes)??emptyGuidedTradeReview());setStage(0);setMessage("");setStatus("idle");dialog.current?.showModal();
    }catch(reason){setMessage((reason as Error).message);setStatus("failed");}
  }

  function close(){dialog.current?.close();launcher.current?.focus();}

  async function save(){
    if(!entryId||!active?.trade||readOnly||status==="saving")return;
    if(document.querySelector(".save-state.unsaved, .save-state.saving")){
      setMessage("Save or discard the main Journal editor changes before saving this guided review.");return;
    }
    setStatus("saving");setMessage("Saving guided review into this Journal entry…");
    try{
      const latest=await fetchEntry(entryId);
      if(!latest.trade||latest.trade.tradeId!==active.trade.tradeId)throw new Error("The selected trade changed. Reopen the guided review.");
      const block=renderGuidedTradeReview(draft,{
        tradeId:latest.trade.tradeId,symbol:latest.trade.symbol,timeframe:latest.trade.timeframe,direction:latest.trade.direction,
        pnlPct:latest.trade.pnlPct,closeReason:latest.trade.closeReason,replayAvailable:Boolean(latest.trade.replay?.available),
        historicalFlowAvailable:latest.trade.historicalDizyFlow.available,dizyBrainReviewAvailable:latest.trade.dizyBrainReview.available,
      });
      const tags=latest.tags.some(tag=>tag.toLowerCase()==="guided-review")||latest.tags.length>=20?latest.tags:[...latest.tags,"guided-review"];
      const response=await fetch(`/api/journal/${encodeURIComponent(entryId)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({notes:upsertGuidedTradeReviewNotes(latest.notes,block),tags})});
      const body=await response.json() as {entry?:JournalEntry;error?:{message?:string}};
      if(!response.ok||!body.entry)throw new Error(body.error?.message??"Guided review could not be saved.");
      setEntry(body.entry);setDraft(extractGuidedTradeReview(body.entry.notes)??draft);setStatus("idle");setMessage("Guided review saved. Refreshing the Journal entry…");
      window.setTimeout(()=>window.location.reload(),450);
    }catch(reason){setStatus("failed");setMessage((reason as Error).message);}
  }

  if(!entryId||(!active&&status!=="loading"))return null;
  const trade=active?.trade;
  const href=active?replayHref(active):null;
  const evidence=trade?[["Replay",Boolean(trade.replay?.available)],["Historical DizyFlow",trade.historicalDizyFlow.available],["DizyBrain Review",trade.dizyBrainReview.available]] as const:[];

  return <>
    <button className={styles.launcher} disabled={!active||status==="loading"} onClick={()=>void open()} ref={launcher} type="button"><span>GUIDED REVIEW</span><b>{active?`${completion.completed}/${completion.total}`:"Loading…"}</b></button>
    <dialog className={styles.dialog} onClose={()=>launcher.current?.focus()} ref={dialog}>{active&&trade?<div className={styles.shell}>
      <header className={styles.header}><div><span>DIZYJOURNAL · HISTORICAL REVIEW</span><h2>{trade.symbol} · {trade.direction}</h2><p>{trade.timeframe} · {trade.pnlPct>=0?"+":""}{trade.pnlPct.toFixed(2)}% · {trade.closeReason}</p></div><button aria-label="Close guided review" onClick={close} type="button">×</button></header>
      <section className={styles.evidence} aria-label="Historical evidence availability">{evidence.map(([label,available])=><span className={available?styles.available:styles.unavailable} key={label}>{available?"✓":"—"} {label}</span>)}{href?<a href={href}>Open Replay ↗</a>:<small>Replay unavailable for this trade.</small>}</section>
      <div className={styles.progressRow}><progress max={completion.total} value={completion.completed}/><span>{completion.percentage}% complete</span></div>
      <nav className={styles.steps} aria-label="Guided review stages">{stages.map((item,index)=><button aria-current={stage===index?"step":undefined} className={stage===index?styles.activeStep:""} key={item[0]} onClick={()=>setStage(index)} type="button"><b>{index+1}</b><span>{item[0]}</span></button>)}</nav>
      <section className={styles.stage} aria-labelledby={`guided-stage-${stage}`}><span>Stage {stage+1} of {stages.length}</span><h3 id={`guided-stage-${stage}`}>{current[0]}</h3><p>{current[1]}</p>{current[2].map(([key,label])=><label key={key}>{label}<textarea disabled={readOnly} maxLength={4000} onChange={event=>setDraft(value=>({...value,[key]:event.target.value}))} placeholder="Record what the retained evidence and your actual decision process show…" rows={["strength","improvement","repeatRule"].includes(key)?3:7} value={draft[key]}/></label>)}</section>
      <footer className={styles.footer}><div aria-live="polite" role={status==="failed"?"alert":"status"}>{message||(readOnly?"Viewer mode · saved reviews are read-only.":"No new score is created. Answers are saved in the existing Journal notes.")}</div><div><button disabled={stage===0} onClick={()=>setStage(value=>Math.max(0,value-1))} type="button">Previous</button>{stage<stages.length-1?<button onClick={()=>setStage(value=>Math.min(stages.length-1,value+1))} type="button">Next</button>:!readOnly?<button className={styles.primary} disabled={status==="saving"} onClick={()=>void save()} type="button">{status==="saving"?"Saving…":"Save to Journal"}</button>:null}</div></footer>
    </div>:null}</dialog>
  </>;
}
