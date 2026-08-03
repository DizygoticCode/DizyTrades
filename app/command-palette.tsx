"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  COMMAND_PALETTE_SHORTCUT,
  KEYBOARD_REFERENCE,
  KEYBOARD_REFERENCE_SHORTCUT,
  availablePaletteCommands,
  filterPaletteCommands,
  type CommandAction,
  type CommandDefinition,
} from "./lib/command-palette";

const pendingLauncherKey = "dizy-command-palette-pending-launcher-v1";
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

type Launcher = Extract<CommandAction, { type: "launcher" }>["launcher"];

function editableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [role='textbox']",
    ),
  );
}

function clickSelector(selector: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return false;
  target.click();
  return true;
}

function executeLauncher(launcher: Launcher) {
  if (launcher === "dizybrain") return clickSelector(".dizybrain-launch");
  if (launcher === "layouts") return clickSelector(".workspace-layout-trigger");
  if (launcher === "start-here") {
    return clickSelector(".first-run-onboarding-trigger");
  }
  const panel = document.getElementById("manual-paper-panel");
  const reopen = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent?.trim() === "Open Manual Paper");
  if (!panel && !reopen) return false;
  window.dispatchEvent(new Event("manual-paper-open"));
  window.setTimeout(
    () => document.getElementById("manual-paper-panel")?.focus(),
    0,
  );
  return true;
}

export function CommandPalette() {
  const pathname = usePathname();
  const active = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"commands" | "reference">("commands");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [owner, setOwner] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setOwner(false);
    void fetch("/api/profile", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { user?: { role?: string } })
          : null,
      )
      .then((profile) => {
        if (!controller.signal.aborted) {
          setOwner(Boolean(profile?.user && profile.user.role !== "viewer"));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setOwner(false);
      });
    return () => controller.abort();
  }, [active, pathname]);

  const commands = useMemo(() => availablePaletteCommands(owner), [owner]);
  const filtered = useMemo(
    () => filterPaletteCommands(commands, query),
    [commands, query],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelected(0);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const showCommands = useCallback(() => {
    setMode("commands");
    setQuery("");
    setSelected(0);
    setOpen(true);
  }, []);

  const showReference = useCallback(() => {
    setMode("reference");
    setOpen(true);
  }, []);

  const run = useCallback(
    (command: CommandDefinition) => {
      const action = command.action;
      setOpen(false);
      setQuery("");
      setSelected(0);
      if (action.type === "navigate") {
        window.location.assign(action.href);
        return;
      }
      if (action.type === "reload") {
        window.location.reload();
        return;
      }
      if (action.type === "reference") {
        setMode("reference");
        setOpen(true);
        return;
      }
      if (pathname === "/terminal" && executeLauncher(action.launcher)) return;
      sessionStorage.setItem(pendingLauncherKey, action.launcher);
      window.location.assign("/terminal");
    },
    [pathname],
  );

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        showCommands();
        return;
      }
      const referenceKey =
        event.key === "?" || (event.key === "/" && event.shiftKey);
      if (
        referenceKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !editableTarget(event.target)
      ) {
        event.preventDefault();
        showReference();
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, close, open, showCommands, showReference]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (mode === "commands") searchRef.current?.focus();
      else dialogRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode, open]);

  useEffect(() => {
    setSelected((value) =>
      Math.min(value, Math.max(0, filtered.length - 1)),
    );
  }, [filtered.length]);

  useEffect(() => {
    if (!active || pathname !== "/terminal") return;
    const pending = sessionStorage.getItem(
      pendingLauncherKey,
    ) as Launcher | null;
    if (!pending) return;
    const launch = () => {
      if (!executeLauncher(pending)) return false;
      sessionStorage.removeItem(pendingLauncherKey);
      return true;
    };
    if (launch()) return;
    const observer = new MutationObserver(() => {
      if (launch()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      sessionStorage.removeItem(pendingLauncherKey);
    }, 15_000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [active, pathname]);

  if (!active) return null;

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        className="command-palette-trigger command-palette-floating"
        onClick={showCommands}
        ref={triggerRef}
        title={`Open commands · ${COMMAND_PALETTE_SHORTCUT}`}
        type="button"
      >
        <span aria-hidden="true">⌘</span> Commands <kbd>⌘K</kbd>
      </button>
      {open
        ? createPortal(
            <div className="command-palette-backdrop">
              <section
                aria-label={
                  mode === "commands"
                    ? "DizyTrades command palette"
                    : "DizyTrades keyboard reference"
                }
                aria-modal="true"
                className="command-palette-dialog"
                ref={dialogRef}
                role="dialog"
                tabIndex={-1}
              >
                <header>
                  <div>
                    <span>
                      {mode === "commands"
                        ? "COMMAND PALETTE"
                        : "KEYBOARD REFERENCE"}
                    </span>
                    <strong>
                      {mode === "commands"
                        ? "Go anywhere without hunting through the terminal."
                        : "Verified controls only."}
                    </strong>
                  </div>
                  <button
                    aria-label="Close command palette"
                    onClick={close}
                    type="button"
                  >
                    ×
                  </button>
                </header>

                <nav aria-label="Command palette modes">
                  <button
                    aria-current={mode === "commands"}
                    onClick={showCommands}
                    type="button"
                  >
                    Commands
                  </button>
                  <button
                    aria-current={mode === "reference"}
                    onClick={showReference}
                    type="button"
                  >
                    Keyboard reference
                  </button>
                </nav>

                {mode === "commands" ? (
                  <>
                    <div className="command-palette-search">
                      <span aria-hidden="true">⌕</span>
                      <input
                        aria-activedescendant={
                          filtered[selected]
                            ? `command-option-${filtered[selected].id}`
                            : undefined
                        }
                        aria-autocomplete="list"
                        aria-controls="command-palette-results"
                        aria-expanded="true"
                        aria-label="Search commands"
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setSelected(0);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setSelected((value) =>
                              filtered.length
                                ? (value + 1) % filtered.length
                                : 0,
                            );
                          } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setSelected((value) =>
                              filtered.length
                                ? (value - 1 + filtered.length) %
                                  filtered.length
                                : 0,
                            );
                          } else if (
                            event.key === "Enter" &&
                            filtered[selected]
                          ) {
                            event.preventDefault();
                            run(filtered[selected]);
                          }
                        }}
                        placeholder="Search charts, scanner, journal, DizyBrain…"
                        ref={searchRef}
                        role="combobox"
                        value={query}
                      />
                      <kbd>ESC</kbd>
                    </div>
                    <div
                      className="command-palette-results"
                      id="command-palette-results"
                      role="listbox"
                    >
                      {filtered.length ? (
                        filtered.map((command, index) => (
                          <button
                            aria-selected={index === selected}
                            className={index === selected ? "selected" : ""}
                            id={`command-option-${command.id}`}
                            key={command.id}
                            onClick={() => run(command)}
                            onMouseMove={() => setSelected(index)}
                            role="option"
                            type="button"
                          >
                            <span>
                              <b>{command.title}</b>
                              <small>{command.description}</small>
                            </span>
                            <em>{command.category}</em>
                          </button>
                        ))
                      ) : (
                        <p className="command-palette-empty">
                          No command matches that search.
                        </p>
                      )}
                    </div>
                    <footer>
                      <span>
                        <kbd>↑</kbd>
                        <kbd>↓</kbd> select
                      </span>
                      <span>
                        <kbd>ENTER</kbd> run
                      </span>
                      <span>
                        {owner
                          ? "Owner commands available"
                          : "Viewer-safe commands"}
                      </span>
                    </footer>
                  </>
                ) : (
                  <div className="keyboard-reference-list">
                    {KEYBOARD_REFERENCE.map((item) => (
                      <div key={item.keys}>
                        <kbd>{item.keys}</kbd>
                        <span>{item.action}</span>
                      </div>
                    ))}
                    <p>
                      Shortcuts are disabled while typing in normal form fields,
                      except <b>{COMMAND_PALETTE_SHORTCUT}</b>, which always opens
                      the palette. The standalone <b>{KEYBOARD_REFERENCE_SHORTCUT}</b>
                      key opens this reference.
                    </p>
                  </div>
                )}
              </section>
            </div>,
            document.body,
          )
        : null}
      <style jsx global>{`
        .command-palette-trigger {
          color: #d8e5f8;
          border-color: #445d7d;
          background: linear-gradient(180deg, #15243a, #0c1522);
          box-shadow: inset 0 0 12px #78a9e512;
          cursor: pointer;
        }
        .command-palette-trigger kbd {
          margin-left: 5px;
          padding: 1px 5px;
          color: #91a4be;
          border: 1px solid #40516a;
          border-radius: 4px;
          background: #0b111b;
          font-size: 8px;
        }
        .command-palette-trigger:hover,
        .command-palette-trigger:focus-visible {
          color: #fff;
          border-color: #7aafe8;
          box-shadow: 0 0 14px #6daaf02b;
        }
        .command-palette-floating {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 9000;
          min-height: 38px;
          padding: 0 11px;
          border-style: solid;
          border-width: 1px;
          border-radius: 8px;
          font: inherit;
          font-size: 11px;
        }
        .command-palette-backdrop {
          position: fixed;
          z-index: 14000;
          inset: 0;
          display: grid;
          place-items: start center;
          padding: 9vh 20px 30px;
          overflow: auto;
          background: #02050bcc;
          backdrop-filter: blur(8px);
        }
        .command-palette-dialog {
          width: min(720px, 100%);
          overflow: hidden;
          color: #edf3fc;
          border: 1px solid #3a4c66;
          border-radius: 14px;
          outline: none;
          background: linear-gradient(180deg, #111a29, #080d15);
          box-shadow: 0 34px 110px #000d;
        }
        .command-palette-dialog > header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 20px 22px 16px;
          border-bottom: 1px solid #202c3e;
        }
        .command-palette-dialog > header div {
          display: grid;
          gap: 5px;
        }
        .command-palette-dialog > header span {
          color: #78afea;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.16em;
        }
        .command-palette-dialog > header strong {
          font-size: 16px;
        }
        .command-palette-dialog button {
          color: #dce6f5;
          border: 1px solid #354259;
          border-radius: 7px;
          background: #101725;
          font: inherit;
          cursor: pointer;
        }
        .command-palette-dialog > header button {
          width: 32px;
          height: 32px;
          font-size: 19px;
        }
        .command-palette-dialog > nav {
          display: flex;
          gap: 6px;
          padding: 10px 14px;
          border-bottom: 1px solid #202c3e;
        }
        .command-palette-dialog > nav button {
          min-height: 32px;
          padding: 0 10px;
          color: #8e9caf;
          border-color: transparent;
          background: transparent;
          font-size: 10px;
        }
        .command-palette-dialog > nav button[aria-current="true"] {
          color: #fff;
          border-color: #405878;
          background: #17243a;
        }
        .command-palette-search {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 10px;
          margin: 14px;
          padding: 0 12px;
          border: 1px solid #3a4b63;
          border-radius: 9px;
          background: #090f19;
        }
        .command-palette-search input {
          min-height: 46px;
          color: #eef4fd;
          border: 0;
          outline: 0;
          background: transparent;
          font: inherit;
          font-size: 13px;
        }
        .command-palette-search kbd,
        .command-palette-dialog footer kbd {
          padding: 2px 5px;
          color: #8f9cb0;
          border: 1px solid #39475c;
          border-radius: 4px;
          background: #111826;
          font-size: 8px;
        }
        .command-palette-results {
          max-height: min(430px, 52vh);
          overflow: auto;
          padding: 0 8px 8px;
        }
        .command-palette-results > button {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 16px;
          padding: 11px 12px;
          border-color: transparent;
          background: transparent;
          text-align: left;
        }
        .command-palette-results > button.selected,
        .command-palette-results > button:hover {
          border-color: #41658c;
          background: #15243a;
        }
        .command-palette-results > button span {
          display: grid;
          gap: 3px;
        }
        .command-palette-results b {
          font-size: 12px;
        }
        .command-palette-results small {
          color: #8492a7;
          font-size: 10px;
          line-height: 1.4;
        }
        .command-palette-results em {
          color: #6f8199;
          font-size: 9px;
          font-style: normal;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .command-palette-empty {
          padding: 28px;
          color: #8492a7;
          text-align: center;
          font-size: 11px;
        }
        .command-palette-dialog > footer {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 10px 14px;
          color: #718198;
          border-top: 1px solid #202c3e;
          background: #090e16;
          font-size: 9px;
        }
        .command-palette-dialog > footer span {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .command-palette-dialog > footer span:last-child {
          margin-left: auto;
        }
        .keyboard-reference-list {
          display: grid;
          gap: 7px;
          padding: 16px 20px 22px;
        }
        .keyboard-reference-list > div {
          display: grid;
          grid-template-columns: minmax(125px, 180px) 1fr;
          align-items: center;
          gap: 16px;
          padding: 9px 10px;
          border: 1px solid #26354a;
          border-radius: 7px;
          background: #0c131f;
        }
        .keyboard-reference-list kbd {
          color: #b9d7fa;
          font-size: 10px;
          font-weight: 750;
        }
        .keyboard-reference-list span {
          color: #96a4b8;
          font-size: 11px;
        }
        .keyboard-reference-list p {
          margin: 7px 0 0;
          color: #7f8da2;
          font-size: 10px;
          line-height: 1.55;
        }
        .command-palette-dialog button:focus-visible,
        .command-palette-search:focus-within {
          border-color: #79afea;
          outline: 2px solid #68a8ed40;
          outline-offset: 2px;
        }
        @media (max-width: 600px) {
          .command-palette-floating {
            right: 10px;
            bottom: 10px;
          }
          .command-palette-backdrop {
            padding: 18px 10px;
          }
          .command-palette-dialog {
            max-height: calc(100vh - 36px);
          }
          .command-palette-dialog > footer {
            flex-wrap: wrap;
          }
          .command-palette-dialog > footer span:last-child {
            width: 100%;
            margin-left: 0;
          }
          .keyboard-reference-list > div {
            grid-template-columns: 1fr;
            gap: 4px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .command-palette-dialog,
          .command-palette-dialog * {
            animation: none !important;
            transition: none !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </>
  );
}
