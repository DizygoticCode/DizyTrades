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

function modalBackgroundElements(dialog: HTMLElement) {
  const background = new Set<HTMLElement>();
  let current: HTMLElement = dialog;
  while (current.parentElement) {
    const parent = current.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== current && sibling instanceof HTMLElement) {
        background.add(sibling);
      }
    }
    if (parent === document.body) break;
    current = parent;
  }
  return [...background];
}

/**
 * `aria-modal` describes the relationship, while `inert` enforces it for
 * keyboard, pointer and accessibility-tree navigation. Preserve any inert
 * state that belonged to the page before the dialog opened.
 */
export function isolateModalBackground(dialog: HTMLElement) {
  const changed = modalBackgroundElements(dialog).map((element) => ({
    element,
    hadInert: element.hasAttribute("inert"),
  }));
  for (const { element } of changed) element.setAttribute("inert", "");
  return () => {
    for (const { element, hadInert } of changed) {
      if (!hadInert) element.removeAttribute("inert");
    }
  };
}

function focusMainContent() {
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return;

  // The page owns the server-rendered main element. Add a temporary focus
  // target only after explicit user activation, avoiding hydration changes.
  const originalId = main.getAttribute("id");
  const originalTabIndex = main.getAttribute("tabindex");
  if (!originalId) main.id = "main-content";
  if (originalTabIndex === null) main.tabIndex = -1;

  const restore = () => {
    if (originalId === null) main.removeAttribute("id");
    else main.id = originalId;
    if (originalTabIndex === null) main.removeAttribute("tabindex");
    else main.setAttribute("tabindex", originalTabIndex);
  };

  main.addEventListener("blur", restore, { once: true });
  main.focus({ preventScroll: true });
  main.scrollIntoView({ block: "start", behavior: "auto" });
}

export function AccessibilityFoundation() {
  const pathname = usePathname();
  const active = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    if (!active) return;

    let trackedDialog: HTMLElement | null = null;
    let opener: HTMLElement | null = null;
    let restoreIsolation = () => {};

    const synchroniseModal = () => {
      const dialog = currentModalDialog();
      if (dialog && dialog !== trackedDialog) {
        restoreIsolation();
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          !dialog.contains(activeElement)
        ) {
          opener = activeElement;
        }
        trackedDialog = dialog;
        restoreIsolation = isolateModalBackground(dialog);
        document.body.dataset.modalOpen = "true";
      } else if (!dialog && trackedDialog) {
        trackedDialog = null;
        restoreIsolation();
        restoreIsolation = () => {};
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
      restoreIsolation();
      delete document.body.dataset.modalOpen;
    };
  }, [active, pathname]);

  if (!active) return null;

  return (
    <a
      className="accessibility-skip-link"
      href="#main-content"
      onClick={(event) => {
        event.preventDefault();
        focusMainContent();
      }}
    >
      Skip to main content
    </a>
  );
}
