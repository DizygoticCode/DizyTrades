"use client";

import { useEffect } from "react";
import type { AuthUser } from "./lib/auth";
import TradingTerminal from "./trading-terminal";

const TERMINAL_HYDRATED_EVENT = "dizy-terminal-hydrated";

export function TerminalClientShell({ user }: { user: AuthUser }) {
  useEffect(() => {
    document.body.dataset.dizyTerminalHydrated = "true";
    window.dispatchEvent(new Event(TERMINAL_HYDRATED_EVENT));

    return () => {
      delete document.body.dataset.dizyTerminalHydrated;
      window.dispatchEvent(new Event(TERMINAL_HYDRATED_EVENT));
    };
  }, []);

  return <TradingTerminal user={user} />;
}
