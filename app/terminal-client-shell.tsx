"use client";

import { useEffect } from "react";
import type { AuthUser } from "./lib/auth";
import TradingTerminal from "./trading-terminal";

const TERMINAL_HYDRATED_EVENT = "dizy-terminal-hydrated";

export function TerminalClientShell({ user }: { user: AuthUser }) {
  useEffect(() => {
    document.body.dataset.dizyTerminalHydrated = "true";
    window.dispatchEvent(new Event(TERMINAL_HYDRATED_EVENT));

    const account = user.role === "viewer"
      ? null
      : document.querySelector<HTMLElement>(".account-switch.static-account");
    const openProfile = () => window.location.assign("/account/profile");
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openProfile();
    };
    if (account) {
      account.setAttribute("role", "link");
      account.setAttribute("tabindex", "0");
      account.setAttribute("aria-label", `${user.name} account profile`);
      account.setAttribute("title", "Open your DizyTrades profile");
      account.style.cursor = "pointer";
      account.addEventListener("click", openProfile);
      account.addEventListener("keydown", keydown);
    }

    return () => {
      if (account) {
        account.removeEventListener("click", openProfile);
        account.removeEventListener("keydown", keydown);
      }
      delete document.body.dataset.dizyTerminalHydrated;
      window.dispatchEvent(new Event(TERMINAL_HYDRATED_EVENT));
    };
  }, [user.name, user.role]);

  return <TradingTerminal user={user} />;
}
