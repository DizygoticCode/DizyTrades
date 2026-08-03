"use client";

import { useEffect } from "react";
import {
  readAcademyLastLesson,
  writeAcademyLastLesson,
} from "./academy-recent";

const activeLessonButton = () =>
  document.querySelector<HTMLButtonElement>(
    '#course-navigation button[aria-current="page"]',
  );

export default function AcademyRecentTracker() {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    void import("./academy-catalogue").then(({ academyLessons }) => {
      if (cancelled) return;
      const validSlugs = academyLessons.map((lesson) => lesson.slug);
      const requested = new URLSearchParams(window.location.search).get("lesson");
      let pendingSlug =
        requested && validSlugs.includes(requested)
          ? requested
          : readAcademyLastLesson(window.localStorage, validSlugs);

      const selectRequested = () => {
        if (!pendingSlug) return true;
        const lesson = academyLessons.find((item) => item.slug === pendingSlug);
        if (!lesson) {
          pendingSlug = null;
          return true;
        }
        const button = Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            "#course-navigation button",
          ),
        ).find((candidate) => candidate.textContent?.includes(lesson.title));
        if (!button) return false;
        if (button.getAttribute("aria-current") !== "page") button.click();
        pendingSlug = null;
        return true;
      };

      const retainActive = () => {
        const button = activeLessonButton();
        const title = button?.textContent?.replace(/^✓|^\d+/, "").trim();
        if (!title) return;
        const lesson = academyLessons.find((item) => item.title === title);
        if (!lesson) return;
        writeAcademyLastLesson(window.localStorage, lesson.slug, validSlugs);
        const url = new URL(window.location.href);
        if (url.searchParams.get("lesson") !== lesson.slug) {
          url.searchParams.set("lesson", lesson.slug);
          window.history.replaceState(null, "", url);
        }
      };

      const attempt = () => {
        if (selectRequested()) retainActive();
      };
      attempt();
      observer = new MutationObserver(() => {
        attempt();
        retainActive();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-current"],
      });
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);
  return null;
}
