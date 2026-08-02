"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  {
    title: "Context",
    description: "Describe the market structure and conditions immediately before entry.",
    fields: [["context", "What was the market doing before entry?"]] as const,
  },
  {
    title: "Entry",
    description: "Record only the evidence that was genuinely available when the trade was opened.",
    fields: [["entryEvidence", "What evidence justified the entry?"]] as const,
  },
  {
    title: "Management",
    description: "Review whether the thesis remained valid and how the position was managed.",
    fields: [["management", "How did the thesis or management change during the trade?"]] as const,
  },
  {
    title: "Exit",
    description: "Separate the actual exit evidence from the financial outcome.",
    fields: [["exit", "Why did you exit, and what evidence existed then?"]] as const,
  },
  {
    title: "Reflection",
    description: "Finish with concrete behaviour you can repeat or improve.",
    fields: [
      ["strength", "One thing done well"],
      ["improvement", "One thing to improve"],
      ["repeatRule", "One rule to repeat next time"],
    ] as const,
  },
] as const;

const selectedEntryId = () =>
  typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("entry");

function replayHref(entry: JournalEntry) {
  const replay = entry.trade?.replay;
  if (!replay?.available) return null;
  const flow = entry.trade?.historicalDizyFlow;
  const params = new URLSearchParams({
    replayMarketKey: replay.marketKey,
    replaySymbol: replay.symbol,
    replayTimeframe: replay.timeframe,
    replayAt: String(replay.entryTimeMs),
    journalEntry: entry.id,
  });
  if (replay.memoryId) params.set("replayMemory", replay.memoryId);
  if (flow?.memoryId) {
    params.set("replayFlowMemory", flow.memoryId);
    params.set("replayTrade", entry.trade!.tradeId);
  }
  return `/terminal?${params.toString()}`;
}

async function fetchEntry(id: string, signal?: AbortSignal) {
  const response = await fetch(`/api/journal/${encodeURIComponent(id)}`, { signal });
  const body = (await response.json()) as { entry?: JournalEntry; error?: { message?: string } };
  if (!response.ok || !body.entry)
    throw new Error(body.error?.message ?? "Trade Review could not be loaded.");
  return body.entry;
}

export default function GuidedTradeReviewDock({ readOnly }: { readOnly: boolean }) {
  const [entryId, setEntryId] = useState<string | null>(null);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [draft, setDraft] = useState<GuidedTradeReviewDraft>(emptyGuidedTradeReview);
  const [stage, setStage] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "saving" | "failed">("idle");
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sync = () => setEntryId(selectedEntryId());
    sync();
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 350);
    return () => {
      window.removeEventListener("popstate", sync);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!entryId) {
      setEntry(null);
      return;
    }
    const controller = new AbortController();
    setState("loading");
    void fetchEntry(entryId, controller.signal)
      .then((value) => {
        if (value.type !== "trade-review" || !value.trade) {
          setEntry(null);
          return;
        }
        setEntry(value);
        setDraft(extractGuidedTradeReview(value.notes) ?? emptyGuidedTradeReview());
        setStage(0);
        setMessage("");
      })
      .catch((reason) => {
        if ((reason as Error).name !== "AbortError") {
          setEntry(null);
          setMessage((reason as Error).message);
          setState("failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setState((current) => (current === "failed" ? current : "idle"));
      });
    return () => controller.abort();
  }, [entryId]);

  const completion = useMemo(() => guidedTradeReviewCompletion(draft), [draft]);
  const href = entry ? replayHref(entry) : null;
  const evidence = entry?.trade
    ? [
        ["Replay", Boolean(entry.trade.replay?.available)],
        ["Historical DizyFlow", entry.trade.historicalDizyFlow.available],
        ["DizyBrain Review", entry.trade.dizyBrainReview.available],
      ] as const
    : [];

  const open = useCallback(async () => {
    if (!entryId) return;
    setState("loading");
    setMessage("Refreshing the selected Trade Review…");
    try {
      const latest = await fetchEntry(entryId);
      if (latest.type !== "trade-review" || !latest.trade) throw new Error("Select a Trade Review first.");
      setEntry(latest);
      setDraft(extractGuidedTradeReview(latest.notes) ?? emptyGuidedTradeReview());
      setMessage("");
      setState("idle");
      dialog.current?.showModal();
    } catch (reason) {
      setMessage((reason as Error).message);
      setState("failed");
    }
  }, [entryId]);

  const close = () => {
    dialog.current?.close();
    openButton.current?.focus();
  };

  const save = async () => {
    if (!entryId || !entry?.trade || readOnly || state === "saving") return;
    if (document.querySelector(".save-state.unsaved, .save-state.saving")) {
      setMessage("Save or discard the main Journal editor changes before saving this guided review.");
      return;
    }
    setState("saving");
    setMessage("Saving guided review into this Journal entry…");
    try {
      const latest = await fetchEntry(entryId);
      if (!latest.trade || latest.trade.tradeId !== entry.trade.tradeId)
        throw new Error("The selected trade changed. Reopen the guided review and try again.");
      const block = renderGuidedTradeReview(draft, {
        tradeId: latest.trade.tradeId,
        symbol: latest.trade.symbol,
        timeframe: latest.trade.timeframe,
        direction: latest.trade.direction,
        pnlPct: latest.trade.pnlPct,
        closeReason: latest.trade.closeReason,
        replayAvailable: Boolean(latest.trade.replay?.available),
        historicalFlowAvailable: latest.trade.historicalDizyFlow.available,
        dizyBrainReviewAvailable: latest.trade.dizyBrainReview.available,
      });
      const tags = latest.tags.some((tag) => tag.toLowerCase() === "guided-review")
        ? latest.tags
        : latest.tags.length < 20
          ? [...latest.tags, "guided-review"]
          : latest.tags;
      const response = await fetch(`/api/journal/${encodeURIComponent(entryId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes: upsertGuidedTradeReviewNotes(latest.notes, block),
          tags,
        }),
      });
      const body = (await response.json()) as { entry?: JournalEntry; error?: { message?: string } };
      if (!response.ok || !body.entry)
        throw new Error(body.error?.message ?? "Guided review could not be saved.");
      setEntry(body.entry);
      setDraft(extractGuidedTradeReview(body.entry.notes) ?? draft);
      setState("idle");
      setMessage("Guided review saved. Refreshing the Journal entry…");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (reason) {
      setState("failed");
      setMessage((reason as Error).message);
    }
  };

  if (!entry && state !== "loading") return null;

  return (
    <>
      <button
        className={styles.launcher}
        disabled={!entry || state === "loading"}
        onClick={() => void open()}
        ref={openButton}
        type="button"
      >
        <span>GUIDED REVIEW</span>
        <b>{entry ? `${completion.completed}/${completion.total}` : "Loading…"}</b>
      </button>
      <dialog className={styles.dialog} onClose={() => openButton.current?.focus()} ref={dialog}>
        {entry?.trade ? (
          <div className={styles.shell}>
            <header className={styles.header}>
              <div>
                <span>DIZYJOURNAL · HISTORICAL REVIEW</span>
                <h2>{entry.trade.symbol} · {entry.trade.direction}</h2>
                <p>{entry.trade.timeframe} · {entry.trade.pnlPct >= 0 ? "+" : ""}{entry.trade.pnlPct.toFixed(2)}% · {entry.trade.closeReason}</p>
              </div>
              <button aria-label="Close guided review" onClick={close} type="button">×</button>
            </header>

            <section className={styles.evidence} aria-label="Historical evidence availability">
              {evidence.map(([label, available]) => (
                <span className={available ? styles.available : styles.unavailable} key={label}>
                  {available ? "✓" : "—"} {label}
                </span>
              ))}
              {href ? <a href={href}>Open Replay ↗</a> : <small>Replay unavailable for this trade.</small>}
            </section>

            <div className={styles.progressRow}>
              <progress max={completion.total} value={completion.completed} />
              <span>{completion.percentage}% complete</span>
            </div>

            <nav className={styles.steps} aria-label="Guided review stages">
              {stages.map((item, index) => (
                <button
                  aria-current={stage === index ? "step" : undefined}
                  className={stage === index ? styles.activeStep : ""}
                  key={item.title}
                  onClick={() => setStage(index)}
                  type="button"
                >
                  <b>{index + 1}</b>
                  <span>{item.title}</span>
                </button>
              ))}
            </nav>

            <section className={styles.stage} aria-labelledby={`guided-stage-${stage}`}>
              <span>Stage {stage + 1} of {stages.length}</span>
              <h3 id={`guided-stage-${stage}`}>{stages[stage].title}</h3>
              <p>{stages[stage].description}</p>
              {stages[stage].fields.map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    disabled={readOnly}
                    maxLength={4_000}
                    onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder="Record what the retained evidence and your actual decision process show…"
                    rows={key === "strength" || key === "improvement" || key === "repeatRule" ? 3 : 7}
                    value={draft[key]}
                  />
                </label>
              ))}
            </section>

            <footer className={styles.footer}>
              <div role={state === "failed" ? "alert" : "status"} aria-live="polite">
                {message || (readOnly ? "Viewer mode · saved reviews are read-only." : "No new score is created. Your answers are saved in the existing Journal notes.")}
              </div>
              <div>
                <button disabled={stage === 0} onClick={() => setStage((value) => Math.max(0, value - 1))} type="button">Previous</button>
                {stage < stages.length - 1 ? (
                  <button onClick={() => setStage((value) => Math.min(stages.length - 1, value + 1))} type="button">Next</button>
                ) : !readOnly ? (
                  <button className={styles.primary} disabled={state === "saving"} onClick={() => void save()} type="button">
                    {state === "saving" ? "Saving…" : "Save to Journal"}
                  </button>
                ) : null}
              </div>
            </footer>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
