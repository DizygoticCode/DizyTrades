"use client";

import { useEffect } from "react";

const ATTRIBUTE = "data-dizybrain-tool-offset";
const PROPERTY = "--dizybrain-global-tool-offset";

function visibleDizyBrainSurface() {
  const workspace = document.getElementById("dizybrain-workspace");
  if (workspace instanceof HTMLElement && workspace.getClientRects().length) {
    return workspace;
  }
  const rail = document.querySelector<HTMLElement>(".dizybrain-rail");
  return rail && rail.getClientRects().length ? rail : null;
}

export function DizyBrainGlobalToolOffset() {
  useEffect(() => {
    const body = document.body;
    let observed: HTMLElement | null = null;
    const resizeObserver = new ResizeObserver(() => update());

    const clear = () => {
      body.removeAttribute(ATTRIBUTE);
      body.style.removeProperty(PROPERTY);
    };

    const update = () => {
      const surface = visibleDizyBrainSurface();
      if (surface !== observed) {
        resizeObserver.disconnect();
        observed = surface;
        if (surface) resizeObserver.observe(surface);
      }
      if (!surface) {
        clear();
        return;
      }
      const bounds = surface.getBoundingClientRect();
      const reserved = Math.max(0, Math.ceil(window.innerWidth - bounds.left));
      const next = `${reserved}px`;
      if (body.style.getPropertyValue(PROPERTY) !== next) {
        body.style.setProperty(PROPERTY, next);
      }
      if (body.getAttribute(ATTRIBUTE) !== "true") {
        body.setAttribute(ATTRIBUTE, "true");
      }
    };

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(body, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    update();

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
      clear();
    };
  }, []);

  return null;
}
