"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  classifyWorkspaceState,
  type WorkspaceKind,
  type WorkspaceStateDescriptor,
  type WorkspaceStateObservation,
} from "./lib/workspace-state";

const normalise = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

function visibleText(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter(
      (node) =>
        !node.closest("[data-workspace-state-polish]") &&
        node.getClientRects().length > 0,
    )
    .map((node) => normalise(node.textContent))
    .filter(Boolean)
    .join(" · ");
}

function observeWorkspace(): WorkspaceStateObservation {
  const domStatus = document.querySelector<HTMLElement>(
    ".dizyflow-dom header span",
  );
  const domMarket = document.querySelector<HTMLElement>(
    ".dizyflow-dom .dom-market strong",
  );
  return {
    statusText: visibleText('[role="status"]'),
    alertText: visibleText('[role="alert"]'),
    emptyText: visibleText('[class*="empty"]'),
    chartRecoveryText: visibleText(".chart-recovery"),
    domStatusText: normalise(domStatus?.textContent),
    domMarketText: normalise(domMarket?.textContent),
  };
}

function recoveryButton(workspace: WorkspaceKind) {
  const preferred: Record<WorkspaceKind, readonly string[]> = {
    terminal: ["Reload chart", "Retry feed", "Restart connection"],
    scanner: ["Refresh scan"],
    structure: ["Refresh structure"],
    backup: ["Run recovery dry-run", "Apply additive restore"],
  };
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) =>
      !button.disabled &&
      !button.closest("[data-workspace-state-polish]") &&
      preferred[workspace].some((label) =>
        normalise(button.textContent).toLowerCase().includes(label.toLowerCase()),
      ),
  );
}

export function WorkspaceStatePolish({ workspace }: { workspace: WorkspaceKind }) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<WorkspaceStateDescriptor | null>(null);
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
    let frame = 0;
    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = classifyWorkspaceState(workspace, observeWorkspace());
        setState(next);
        if (!next) setDismissedFingerprint(null);
      });
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-busy", "data-safe", "class"],
    });
    refresh();
    const interval = window.setInterval(refresh, 1_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, [workspace]);

  const visible = useMemo(
    () => state && state.fingerprint !== dismissedFingerprint,
    [dismissedFingerprint, state],
  );

  if (!mounted || !visible || !state) return null;

  const act = () => {
    if (state.action === "focus-file") {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      input?.focus();
      input?.click();
      return;
    }
    if (state.action === "retry") {
      const button = recoveryButton(workspace);
      if (button) {
        button.click();
        return;
      }
    }
    if (state.action === "reload" || state.action === "retry") {
      window.location.reload();
    }
  };

  return createPortal(
    <aside
      aria-live={state.kind === "error" || state.kind === "offline" ? "assertive" : "polite"}
      className={`workspace-state-polish workspace-state-${state.kind}`}
      data-state-kind={state.kind}
      data-workspace={workspace}
      data-workspace-state-polish
      role={state.kind === "error" || state.kind === "offline" ? "alert" : "status"}
    >
      <div className="workspace-state-heading">
        <span>{state.kind.toUpperCase()}</span>
        <button
          aria-label={`Dismiss ${state.title}`}
          onClick={() => setDismissedFingerprint(state.fingerprint)}
          type="button"
        >
          ×
        </button>
      </div>
      <strong>{state.title}</strong>
      <p>{state.detail}</p>
      <small>
        <b>Preserved:</b> {state.preserved}
      </small>
      {state.action !== "none" && state.actionLabel ? (
        <button className="workspace-state-action" onClick={act} type="button">
          {state.actionLabel}
        </button>
      ) : null}
      <style jsx global>{`
        .workspace-state-polish {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 12000;
          width: min(390px, calc(100vw - 28px));
          padding: 15px;
          color: #eef3fb;
          border: 1px solid #58647a;
          border-radius: 12px;
          background: linear-gradient(160deg, #151b28, #090d14);
          box-shadow: 0 18px 60px #000a;
        }
        .workspace-state-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }
        .workspace-state-heading span {
          color: #aebbd0;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.16em;
        }
        .workspace-state-heading button {
          width: 28px;
          height: 28px;
          color: #aebbd0;
          border: 1px solid #39445a;
          border-radius: 6px;
          background: #101622;
          cursor: pointer;
        }
        .workspace-state-polish > strong {
          display: block;
          margin-bottom: 5px;
          font-size: 15px;
        }
        .workspace-state-polish p {
          margin: 0 0 10px;
          color: #a8b2c5;
          font-size: 12px;
          line-height: 1.55;
        }
        .workspace-state-polish small {
          display: block;
          color: #7f8ca3;
          font-size: 10px;
          line-height: 1.5;
        }
        .workspace-state-polish small b {
          color: #bfc9da;
        }
        .workspace-state-action {
          min-height: 38px;
          margin-top: 12px;
          padding: 0 13px;
          color: #f4f7fc;
          border: 1px solid #68758f;
          border-radius: 7px;
          background: #1c2535;
          font: inherit;
          font-size: 11px;
          font-weight: 750;
          cursor: pointer;
        }
        .workspace-state-action:hover,
        .workspace-state-action:focus-visible,
        .workspace-state-heading button:hover,
        .workspace-state-heading button:focus-visible {
          border-color: #b6c8e8;
          outline: 2px solid #9db7de44;
          outline-offset: 2px;
        }
        .workspace-state-delayed,
        .workspace-state-recovering {
          border-color: #9a793d;
          background: linear-gradient(160deg, #282112, #100d08);
        }
        .workspace-state-offline,
        .workspace-state-error {
          border-color: #a74f61;
          background: linear-gradient(160deg, #2a151b, #11090c);
        }
        .workspace-state-empty {
          border-color: #4c6e8c;
          background: linear-gradient(160deg, #142230, #090e14);
        }
        @media (max-width: 640px) {
          .workspace-state-polish {
            right: 14px;
            bottom: 14px;
            left: 14px;
            width: auto;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .workspace-state-polish,
          .workspace-state-polish * {
            scroll-behavior: auto !important;
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </aside>,
    document.body,
  );
}
