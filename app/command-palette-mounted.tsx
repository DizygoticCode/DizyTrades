"use client";

import { useSyncExternalStore } from "react";
import { AccessibilityFoundation } from "./accessibility-foundation";
import { CommandPalette } from "./command-palette";
import { DizyBrainGlobalToolOffset } from "./dizybrain-global-tool-offset";
import { RecentShortcuts } from "./recent-shortcuts";

function subscribeMounted() {
  return () => {};
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

  if (!mounted) return null;

  return (
    <>
      <AccessibilityFoundation />
      <DizyBrainGlobalToolOffset />
      <QuickActions />
    </>
  );
}
