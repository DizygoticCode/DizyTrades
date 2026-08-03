"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  FIRST_RUN_ONBOARDING_PATHS,
  completeFirstRunOnboarding,
  hasCompletedFirstRunOnboarding,
} from "./lib/first-run-onboarding";

const topbarSelector = ".topbar .system-strip";

function subscribeToTopbar(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function topbarSnapshot() {
  return document.querySelector<HTMLElement>(topbarSelector);
}

function serverTopbarSnapshot() {
  return null;
}

export function FirstRunOnboarding({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const topbar = useSyncExternalStore(
    subscribeToTopbar,
    topbarSnapshot,
    serverTopbarSnapshot,
  );
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOpen(!hasCompletedFirstRunOnboarding(window.localStorage, userId));
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const finish = () => {
    completeFirstRunOnboarding(window.localStorage, userId);
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const openPaper = () => {
    finish();
    window.setTimeout(() => {
      window.dispatchEvent(new Event("manual-paper-open"));
      document.getElementById("manual-paper-panel")?.focus();
    }, 0);
  };

  const firstName = userName.trim().split(/\s+/)[0] || "there";
  const explore = FIRST_RUN_ONBOARDING_PATHS.find(
    (path) => path.id === "explore",
  )!;
  const learn = FIRST_RUN_ONBOARDING_PATHS.find((path) => path.id === "learn")!;
  const paper = FIRST_RUN_ONBOARDING_PATHS.find((path) => path.id === "paper")!;

  const trigger = topbar
    ? createPortal(
        <button
          className="nav-tab first-run-onboarding-trigger"
          onClick={() => setOpen(true)}
          ref={triggerRef}
          title="Open the DizyTrades beginner guide"
          type="button"
        >
          <span aria-hidden="true">◎</span> Start Here
        </button>,
        topbar,
      )
    : null;

  const modal =
    ready && open
      ? createPortal(
          <div className="first-run-onboarding-backdrop">
            <div
              aria-describedby="first-run-onboarding-description"
              aria-labelledby="first-run-onboarding-title"
              aria-modal="true"
              className="first-run-onboarding-dialog"
              data-onboarding-version="1"
              ref={dialogRef}
              role="dialog"
              tabIndex={-1}
            >
              <header>
                <div>
                  <span className="first-run-onboarding-kicker">
                    FIRST-RUN GUIDE
                  </span>
                  <h1 id="first-run-onboarding-title">
                    Welcome to DizyTrades, {firstName}.
                  </h1>
                  <p id="first-run-onboarding-description">
                    Choose a simple starting path. The full platform remains
                    available underneath, and this guide can always be reopened
                    from <b>Start Here</b> in the terminal toolbar.
                  </p>
                </div>
                <button
                  aria-label="Close onboarding and remind me later"
                  className="first-run-onboarding-close"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </header>

              <section className="first-run-onboarding-boundary" role="note">
                <b>Simulation and education only.</b>
                <span>
                  Live trading is disabled. DizyPaper uses simulated funds and
                  public market data—not an exchange order route.
                </span>
              </section>

              <div className="first-run-onboarding-paths">
                <article>
                  <span>{explore.eyebrow}</span>
                  <h2>{explore.title}</h2>
                  <p>{explore.description}</p>
                  <button onClick={finish} type="button">
                    {explore.action} <span aria-hidden="true">→</span>
                  </button>
                </article>
                <article>
                  <span>{learn.eyebrow}</span>
                  <h2>{learn.title}</h2>
                  <p>{learn.description}</p>
                  <Link href="/school" onClick={finish}>
                    {learn.action} <span aria-hidden="true">→</span>
                  </Link>
                </article>
                <article>
                  <span>{paper.eyebrow}</span>
                  <h2>{paper.title}</h2>
                  <p>{paper.description}</p>
                  <button onClick={openPaper} type="button">
                    {paper.action} <span aria-hidden="true">→</span>
                  </button>
                </article>
              </div>

              <section className="first-run-onboarding-basics">
                <h2>Three things to know first</h2>
                <ol>
                  <li>
                    <b>Start simple:</b> BTC/USDT on 15m is a clear first
                    workspace for learning the controls.
                  </li>
                  <li>
                    <b>Fair versus Last:</b> Fair price is preferred for paper
                    risk and liquidation checks; Last is the latest traded-price
                    fallback.
                  </li>
                  <li>
                    <b>Evidence before action:</b> DizyBrain explains the setup;
                    DizyFlow shows public depth and completed trades.
                  </li>
                </ol>
              </section>

              <footer>
                <button
                  className="first-run-onboarding-later"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Remind me next visit
                </button>
                <button
                  className="first-run-onboarding-skip"
                  onClick={finish}
                  type="button"
                >
                  Skip onboarding
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {modal}
      <style jsx global>{`
        .first-run-onboarding-trigger {
          color: #d8d2ff;
          border-color: #534a91;
          background: linear-gradient(180deg, #1b1732, #100e1d);
          box-shadow: inset 0 0 12px #8574ff14;
        }
        .first-run-onboarding-trigger:hover,
        .first-run-onboarding-trigger:focus-visible {
          color: #ffffff;
          border-color: #9a83ff;
          box-shadow: 0 0 14px #8f7cff2b;
        }
        .first-run-onboarding-backdrop {
          position: fixed;
          z-index: 10000;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 24px;
          overflow-y: auto;
          background: #03050bcc;
          backdrop-filter: blur(8px);
        }
        .first-run-onboarding-dialog {
          width: min(920px, 100%);
          max-height: calc(100vh - 48px);
          overflow-y: auto;
          color: #eef2fb;
          border: 1px solid #343d55;
          border-radius: 16px;
          outline: none;
          background:
            radial-gradient(circle at 50% 0, #33275a55, transparent 34%),
            linear-gradient(180deg, #111725, #090c13);
          box-shadow: 0 40px 120px #000c;
        }
        .first-run-onboarding-dialog > header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          padding: 32px 34px 24px;
        }
        .first-run-onboarding-kicker {
          color: #9a83ff;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.18em;
        }
        .first-run-onboarding-dialog h1 {
          margin: 9px 0 10px;
          font-size: clamp(27px, 4vw, 42px);
          line-height: 1.04;
          letter-spacing: -0.04em;
        }
        .first-run-onboarding-dialog header p {
          max-width: 700px;
          margin: 0;
          color: #9ca7bc;
          font-size: 14px;
          line-height: 1.65;
        }
        .first-run-onboarding-close {
          width: 38px;
          height: 38px;
          flex: 0 0 auto;
          color: #aeb7c9;
          border: 1px solid #30394d;
          border-radius: 8px;
          background: #111725;
          font-size: 22px;
          cursor: pointer;
        }
        .first-run-onboarding-boundary {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 34px 22px;
          padding: 11px 13px;
          color: #b9c5d9;
          border: 1px solid #2c594d;
          border-radius: 8px;
          background: #0d241e;
          font-size: 12px;
        }
        .first-run-onboarding-boundary b {
          color: #50eab4;
          white-space: nowrap;
        }
        .first-run-onboarding-paths {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding: 0 34px;
        }
        .first-run-onboarding-paths article {
          min-height: 230px;
          display: flex;
          flex-direction: column;
          padding: 20px;
          border: 1px solid #283146;
          border-radius: 11px;
          background: linear-gradient(145deg, #151c2a, #0d111a);
        }
        .first-run-onboarding-paths article > span {
          color: #54dfb0;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .first-run-onboarding-paths h2 {
          margin: 10px 0 9px;
          font-size: 20px;
        }
        .first-run-onboarding-paths p {
          flex: 1;
          margin: 0 0 18px;
          color: #909bb0;
          font-size: 12px;
          line-height: 1.6;
        }
        .first-run-onboarding-paths button,
        .first-run-onboarding-paths a {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 0 12px;
          color: #eef2fb;
          border: 1px solid #3a4560;
          border-radius: 7px;
          background: #171e2d;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          text-decoration: none;
          cursor: pointer;
        }
        .first-run-onboarding-paths button:hover,
        .first-run-onboarding-paths button:focus-visible,
        .first-run-onboarding-paths a:hover,
        .first-run-onboarding-paths a:focus-visible,
        .first-run-onboarding-close:hover,
        .first-run-onboarding-close:focus-visible {
          border-color: #9a83ff;
          outline: 2px solid #9a83ff44;
          outline-offset: 2px;
        }
        .first-run-onboarding-basics {
          margin: 22px 34px 0;
          padding: 18px 20px;
          border-top: 1px solid #222a3c;
          border-bottom: 1px solid #222a3c;
        }
        .first-run-onboarding-basics h2 {
          margin: 0 0 12px;
          font-size: 13px;
        }
        .first-run-onboarding-basics ol {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
          margin: 0;
          padding: 0;
          color: #8f9ab0;
          list-style: none;
          counter-reset: onboarding-basics;
          font-size: 11px;
          line-height: 1.55;
        }
        .first-run-onboarding-basics li {
          counter-increment: onboarding-basics;
        }
        .first-run-onboarding-basics li::before {
          content: "0" counter(onboarding-basics);
          display: block;
          margin-bottom: 5px;
          color: #615a84;
          font: 10px monospace;
        }
        .first-run-onboarding-basics b {
          color: #d9dfeb;
        }
        .first-run-onboarding-dialog > footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 20px 34px 28px;
        }
        .first-run-onboarding-dialog > footer button {
          min-height: 38px;
          padding: 0 14px;
          color: #bbc4d5;
          border: 1px solid #313a4e;
          border-radius: 7px;
          background: #111725;
          font: inherit;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .first-run-onboarding-dialog > footer .first-run-onboarding-skip {
          color: #08110e;
          border-color: #2ee6a6;
          background: #2ee6a6;
        }
        .first-run-onboarding-dialog > footer button:focus-visible {
          outline: 2px solid #9a83ff;
          outline-offset: 2px;
        }
        @media (max-width: 760px) {
          .first-run-onboarding-backdrop {
            padding: 10px;
            place-items: start center;
          }
          .first-run-onboarding-dialog {
            max-height: none;
          }
          .first-run-onboarding-dialog > header {
            padding: 24px 20px 18px;
          }
          .first-run-onboarding-boundary {
            align-items: flex-start;
            flex-direction: column;
            margin: 0 20px 18px;
          }
          .first-run-onboarding-paths {
            grid-template-columns: 1fr;
            padding: 0 20px;
          }
          .first-run-onboarding-paths article {
            min-height: 0;
          }
          .first-run-onboarding-basics {
            margin: 18px 20px 0;
            padding-inline: 0;
          }
          .first-run-onboarding-basics ol {
            grid-template-columns: 1fr;
          }
          .first-run-onboarding-dialog > footer {
            flex-direction: column-reverse;
            padding: 18px 20px 24px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .first-run-onboarding-backdrop,
          .first-run-onboarding-dialog,
          .first-run-onboarding-trigger {
            scroll-behavior: auto;
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
