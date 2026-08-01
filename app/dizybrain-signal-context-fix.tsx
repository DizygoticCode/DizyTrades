"use client";

import { useEffect } from "react";

const scoreFrom = (value: string | null | undefined) => {
  const score = Number(value?.match(/(\d+)\s*\/\s*5/)?.[1] ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : 0;
};

/**
 * Compatibility correction for the first DizyBrain release.
 *
 * The original panel combined current confluence direction with the most recent
 * historical signal and also invented a fixed 4/5 qualification threshold.
 * Until DizyBrain receives typed engine data directly, this guard keeps those
 * concepts separate and refuses to infer qualification from an unknown rule.
 */
export function DizyBrainSignalContextFix() {
  useEffect(() => {
    let frame = 0;

    const apply = () => {
      frame = 0;
      const panel = document.querySelector<HTMLElement>(".dizybrain-panel");
      if (!panel) return;

      const direction = panel.querySelector<HTMLElement>(".dizybrain-direction")?.textContent?.trim() || "NEUTRAL";
      const confluenceHeading = [...panel.querySelectorAll<HTMLElement>(".dizybrain-section-title")]
        .find((heading) => heading.textContent?.includes("Confluence"));
      const activeScore = scoreFrom(confluenceHeading?.querySelector("strong")?.textContent);

      const summaryDetail = panel.querySelector<HTMLElement>(".dizybrain-summary > div > span");
      if (summaryDetail) {
        const raw = summaryDetail.dataset.lastConfirmed || summaryDetail.textContent?.trim() || "No confirmed signal yet";
        summaryDetail.dataset.lastConfirmed = raw.replace(/^Last confirmed signal:\s*/i, "");
        const next = `Current setup: ${direction}-leaning · Last confirmed signal: ${summaryDetail.dataset.lastConfirmed}`;
        if (summaryDetail.textContent !== next) summaryDetail.textContent = next;
      }

      for (const item of panel.querySelectorAll<HTMLElement>(".dizybrain-checks li")) {
        if (/confirmed-candle signal context/i.test(item.textContent || "")) {
          const marker = item.querySelector("b")?.outerHTML || "<b>✓</b>";
          const next = `${marker}Historical confirmed signal available`;
          if (item.innerHTML !== next) item.innerHTML = next;
        }
      }

      const timelineItems = [...panel.querySelectorAll<HTMLElement>(".dizybrain-timeline li")];
      const confluenceItem = timelineItems.find((item) => item.querySelector("b")?.textContent === "Confluence build");
      if (confluenceItem) {
        const label = confluenceItem.querySelector("b");
        const detail = confluenceItem.querySelector("span");
        if (label) label.textContent = "Current confluence";
        if (detail) detail.textContent = `${activeScore} of 5 current confluence inputs`;
        confluenceItem.classList.remove("complete", "waiting");
        confluenceItem.classList.add(activeScore > 0 ? "active" : "waiting");
        const icon = confluenceItem.querySelector("i");
        if (icon) icon.textContent = activeScore > 0 ? "•" : "·";
      }

      const signalItem = timelineItems.find((item) => item.querySelector("b")?.textContent === "Confirmed signal");
      if (signalItem) {
        const label = signalItem.querySelector("b");
        const detail = signalItem.querySelector("span");
        if (label) label.textContent = "Last confirmed signal";
        if (detail && !/^Historical:/i.test(detail.textContent || "")) detail.textContent = `Historical: ${detail.textContent}`;
      }

      const result = panel.querySelector<HTMLElement>(".dizybrain-rejections");
      if (result) {
        const title = result.querySelector<HTMLElement>(".dizybrain-section-title span");
        const list = result.querySelector("ul");
        list?.querySelectorAll("li").forEach((item) => {
          if (/qualification threshold/i.test(item.textContent || "")) item.remove();
        });

        let note = result.querySelector<HTMLElement>(".dizybrain-context-note");
        if (!note) {
          note = document.createElement("div");
          note.className = "dizybrain-context-note";
          result.append(note);
        }
        note.textContent = `Current setup is ${direction}-leaning at ${activeScore}/5. Qualification is not inferred because DizyBrain does not yet receive the active strategy threshold directly.`;

        const remaining = list?.querySelectorAll("li").length ?? 0;
        if (title) title.textContent = remaining ? "Unavailable current context" : "Current setup status";
        if (list) list.toggleAttribute("hidden", remaining === 0);
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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
