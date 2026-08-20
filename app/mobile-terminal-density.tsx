"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Snapshot = {
  bias: string;
  score: string;
  paperExpanded: boolean;
  replayActive: boolean;
};

const EMPTY_SNAPSHOT: Snapshot = {
  bias: "Signal",
  score: "",
  paperExpanded: false,
  replayActive: false,
};

function terminalSnapshot(terminal: HTMLElement): Snapshot {
  const articles = terminal.querySelectorAll<HTMLElement>(".signal-dock article");
  const bias = articles[0]?.querySelector("strong")?.textContent?.trim() || "Signal";
  const longScore = articles[1]?.querySelector("strong")?.textContent?.trim() || "";
  const shortScore = articles[2]?.querySelector("strong")?.textContent?.trim() || "";
  const score = bias.toLowerCase().includes("bear") ? shortScore : longScore;
  const paper = terminal.querySelector<HTMLElement>("#manual-paper-panel");
  return {
    bias,
    score,
    paperExpanded: Boolean(paper?.querySelector("aside")),
    replayActive: Boolean(terminal.querySelector(".replay-controls.active")),
  };
}

function clickManualPaperToggle(terminal: HTMLElement) {
  const panel = terminal.querySelector<HTMLElement>("#manual-paper-panel");
  if (!panel) {
    const reopen = Array.from(terminal.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Open Manual Paper",
    );
    reopen?.click();
    return;
  }
  panel
    .querySelector<HTMLButtonElement>('button[aria-label="Minimise Manual Paper"]')
    ?.click();
}

export function MobileTerminalDensity() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const initialisedPaper = useRef(new WeakSet<HTMLElement>());

  useEffect(() => {
    let frame = 0;
    const media = window.matchMedia("(max-width: 760px)");
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = media.matches
          ? document.querySelector<HTMLElement>(".terminal-shell .terminal-primary-column")
          : null;
        setHost((current) => (current === next ? current : next));
      });
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    media.addEventListener("change", refresh);
    window.addEventListener("resize", refresh);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, []);

  useEffect(() => {
    if (!host) {
      setToolsOpen(false);
      setSignalOpen(false);
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }
    const terminal = host.closest<HTMLElement>(".terminal-shell");
    if (!terminal) return;

    const refresh = () => {
      const paper = terminal.querySelector<HTMLElement>("#manual-paper-panel");
      if (paper && !initialisedPaper.current.has(paper)) {
        initialisedPaper.current.add(paper);
        if (paper.querySelector("aside")) {
          paper
            .querySelector<HTMLButtonElement>('button[aria-label="Minimise Manual Paper"]')
            ?.click();
          return;
        }
      }
      setSnapshot(terminalSnapshot(terminal));
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(terminal, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [host]);

  useEffect(() => {
    const terminal = host?.closest<HTMLElement>(".terminal-shell");
    if (!terminal) return;
    terminal.dataset.mobileDensityTools = toolsOpen ? "open" : "closed";
    terminal.dataset.mobileDensitySignal = signalOpen ? "open" : "closed";
    return () => {
      delete terminal.dataset.mobileDensityTools;
      delete terminal.dataset.mobileDensitySignal;
    };
  }, [host, signalOpen, toolsOpen]);

  if (!host) return null;
  const terminal = host.closest<HTMLElement>(".terminal-shell");
  if (!terminal) return null;

  const toggleTools = () => {
    setToolsOpen((value) => !value);
    setSignalOpen(false);
  };
  const toggleSignal = () => {
    setSignalOpen((value) => !value);
    setToolsOpen(false);
  };
  const enterReplay = () => {
    if (snapshot.replayActive) return;
    terminal
      .querySelector<HTMLButtonElement>(".replay-controls:not(.active) button")
      ?.click();
  };

  return createPortal(
    <nav className="mobile-density-rail" aria-label="Compact terminal controls">
      <button
        type="button"
        aria-expanded={toolsOpen}
        aria-controls="mobile-terminal-tools"
        onClick={toggleTools}
      >
        <span aria-hidden="true">✎</span>
        Tools
      </button>
      <button
        type="button"
        aria-expanded={signalOpen}
        aria-controls="mobile-terminal-signal"
        onClick={toggleSignal}
      >
        <span className="mobile-density-signal-dot" aria-hidden="true" />
        {snapshot.bias}{snapshot.score ? ` · ${snapshot.score}` : ""}
      </button>
      <button
        type="button"
        aria-pressed={snapshot.paperExpanded}
        onClick={() => clickManualPaperToggle(terminal)}
      >
        <span aria-hidden="true">P</span>
        Paper
      </button>
      <button
        type="button"
        aria-pressed={snapshot.replayActive}
        disabled={snapshot.replayActive}
        onClick={enterReplay}
      >
        <span aria-hidden="true">↺</span>
        Replay
      </button>
    </nav>,
    host,
  );
}
