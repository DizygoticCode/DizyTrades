"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

type BrainSnapshot = {
  bias: string;
  phase: string;
  lastSignal: string;
  longScore: number;
  shortScore: number;
  risk: string;
};

type TimelineItem = {
  label: string;
  detail: string;
  state: "complete" | "active" | "waiting";
};

const EMPTY: BrainSnapshot = {
  bias: "Waiting for confirmed data",
  phase: "No setup selected",
  lastSignal: "No confirmed signal yet",
  longScore: 0,
  shortScore: 0,
  risk: "Unavailable",
};

function score(text: string | undefined) {
  const value = Number(text?.match(/(\d+)\s*\/\s*5/)?.[1] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
}

function readTerminal(): BrainSnapshot {
  const status = document.querySelector(".chart-status-row");
  const cards = [...document.querySelectorAll<HTMLElement>(".signal-dock article")];
  const setup = cards[0];
  const long = cards[1];
  const short = cards[2];
  const risk = cards[3];
  return {
    bias: setup?.querySelector("strong")?.textContent?.trim() || status?.querySelector(".bias-pill")?.textContent?.trim() || EMPTY.bias,
    phase: status?.querySelector("div:first-child span:last-child")?.textContent?.trim() || EMPTY.phase,
    lastSignal: setup?.querySelector("small")?.textContent?.trim() || EMPTY.lastSignal,
    longScore: score(long?.querySelector("strong")?.textContent),
    shortScore: score(short?.querySelector("strong")?.textContent),
    risk: risk?.querySelector("strong")?.textContent?.trim() || EMPTY.risk,
  };
}

function BrainMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64">
      <path d="M22 13c-7 1-11 7-10 14-5 4-5 12 0 16-1 7 6 12 12 10 3 5 11 5 14 0 6 2 13-3 12-10 5-4 5-12 0-16 1-7-5-13-12-14-4-5-12-5-16 0Z" />
      <path d="M24 18v28m16-28v28M16 28h9m15 0h9M19 39h8m10 0h8M31 14v36" />
      <circle cx="16" cy="28" r="2" /><circle cx="48" cy="28" r="2" /><circle cx="19" cy="39" r="2" /><circle cx="45" cy="39" r="2" />
    </svg>
  );
}

export function DizyBrainShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<BrainSnapshot>(EMPTY);

  useEffect(() => {
    const update = () => setSnapshot(readTerminal());
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    update();
    return () => observer.disconnect();
  }, []);

  const direction = snapshot.shortScore > snapshot.longScore ? "SELL" : snapshot.longScore > snapshot.shortScore ? "BUY" : "NEUTRAL";
  const activeScore = Math.max(snapshot.longScore, snapshot.shortScore);
  const confidence = activeScore * 20;
  const confirmedSignal = !/no confirmed/i.test(snapshot.lastSignal);
  const biasAvailable = snapshot.bias !== EMPTY.bias;
  const phaseAvailable = snapshot.phase !== EMPTY.phase;
  const riskAvailable = snapshot.risk !== EMPTY.risk;

  const checks = useMemo(() => [
    { label: `${snapshot.bias} market bias`, pass: biasAvailable },
    { label: `${snapshot.phase} phase identified`, pass: phaseAvailable },
    { label: `${activeScore} / 5 deterministic confluence`, pass: activeScore > 0 },
    { label: "Confirmed-candle signal context", pass: confirmedSignal },
    { label: `Risk gate ${snapshot.risk}`, pass: riskAvailable },
  ], [activeScore, biasAvailable, confirmedSignal, phaseAvailable, riskAvailable, snapshot]);

  const timeline = useMemo<TimelineItem[]>(() => [
    {
      label: "Market context",
      detail: biasAvailable ? `${snapshot.bias} bias detected` : "Waiting for confirmed market context",
      state: biasAvailable ? "complete" : "waiting",
    },
    {
      label: "Structure phase",
      detail: phaseAvailable ? snapshot.phase : "No deterministic phase identified yet",
      state: phaseAvailable ? "complete" : "waiting",
    },
    {
      label: "Confluence build",
      detail: `${activeScore} of 5 gates currently satisfied`,
      state: activeScore >= 4 ? "complete" : activeScore > 0 ? "active" : "waiting",
    },
    {
      label: "Risk gate",
      detail: riskAvailable ? snapshot.risk : "Risk context is not available",
      state: riskAvailable ? "complete" : "waiting",
    },
    {
      label: "Confirmed signal",
      detail: confirmedSignal ? snapshot.lastSignal : "Waiting for a confirmed-candle signal",
      state: confirmedSignal ? "complete" : activeScore > 0 ? "active" : "waiting",
    },
  ], [activeScore, biasAvailable, confirmedSignal, phaseAvailable, riskAvailable, snapshot]);

  const rejectionReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!biasAvailable) reasons.push("Market bias has not been confirmed.");
    if (!phaseAvailable) reasons.push("A recognised structure phase is not available.");
    if (activeScore < 4) reasons.push(`Confluence is ${activeScore}/5; the setup has not reached the qualification threshold.`);
    if (!riskAvailable) reasons.push("The risk gate cannot be evaluated yet.");
    if (!confirmedSignal) reasons.push("No confirmed-candle signal is present.");
    return reasons;
  }, [activeScore, biasAvailable, confirmedSignal, phaseAvailable, riskAvailable]);

  return (
    <div className="dizybrain-shell">
      {children}
      <button className="dizybrain-launch" onClick={() => setOpen(true)} type="button" aria-expanded={open}>
        <BrainMark /><span><b>DizyBrain</b><small>Explain current signal</small></span>
      </button>
      <aside className={`dizybrain-panel ${open ? "open" : ""}`} aria-hidden={!open} aria-label="DizyBrain transparent signal reasoning">
        <button className="dizybrain-close" onClick={() => setOpen(false)} type="button" aria-label="Close DizyBrain">×</button>
        <header><BrainMark /><div><strong>DIZY<span>BRAIN</span></strong><small>Transparent Signal Reasoning</small></div></header>
        <div className="dizybrain-ghost"><BrainMark /></div>
        <section className="dizybrain-summary">
          <span className={`dizybrain-direction ${direction.toLowerCase()}`}>{direction}</span>
          <div><small>Current setup</small><strong>{snapshot.bias}</strong><span>{snapshot.lastSignal}</span></div>
        </section>
        <section>
          <div className="dizybrain-section-title"><span>Overall confidence</span><strong>{confidence}%</strong></div>
          <div className="dizybrain-meter"><i style={{ width: `${confidence}%` }} /></div>
          <small className="dizybrain-caption">Derived from the existing {activeScore}/5 DizySignals confluence score. It is not a prediction.</small>
        </section>
        <section>
          <div className="dizybrain-section-title"><span>Confluence</span><strong>{activeScore} / 5</strong></div>
          <div className="dizybrain-score-grid">
            <article><span>Long</span><b>{snapshot.longScore}/5</b><i><em style={{ width: `${snapshot.longScore * 20}%` }} /></i></article>
            <article><span>Short</span><b>{snapshot.shortScore}/5</b><i><em style={{ width: `${snapshot.shortScore * 20}%` }} /></i></article>
            <article><span>Phase</span><b>{snapshot.phase}</b></article>
            <article><span>Risk</span><b>{snapshot.risk}</b></article>
          </div>
        </section>
        <section>
          <div className="dizybrain-section-title"><span>Qualified because</span></div>
          <ul className="dizybrain-checks">{checks.map((item, index) => <li className={item.pass ? "pass" : "waiting"} key={item.label} style={{ animationDelay: `${index * 55}ms` }}><b>{item.pass ? "✓" : "·"}</b>{item.label}</li>)}</ul>
        </section>
        <section className="dizybrain-timeline-section">
          <div className="dizybrain-section-title"><span>Current setup timeline</span><strong>{activeScore}/5</strong></div>
          <ol className="dizybrain-timeline">
            {timeline.map((item, index) => (
              <li className={item.state} key={item.label} style={{ animationDelay: `${index * 65}ms` }}>
                <i aria-hidden="true">{item.state === "complete" ? "✓" : item.state === "active" ? "•" : "·"}</i>
                <div><b>{item.label}</b><span>{item.detail}</span></div>
              </li>
            ))}
          </ol>
          <small className="dizybrain-caption">This is the live deterministic progression available from the current terminal state. Historical per-candle rule events will require a dedicated rule ledger.</small>
        </section>
        <section className="dizybrain-rejections">
          <div className="dizybrain-section-title"><span>{rejectionReasons.length ? "Why this is not qualified yet" : "Qualification result"}</span></div>
          {rejectionReasons.length ? (
            <ul>{rejectionReasons.map((reason) => <li key={reason}><b>×</b><span>{reason}</span></li>)}</ul>
          ) : (
            <div className="dizybrain-qualified"><b>✓</b><span>All currently exposed deterministic gates are available. {snapshot.lastSignal}</span></div>
          )}
        </section>
        <section className="dizybrain-coming">
          <div className="dizybrain-section-title"><span>Deeper reasoning coming next</span></div>
          <p>Historical rule ledger · per-candle rejection archive · DOM imbalance · footprint delta · liquidity absorption</p>
        </section>
      </aside>
      {open ? <button aria-label="Close DizyBrain" className="dizybrain-backdrop" onClick={() => setOpen(false)} type="button" /> : null}
      <style jsx global>{`
        .dizybrain-launch{position:fixed;z-index:46;right:18px;bottom:18px;display:flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid #13d8d1;border-radius:12px;background:#080d14eF;color:#fff;box-shadow:0 8px 30px #000a,0 0 18px #00d8d133;cursor:pointer}.dizybrain-launch svg,.dizybrain-panel header svg{width:29px;height:29px;fill:none;stroke:#13e1d6;stroke-width:2}.dizybrain-launch span{display:flex;flex-direction:column;text-align:left}.dizybrain-launch small{color:#80a3a5;font-size:9px}.dizybrain-panel{position:fixed;z-index:52;top:0;right:0;width:min(450px,94vw);height:100dvh;overflow:auto;padding:20px;border-left:1px solid #12cfc8;background:linear-gradient(180deg,#080c13 0%,#0c111b 58%,#070a10 100%);color:#edf7f8;box-shadow:-20px 0 55px #000c;transform:translateX(105%);opacity:0;transition:transform 280ms ease,opacity 220ms ease}.dizybrain-panel.open{transform:translateX(0);opacity:1}.dizybrain-panel header{display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid #1f3940}.dizybrain-panel header strong{font-size:24px;letter-spacing:.08em}.dizybrain-panel header strong span{color:#16ddd4}.dizybrain-panel header small{display:block;margin-top:2px;color:#98aeb3;letter-spacing:.15em;text-transform:uppercase}.dizybrain-close{position:absolute;right:14px;top:12px;border:0;background:transparent;color:#c9d7d8;font-size:24px;cursor:pointer}.dizybrain-ghost{position:absolute;right:-48px;top:80px;opacity:.06;pointer-events:none}.dizybrain-ghost svg{width:300px;height:300px;fill:none;stroke:#2ff3ea;stroke-width:1}.dizybrain-panel section{position:relative;margin-top:17px;padding:15px;border:1px solid #1d2c36;border-radius:12px;background:#0c121cdd;animation:dizybrain-rise 300ms ease both}.dizybrain-summary{display:flex;align-items:center;gap:12px}.dizybrain-summary>div{display:flex;flex-direction:column;gap:2px}.dizybrain-summary small,.dizybrain-caption{color:#7f969c}.dizybrain-direction{min-width:66px;padding:9px;border-radius:8px;text-align:center;font-weight:800}.dizybrain-direction.buy{background:#0fcf9a22;color:#20e6ad;border:1px solid #20e6ad66}.dizybrain-direction.sell{background:#ff506822;color:#ff6078;border:1px solid #ff607866}.dizybrain-direction.neutral{background:#68748b22;color:#b2bed1;border:1px solid #68748b66}.dizybrain-section-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.dizybrain-section-title span{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#96aaaf}.dizybrain-section-title strong{font-size:19px;color:#24e4dc}.dizybrain-meter{height:9px;border-radius:99px;background:#17242c;overflow:hidden}.dizybrain-meter i{display:block;height:100%;background:linear-gradient(90deg,#0ea9a5,#22eee4);box-shadow:0 0 14px #20e7df;transition:width 700ms cubic-bezier(.2,.8,.2,1)}.dizybrain-caption{display:block;margin-top:8px;line-height:1.45}.dizybrain-score-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dizybrain-score-grid article{display:flex;flex-direction:column;gap:5px;padding:10px;border:1px solid #1d3039;border-radius:8px;background:#090f17}.dizybrain-score-grid article span{color:#7f969c;font-size:10px}.dizybrain-score-grid article b{font-size:12px}.dizybrain-score-grid article i{height:4px;background:#17252d;border-radius:8px;overflow:hidden}.dizybrain-score-grid article em{display:block;height:100%;background:#17dcd3}.dizybrain-checks{display:grid;gap:8px;padding:0;margin:0;list-style:none}.dizybrain-checks li{display:flex;gap:8px;align-items:center;opacity:0;animation:dizybrain-check 260ms ease forwards}.dizybrain-checks .pass b{color:#20e6ad}.dizybrain-checks .waiting{color:#71858c}.dizybrain-timeline{position:relative;display:grid;gap:0;margin:0;padding:0;list-style:none}.dizybrain-timeline:before{content:"";position:absolute;left:10px;top:12px;bottom:12px;width:1px;background:#21414a}.dizybrain-timeline li{position:relative;display:flex;gap:12px;padding:8px 0;opacity:0;animation:dizybrain-check 280ms ease forwards}.dizybrain-timeline li>i{position:relative;z-index:1;display:grid;place-items:center;width:21px;height:21px;flex:0 0 21px;border:1px solid #29434b;border-radius:50%;background:#0b1219;color:#6d858b;font-style:normal}.dizybrain-timeline li.complete>i{border-color:#1ecfa4;color:#27e9b4;box-shadow:0 0 10px #16dca62b}.dizybrain-timeline li.active>i{border-color:#18dcd3;color:#1ce9df;box-shadow:0 0 12px #1ce9df40}.dizybrain-timeline li>div{display:flex;flex-direction:column;gap:2px}.dizybrain-timeline li span{color:#7e9399;font-size:10px;line-height:1.4}.dizybrain-rejections ul{display:grid;gap:7px;margin:0;padding:0;list-style:none}.dizybrain-rejections li,.dizybrain-qualified{display:flex;gap:9px;align-items:flex-start;padding:8px;border:1px solid #312b36;border-radius:8px;background:#120e15}.dizybrain-rejections li b{color:#ff6078}.dizybrain-rejections li span{color:#a9959e;line-height:1.4}.dizybrain-qualified{border-color:#1c4a3d;background:#0a1714}.dizybrain-qualified b{color:#24e6ae}.dizybrain-coming p{margin:0;color:#72878d;line-height:1.55}.dizybrain-backdrop{position:fixed;z-index:51;inset:0;border:0;background:#0008}.dizybrain-panel.open~.dizybrain-backdrop{display:block}@keyframes dizybrain-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes dizybrain-check{to{opacity:1}}@media(max-width:620px){.dizybrain-launch{right:10px;bottom:10px}.dizybrain-panel{width:100vw}.dizybrain-score-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
