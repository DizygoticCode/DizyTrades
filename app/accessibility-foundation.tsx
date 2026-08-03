"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const protectedPrefixes = [
  "/terminal",
  "/scanner",
  "/structure",
  "/performance",
  "/journal",
  "/school",
  "/backup",
  "/diagnostics",
  "/replay",
];

const focusableSelector = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function visible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    element.getAttribute("aria-hidden") !== "true"
  );
}

export function focusableDialogElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    visible,
  );
}

export function currentModalDialog() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
  )
    .filter(visible)
    .at(-1) ?? null;
}

export function AccessibilityFoundation() {
  const pathname = usePathname();
  const active = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    if (!active) return;

    const main = document.querySelector<HTMLElement>("main");
    if (main) {
      main.id = "main-content";
      if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
    }

    let trackedDialog: HTMLElement | null = null;
    let opener: HTMLElement | null = null;

    const synchroniseModal = () => {
      const dialog = currentModalDialog();
      if (dialog && dialog !== trackedDialog) {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          !dialog.contains(activeElement)
        ) {
          opener = activeElement;
        }
        trackedDialog = dialog;
        document.body.dataset.modalOpen = "true";
      } else if (!dialog && trackedDialog) {
        trackedDialog = null;
        delete document.body.dataset.modalOpen;
        const restore = opener;
        opener = null;
        if (restore?.isConnected) {
          window.requestAnimationFrame(() => restore.focus());
        }
      }
    };

    const observer = new MutationObserver(synchroniseModal);
    observer.observe(document.body, { childList: true, subtree: true });
    synchroniseModal();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = currentModalDialog();
      if (!dialog) return;
      const focusable = focusableDialogElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      const focused = document.activeElement;
      if (!dialog.contains(focused)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && focused === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", trapFocus, true);
      delete document.body.dataset.modalOpen;
    };
  }, [active, pathname]);

  if (!active) return null;

  return (
    <a
      className="accessibility-skip-link"
      href="#main-content"
      onClick={(event) => {
        const main = document.getElementById("main-content");
        if (!main) return;
        event.preventDefault();
        main.focus();
        main.scrollIntoView({ block: "start", behavior: "auto" });
      }}
    >
      Skip to main content
    </a>
  );
}
