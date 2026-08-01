"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const selector = ".topbar .system-strip";

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.querySelector<HTMLElement>(selector);
}

function getServerSnapshot() {
  return null;
}

export function DizyBrainTopbarLink() {
  const target = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!target) return null;

  return createPortal(
    <><button
      className="nav-tab dizybrain-topbar-link"
      onClick={() =>
        document
          .querySelector<HTMLButtonElement>(".dizybrain-launch")
          ?.click()
      }
      title="Open DizyBrain transparent signal reasoning"
      type="button"
    >
      <span aria-hidden="true">🧠</span> DizyBrain
      <style jsx>{`
        .dizybrain-topbar-link {
          color: #44e9df;
          border-color: #1b6869;
          background: linear-gradient(180deg, #0b2024, #091419);
          box-shadow: inset 0 0 12px #0ad9cf12;
        }
        .dizybrain-topbar-link:hover,
        .dizybrain-topbar-link:focus-visible {
          color: #c8fffb;
          border-color: #20dcd3;
          box-shadow: 0 0 14px #13d8d12b;
        }
      `}</style>
    </button>
    <a className="nav-tab dizyjournal-topbar-link" href="/journal" title="Open DizyJournal">📓 DizyJournal</a></>,
    target,
  );
}
