import {readFile,writeFile} from "node:fs/promises";
const once=(value,oldText,newText,label)=>{const count=value.split(oldText).length-1;if(count!==1)throw new Error(label+": "+count);return value.replace(oldText,newText)};
{
  const path="app/dizybrain-shell.tsx",source=await readFile(path,"utf8");
  let next=once(source,'  presentOverviewFlow,\n','  presentOverviewFlow,\n  buildDizyBrainBeginnerOverview,\n','overview helper import');
  next=once(next,'<BrainMark /><span><b>DizyBrain</b><small>Analysis Workspace</small></span>','<BrainMark /><span><b>DizyBrain</b><small>Explain this market</small></span>','launcher copy');
  next=once(next,'<strong>DIZY<span>BRAIN</span></strong><small>Analysis Workspace</small>','<strong>DIZY<span>BRAIN</span></strong><small>Market explanation</small>','header copy');
  next=once(next,'  const overviewFlow = presentOverviewFlow(data.replay, flow);\n','  const overviewFlow = presentOverviewFlow(data.replay, flow);\n  const beginnerOverview = buildDizyBrainBeginnerOverview(snapshot, data.replay);\n','overview model');
  const oldOverview=`  if (module === "overview") return <>
    <Disclosure title="Market" open><Row label="Identity" value={\`${data.symbol} · ${data.market}\`} /><Row label="Timeframe" value={data.timeframe} /><Row label="Feed" value={data.feedState} /></Disclosure>
    <Disclosure title="Signal" open><Row label="Classification" value={data.replay ? "Unavailable in historical Replay" : snapshot.currentDirection} /><Row label="Confluence" value={\`${snapshot.activeConfluence} / 5\`} /><Row label="Confirmed candle" value={snapshot.confirmedSignal ?? "No signal"} /></Disclosure>
    <Disclosure title="Flow">{data.replay ? <><Row label="Historical DizyFlow" value={data.historicalFlowState.status} /><Row label="Sample" value={historical?.sample ? stamp(historical.sample.timeMs) : "Unavailable"} /><Row label="Confidence" value={historical?.sample ? \`${historical.sample.intelligenceConfidence}% · ${historical.sample.confidenceBand}\` : "Unavailable"} /><Row label="Events this step" value={historical?.eventsAtStep.length??0} /></> : overviewFlow.hidden ? <p>{overviewFlow.message}</p> : <><Row label="Availability" value={overviewFlow.availability} /><Row label="Confidence" value={overviewFlow.confidence} /><Row label="Visible walls" value={overviewFlow.walls} /></>}</Disclosure>
    <Disclosure title="Position & Replay"><Row label="Manual Paper" value="Use authoritative ticket below chart" /><Row label="Mode" value={data.replay ? "Historical Replay" : "Live terminal"} /><Row label="Historical DizyFlow" value="Metadata only" /></Disclosure>
  </>;`;
  const newOverview=`  if (module === "overview") return <>
    <section className={"brain-overview-hero " + beginnerOverview.tone} data-testid="dizybrain-beginner-overview">
      <small>Current market read</small>
      <div className="brain-overview-state"><strong>{beginnerOverview.marketRead}</strong><span>{beginnerOverview.actionState}</span></div>
      <div className="brain-overview-confidence"><b>{beginnerOverview.confidenceLabel}</b><span>{beginnerOverview.confidencePercent}% setup evidence</span></div>
      <p>{beginnerOverview.summary}</p>
    </section>
    <section className="brain-overview-card">
      <h3>Why DizyBrain says that</h3>
      <ul className="brain-overview-reasons">{beginnerOverview.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </section>
    <section className="brain-overview-card caution">
      <h3>What still matters</h3>
      <p>{beginnerOverview.caution}</p>
    </section>
    <Disclosure title="Advanced details">
      <Row label="Market" value={data.symbol + " · " + data.market} />
      <Row label="Timeframe / feed" value={data.timeframe + " · " + data.feedState} />
      <Row label="Long / short score" value={snapshot.longScore + "/5 · " + snapshot.shortScore + "/5"} />
      <Row label="Qualification threshold" value={snapshot.qualificationThreshold} />
      <Row label="Confirmed candle" value={data.replay ? "Historical Replay" : snapshot.confirmedSignal ?? "No confirmed signal"} />
      {data.replay ? <><Row label="Historical DizyFlow" value={data.historicalFlowState.status} /><Row label="Sample" value={historical?.sample ? stamp(historical.sample.timeMs) : "Unavailable"} /></> : overviewFlow.hidden ? <p>{overviewFlow.message}</p> : <><Row label="DizyFlow availability" value={overviewFlow.availability} /><Row label="Flow evidence" value={overviewFlow.confidence} /><Row label="Visible wall candidates" value={overviewFlow.walls} /></>}
      <p className="brain-note">Use the Signals and Flow tabs for the complete deterministic evidence and limitations.</p>
    </Disclosure>
  </>;`;
  next=once(next,oldOverview,newOverview,'beginner overview');
  next=once(next,'    <nav className="brain-nav" aria-label="DizyBrain modules">','    <div className="brain-nav-heading">Detailed evidence</div><nav className="brain-nav" aria-label="Detailed DizyBrain evidence modules">','nav heading');
  await writeFile(path,next);
}
{
  const path="app/globals.css",source=await readFile(path,"utf8");
  const oldToast='.flow-toast-rail{position:static!important;min-height:0;max-height:38px;flex:0 0 auto;display:flex;flex-direction:row!important;gap:5px;padding:0 12px;overflow:hidden;transform:none!important}.flow-toast-rail article{min-width:0;flex:0 1 260px;padding:4px 7px;box-shadow:none}.flow-toast-rail article span{flex-direction:row;gap:6px;align-items:center}.flow-toast-rail .toast-history{align-self:center}.flow-capturing{display:none}';
  const newToast='.flow-toast-rail{position:fixed!important;z-index:59;top:74px;right:18px!important;left:auto!important;min-height:0;max-height:none;display:block!important;padding:0;overflow:visible;pointer-events:none;transform:none!important}.flow-toast-rail.top-left{left:18px!important;right:auto!important}.flow-toast-rail.top-centre{left:50%!important;right:auto!important;transform:translateX(-50%)!important}.flow-toast-rail.top-right{right:18px!important;left:auto!important}.flow-toast-rail article{pointer-events:auto}.flow-capturing{display:none}';
  let next=once(source,oldToast,newToast,'floating toast override');
  const marker='/* Beginner-first DizyBrain readability and progressive disclosure. */';
  if(next.includes(marker))throw new Error('beginner CSS already exists');
  next+=`\n\n${marker}
.dizybrain-workspace{min-width:340px;background:linear-gradient(180deg,#0d111c,#090c14)}
.brain-header{min-height:64px;padding:10px 12px 9px 16px}.brain-header strong{font-size:16px;letter-spacing:.11em}.brain-header small{font-size:10px;letter-spacing:.08em}
.brain-status{flex-wrap:wrap;gap:8px;padding:8px 14px;font-size:11px}.brain-status span:first-child{padding:3px 8px}
.brain-nav-heading{padding:10px 12px 0;color:#818ba0;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.brain-nav{gap:5px;padding:8px 10px 11px}.brain-nav button{min-height:50px;padding:5px 4px;font-size:10px;line-height:1.2}.brain-nav button span{font-size:17px}
.brain-module{padding:16px}.brain-module h2{margin:0 0 14px;font-size:16px;letter-spacing:.05em}.brain-disclosure{margin-bottom:10px;border-radius:9px}.brain-disclosure summary{padding:12px;color:#d7dce8;font-size:12px}.brain-disclosure>div{padding:0 12px 12px}.brain-row{gap:14px;padding:8px 0;font-size:11px;line-height:1.35}.brain-row strong{max-width:64%}.brain-note,.brain-finding{font-size:11px;line-height:1.55}.brain-empty{padding:13px;font-size:12px}.brain-table table{font-size:10px}.brain-table th,.brain-table td{padding:6px}
.brain-overview-hero{display:grid;gap:10px;margin-bottom:12px;padding:16px;border:1px solid #3a4051;border-radius:12px;background:linear-gradient(145deg,#151b2a,#0d111b);box-shadow:0 12px 30px #0004}.brain-overview-hero.buy{border-color:#28765f;background:linear-gradient(145deg,#10251f,#0d1518)}.brain-overview-hero.sell{border-color:#7d3747;background:linear-gradient(145deg,#2a131a,#171016)}.brain-overview-hero>small{color:#98a3b7;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.brain-overview-state{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}.brain-overview-state strong{color:#f3f5fb;font-size:24px;line-height:1.05;letter-spacing:-.03em}.brain-overview-state span{padding:5px 8px;border:1px solid #51456f;border-radius:999px;background:#1c1730;color:#d9ceff;font-size:10px;font-weight:800;text-transform:uppercase}.brain-overview-hero.buy .brain-overview-state span{border-color:#28765f;background:#103127;color:#83e2bd}.brain-overview-hero.sell .brain-overview-state span{border-color:#7d3747;background:#35141e;color:#ff9daf}.brain-overview-confidence{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:9px;border-top:1px solid #2a3040}.brain-overview-confidence b{color:#e3e7f0;font-size:12px}.brain-overview-confidence span{color:#98a3b7;font-size:11px}.brain-overview-hero p{margin:0;color:#b8c0cf;font-size:12px;line-height:1.55}
.brain-overview-card{margin-bottom:10px;padding:13px;border:1px solid #272e3e;border-radius:10px;background:#0e131e}.brain-overview-card.caution{border-color:#4d4330;background:#17150f}.brain-overview-card h3{margin:0 0 8px;color:#e1e5ef;font-size:12px}.brain-overview-card p{margin:0;color:#aeb7c8;font-size:11px;line-height:1.55}.brain-overview-reasons{display:grid;gap:7px;margin:0;padding:0;list-style:none}.brain-overview-reasons li{position:relative;padding-left:16px;color:#b9c2d1;font-size:11px;line-height:1.45}.brain-overview-reasons li::before{content:"•";position:absolute;left:2px;color:#9b83ff}
@media(max-width:700px){.flow-toast-rail{top:68px;right:8px!important;left:auto!important;transform:none!important}.dizybrain-workspace.drawer{width:min(96vw,440px);max-width:min(96vw,440px)}.brain-overview-state{align-items:flex-start;flex-direction:column}.brain-overview-state strong{font-size:22px}}
`;
  await writeFile(path,next);
}
