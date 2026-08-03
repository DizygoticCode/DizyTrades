"use client";

import { useSyncExternalStore } from "react";
import { CommandPalette } from "./command-palette";
import { RecentShortcuts } from "./recent-shortcuts";

function subscribe() {
  return () => {};
}

export function CommandPaletteMounted() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? (
    <>
      <CommandPalette />
      <RecentShortcuts />
    </>
  ) : null;
}
