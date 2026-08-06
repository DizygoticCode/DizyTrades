"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TERMINAL_COMPANION_LINKS } from "./lib/product-navigation";
import { MexcReferralLink } from "./mexc-referral-link";

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

export function DizyBrainTopbarLink({
  showAccountCompanion = false,
}: Readonly<{ showAccountCompanion?: boolean }>) {
  const target = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!target) return null;

  const companionLinks = TERMINAL_COMPANION_LINKS.filter(
    (product) => product.id !== "account" || showAccountCompanion,
  );

  return createPortal(
    <>
      <button
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
          .dizyquant-topbar-link {
            color: #c8a7ff;
            border-color: #65479a;
            background: linear-gradient(180deg, #1d1530, #110d1d);
            box-shadow: inset 0 0 12px #9c6cff16;
          }
          .dizyquant-topbar-link:hover,
          .dizyquant-topbar-link:focus-visible {
            color: #f1e8ff;
            border-color: #a97cff;
            box-shadow: 0 0 14px #9c6cff33;
          }
          .dizyaccount-topbar-link {
            color: #86f2cf;
            border-color: #36795f;
            background: linear-gradient(180deg, #10271f, #0a1713);
            box-shadow: inset 0 0 12px #42e3ad16;
          }
          .dizyaccount-topbar-link:hover,
          .dizyaccount-topbar-link:focus-visible {
            color: #e2fff5;
            border-color: #61e8b8;
            box-shadow: 0 0 14px #42e3ad30;
          }
          .dizydex-topbar-link {
            color: #c7f6a8;
            border-color: #4e7738;
            background: linear-gradient(180deg, #172713, #0d170a);
            box-shadow: inset 0 0 12px #9ee86f16;
          }
          .dizydex-topbar-link:hover,
          .dizydex-topbar-link:focus-visible {
            color: #efffe5;
            border-color: #9ee86f;
            box-shadow: 0 0 14px #9ee86f2b;
          }
        `}</style>
      </button>
      {companionLinks.map((product) => (
        <a
          className={`nav-tab ${product.terminalClassName ?? ""}`}
          href={product.href}
          key={product.id}
          title={product.title}
        >
          <span aria-hidden="true">{product.icon}</span> {product.label}
        </a>
      ))}
      <MexcReferralLink className="nav-tab" variant="terminal" />
    </>,
    target,
  );
}
