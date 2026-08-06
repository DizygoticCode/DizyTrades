"use client";

import { useEffect } from "react";

export function DizyBrainRouteLauncher() {
  useEffect(() => {
    if (window.location.hash !== "#dizybrain") return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const launcher = document.querySelector<HTMLButtonElement>(".dizybrain-launch");
      if (launcher) {
        launcher.click();
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        window.clearInterval(timer);
      } else if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, []);

  return null;
}
