"use client";

import { useEffect } from "react";
import type { JournalListItem } from "../lib/journal-model";

export default function JournalRecentTracker() {
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("entry");
    if (!requested) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    void fetch("/api/journal", { cache: "no-store" })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { entries?: JournalListItem[] })
          : { entries: [] },
      )
      .then(({ entries = [] }) => {
        if (cancelled) return;
        const index = entries.findIndex((entry) => entry.id === requested);
        if (index < 0) return;
        const select = () => {
          const buttons = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              ".journal-list button.entry-row",
            ),
          );
          const button = buttons[index];
          if (!button) return false;
          button.click();
          return true;
        };
        if (select()) return;
        observer = new MutationObserver(() => {
          if (select()) observer?.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);
  return null;
}
