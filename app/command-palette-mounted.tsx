"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AccessibilityFoundation } from "./accessibility-foundation";
import { CommandPalette } from "./command-palette";
import { DizyBrainGlobalToolOffset } from "./dizybrain-global-tool-offset";
import { RecentShortcuts } from "./recent-shortcuts";

const terminalToolbarSelector = ".terminal-shell .topbar .system-strip";

function subscribeMounted() {
  return () => {};
}

function subscribeToolbar(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function getToolbarSnapshot() {
  return document.querySelector<HTMLElement>(terminalToolbarSelector);
}

function getToolbarServerSnapshot() {
  return null;
}

function QuickActions() {
  return (
    <div className="global-quick-actions" aria-label="Terminal quick actions">
      <CommandPalette />
      <RecentShortcuts />
    </div>
  );
}

export function CommandPaletteMounted() {
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const terminalToolbar = useSyncExternalStore(
    subscribeToolbar,
    getToolbarSnapshot,
    getToolbarServerSnapshot,
  );

  if (!mounted) return null;

  return (
    <>
      <AccessibilityFoundation />
      <DizyBrainGlobalToolOffset />
      {terminalToolbar ? createPortal(<QuickActions />, terminalToolbar) : <QuickActions />}
    </>
  );
}
