"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AccessibilityFoundation } from "./accessibility-foundation";
import { CommandPalette } from "./command-palette";
import { DizyBrainGlobalToolOffset } from "./dizybrain-global-tool-offset";
import { RecentShortcuts } from "./recent-shortcuts";

const terminalToolbarSelector = ".terminal-shell .topbar .system-strip";
const terminalHydratedEvent = "dizy-terminal-hydrated";

function subscribeMounted() {
  return () => {};
}

function findVisibleTerminalToolbar() {
  if (document.body.dataset.dizyTerminalHydrated !== "true") return null;
  const toolbar = document.querySelector<HTMLElement>(terminalToolbarSelector);
  return toolbar && toolbar.getClientRects().length > 0 ? toolbar : null;
}

function QuickActions({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className="global-quick-actions"
      aria-label="Terminal quick actions"
      hidden={hidden}
    >
      <CommandPalette />
      <RecentShortcuts />
    </div>
  );
}

export function CommandPaletteMounted() {
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const [terminalToolbar, setTerminalToolbar] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = findVisibleTerminalToolbar();
        setTerminalToolbar((current) => (current === next ? current : next));
      });
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-dizy-terminal-hydrated"],
    });
    window.addEventListener("resize", refresh);
    window.addEventListener(terminalHydratedEvent, refresh);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener(terminalHydratedEvent, refresh);
    };
  }, []);

  if (!mounted) return null;

  return (
    <>
      <AccessibilityFoundation />
      <DizyBrainGlobalToolOffset />
      {terminalToolbar ? (
        createPortal(<QuickActions />, terminalToolbar)
      ) : (
        <QuickActions hidden />
      )}
    </>
  );
}
