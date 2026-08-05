"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AccessibilityFoundation } from "./accessibility-foundation";
import { CommandPalette } from "./command-palette";
import { DizyBrainGlobalToolOffset } from "./dizybrain-global-tool-offset";
import { RecentShortcuts } from "./recent-shortcuts";

function subscribe() {
  return () => {};
}

export function CommandPaletteMounted() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const pathname = usePathname();
  const [terminalAnchor, setTerminalAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!mounted || pathname !== "/terminal") {
      setTerminalAnchor(null);
      return;
    }

    const findAnchor = () =>
      document.querySelector<HTMLElement>(".topbar .system-strip");
    const existing = findAnchor();
    if (existing) {
      setTerminalAnchor(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const anchor = findAnchor();
      if (!anchor) return;
      setTerminalAnchor(anchor);
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mounted, pathname]);

  const quickActions = (
    <div className="global-quick-actions" aria-label="Terminal quick actions">
      <CommandPalette />
      <RecentShortcuts />
    </div>
  );

  return mounted ? (
    <>
      <AccessibilityFoundation />
      <DizyBrainGlobalToolOffset />
      {pathname === "/terminal"
        ? terminalAnchor
          ? createPortal(quickActions, terminalAnchor)
          : null
        : quickActions}
    </>
  ) : null;
}
