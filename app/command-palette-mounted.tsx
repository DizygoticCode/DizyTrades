"use client";

import { useSyncExternalStore } from "react";
import { AccessibilityFoundation } from "./accessibility-foundation";
import { CommandPalette } from "./command-palette";
import { DizyBrainGlobalToolOffset } from "./dizybrain-global-tool-offset";
import { RecentShortcuts } from "./recent-shortcuts";

function subscribe() {
  return () => {};
}

export function CommandPaletteMounted() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? (
    <>
      <AccessibilityFoundation />
      <DizyBrainGlobalToolOffset />
      <CommandPalette />
      <RecentShortcuts />
    </>
  ) : null;
}
