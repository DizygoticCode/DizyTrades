"use client";

import { useEffect } from "react";

const scoreFrom = (value: string | null | undefined) => {
  const score = Number(value?.match(/(\d+)\s*\/\s*5/)?.[1] ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : 0;
};

/**
 * Keeps DizyBrain's current setup view focused on the live confluence direction.
 * Historical signals must not be mixed into the current BUY/SELL explanation.
 */
export function DizyBrainSignalContextFix() {
  useEffect(() => {
    let frame = 0;

    const apply = () => {
      frame = 0;
      const panel = document.querySelector<HTMLElement>(".dizybrain-panel");
      if (!panel) return;

      const direction =
        panel
          .querySelector<HTMLElement>(".dizybrain-direction")
          ?.textContent?.trim() || "NEUTRAL";
      const confluenceHeading = [
        ...panel.querySelectorAll<HTMLElement>(".dizybrain-section-title"),
      ].find((heading) => heading.textContent?.includes("Confluence"));
      const activeScore = scoreFrom(
        confluenceHeading?.querySelector("strong")?.textContent,
      );

      const summaryDetail = panel.querySelector<HTMLElement>(
        ".dizybrain-summary > div > span",
      );
      if (summaryDetail) {
        summaryDetail.textContent = `${direction}-leaning current setup`;
      }

      for (const item of panel.querySelectorAll<HTMLElement>(
        ".dizybrain-checks li",
      )) {
        if (/confirmed-candle signal context/i.test(item.textContent || "")) {
          const marker = item.querySelector("b")?.outerHTML || "<b>✓</b>";
          item.innerHTML = `${marker}Current confirmed-candle context available`;
        }
      }

      const timelineItems = [
        ...panel.querySelectorAll<HTMLElement>(".dizybrain-timeline li"),
      ];
      const confluenceItem = timelineItems.find(
        (item) => item.querySelector("b")?.textContent === "Confluence build",
      );
      if (confluenceItem) {
        const label = confluenceItem.querySelector("b");
        const detail = confluenceItem.querySelector("span");
        if (label) label.textContent = "Current confluence";
        if (detail)
          detail.textContent = `${activeScore} of 5 current confluence inputs`;
        confluenceItem.classList.remove("complete", "waiting");
        confluenceItem.classList.add(activeScore > 0 ? "active" : "waiting");
        const icon = confluenceItem.querySelector("i");
        if (icon) icon.textContent = activeScore > 0 ? "•" : "·";
      }

      const signalItem = timelineItems.find((item) =>
        /confirmed signal|last confirmed signal/i.test(
          item.querySelector("b")?.textContent || "",
        ),
      );
      if (signalItem) {
        const label = signalItem.querySelector("b");
        const detail = signalItem.querySelector("span");
        if (label) label.textContent = "Current setup direction";
        if (detail) detail.textContent = `${direction}-leaning`;
        signalItem.classList.remove("waiting");
        signalItem.classList.add(activeScore > 0 ? "complete" : "active");
        const icon = signalItem.querySelector("i");
        if (icon) icon.textContent = activeScore > 0 ? "✓" : "•";
      }

      const result = panel.querySelector<HTMLElement>(
        ".dizybrain-rejections",
      );
      if (result) {
        const title = result.querySelector<HTMLElement>(
          ".dizybrain-section-title span",
        );
        const list = result.querySelector("ul");
        list?.querySelectorAll("li").forEach((item) => {
          if (
            /qualification threshold|confirmed-candle signal/i.test(
              item.textContent || "",
            )
          )
            item.remove();
        });

        const qualified = result.querySelector<HTMLElement>(
          ".dizybrain-qualified span",
        );
        if (qualified)
          qualified.textContent = `${direction}-leaning current setup with ${activeScore}/5 confluence. Historical signals are intentionally excluded from this view.`;

        let note = result.querySelector<HTMLElement>(
          ".dizybrain-context-note",
        );
        if (!note) {
          note = document.createElement("div");
          note.className = "dizybrain-context-note";
          result.append(note);
        }
        note.textContent = `Current setup: ${direction}-leaning at ${activeScore}/5. Qualification is not inferred until DizyBrain receives the active strategy threshold directly.`;

        const remaining = list?.querySelectorAll("li").length ?? 0;
        if (title)
          title.textContent = remaining
            ? "Unavailable current context"
            : "Current setup status";
        if (list) list.toggleAttribute("hidden", remaining === 0);
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    schedule();
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <style jsx global>{`
      .dizybrain-context-note {
        padding: 9px;
        border: 1px solid #21414a;
        border-radius: 8px;
        background: #091419;
        color: #9bb3b7;
        line-height: 1.45;
      }
    `}</style>
  );
}
