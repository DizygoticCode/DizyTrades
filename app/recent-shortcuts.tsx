"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { UserTerminalSettings } from "./lib/config";
import type { JournalListItem } from "./lib/journal-model";
import {
  recentMarketFromSettings,
  sanitiseRecentMarketShortcuts,
  type RecentMarketShortcut,
} from "./lib/recent-shortcuts";
import { readAcademyLastLesson } from "./school/academy-recent";

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
const viewerRecentKey = "dizy-viewer-recent-markets-v1";

type LearningShortcut = Readonly<{
  slug: string;
  title: string;
  label: string;
}>;

type LoadedState = Readonly<{
  owner: boolean;
  settings: UserTerminalSettings;
  markets: readonly RecentMarketShortcut[];
  reviews: readonly JournalListItem[];
  learning: readonly LearningShortcut[];
}>;

function readViewerMarket(settings: UserTerminalSettings) {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem("dizy-viewer-market") ?? "null",
    ) as Partial<UserTerminalSettings["market"]> | null;
    return parsed ? { ...settings.market, ...parsed } : settings.market;
  } catch {
    window.sessionStorage.removeItem("dizy-viewer-market");
    return settings.market;
  }
}

function readViewerRecents() {
  try {
    return sanitiseRecentMarketShortcuts(
      JSON.parse(window.localStorage.getItem(viewerRecentKey) ?? "[]"),
    );
  } catch {
    window.localStorage.removeItem(viewerRecentKey);
    return Object.freeze([]);
  }
}

function retainViewerRecent(shortcut: RecentMarketShortcut) {
  const next = sanitiseRecentMarketShortcuts([
    shortcut,
    ...readViewerRecents().filter(
      (candidate) => candidate.marketKey !== shortcut.marketKey,
    ),
  ]);
  window.localStorage.setItem(viewerRecentKey, JSON.stringify(next));
  return next;
}

function displaySymbol(symbol: string) {
  return symbol.replace(/_+/g, "/");
}

function reviewTitle(review: JournalListItem) {
  if (review.title.trim()) return review.title;
  if (review.trade) return `${review.trade.symbol} trade review`;
  if (review.marketContext) return `${review.marketContext.symbol} market note`;
  return "Journal entry";
}

export function RecentShortcuts() {
  const pathname = usePathname();
  const active = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Open Recent to load your current shortcuts.");
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setStatus("Loading recent markets, reviews and Academy progress…");
    try {
      const [profileResponse, recentResponse, journalResponse, academy] =
        await Promise.all([
          fetch("/api/profile", { cache: "no-store" }),
          fetch("/api/recent-shortcuts", { cache: "no-store" }),
          fetch("/api/journal", { cache: "no-store" }),
          import("./school/academy-catalogue"),
        ]);
      const profile = (await profileResponse.json()) as {
        user?: { role?: string };
        settings?: UserTerminalSettings;
        error?: string;
      };
      if (!profileResponse.ok || !profile.settings || !profile.user) {
        throw new Error(profile.error ?? "Profile shortcuts could not be loaded.");
      }
      const owner = profile.user.role !== "viewer";
      const recentBody = recentResponse.ok
        ? ((await recentResponse.json()) as {
            markets?: RecentMarketShortcut[];
          })
        : { markets: [] };
      const journalBody = journalResponse.ok
        ? ((await journalResponse.json()) as { entries?: JournalListItem[] })
        : { entries: [] };

      const currentMarket = owner
        ? profile.settings.market
        : readViewerMarket(profile.settings);
      const currentShortcut = recentMarketFromSettings(currentMarket);
      let markets = owner
        ? sanitiseRecentMarketShortcuts(recentBody.markets ?? [])
        : readViewerRecents();
      if (currentShortcut) {
        markets = owner
          ? sanitiseRecentMarketShortcuts([
              currentShortcut,
              ...markets.filter(
                (candidate) =>
                  candidate.marketKey !== currentShortcut.marketKey,
              ),
            ])
          : retainViewerRecent(currentShortcut);
      }

      const validSlugs = academy.academyLessons.map((lesson) => lesson.slug);
      const completed = academy.readAcademyProgress(window.localStorage);
      const lastSlug = readAcademyLastLesson(
        window.localStorage,
        validSlugs,
      );
      const last = academy.academyLessons.find(
        (lesson) => lesson.slug === lastSlug,
      );
      const next = academy.academyLessons.find(
        (lesson) => !completed.includes(lesson.slug),
      );
      const latestCompleted = [...completed]
        .reverse()
        .map((slug) => academy.academyLessons.find((lesson) => lesson.slug === slug))
        .find(Boolean);
      const learningCandidates: LearningShortcut[] = [];
      if (last) {
        learningCandidates.push({
          slug: last.slug,
          title: last.title,
          label: completed.includes(last.slug)
            ? "Review last lesson"
            : "Continue last lesson",
        });
      }
      if (next && !learningCandidates.some((item) => item.slug === next.slug)) {
        learningCandidates.push({
          slug: next.slug,
          title: next.title,
          label: "Next incomplete lesson",
        });
      }
      if (
        latestCompleted &&
        !learningCandidates.some((item) => item.slug === latestCompleted.slug)
      ) {
        learningCandidates.push({
          slug: latestCompleted.slug,
          title: latestCompleted.title,
          label: "Recently completed",
        });
      }

      setLoaded({
        owner,
        settings: profile.settings,
        markets,
        reviews: (journalBody.entries ?? []).slice(0, 5),
        learning: learningCandidates.slice(0, 3),
      });
      setStatus("Recent shortcuts are current for this account and browser.");
    } catch (reason) {
      setStatus(
        reason instanceof Error
          ? reason.message
          : "Recent shortcuts could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openMarket = async (market: RecentMarketShortcut) => {
    if (!loaded) return;
    setBusy(true);
    setStatus(`Opening ${displaySymbol(market.symbol)} ${market.timeframe}…`);
    try {
      if (loaded.owner) {
        const response = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            symbol: market.symbol,
            marketKey: market.marketKey,
            timeframe: market.timeframe,
          }),
        });
        if (!response.ok) throw new Error("Recent market settings were not saved.");
      } else {
        const current = readViewerMarket(loaded.settings);
        window.sessionStorage.setItem(
          "dizy-viewer-market",
          JSON.stringify({
            ...current,
            symbol: market.symbol,
            marketKey: market.marketKey,
            timeframe: market.timeframe,
          }),
        );
        retainViewerRecent({ ...market, visitedAt: new Date().toISOString() });
      }
      window.location.assign("/terminal");
    } catch (reason) {
      setStatus(
        reason instanceof Error ? reason.message : "Recent market could not be opened.",
      );
      setBusy(false);
    }
  };

  const marketItems = useMemo(() => loaded?.markets.slice(0, 6) ?? [], [loaded]);

  if (!active) return null;

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="recent-shortcuts-trigger"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        title="Open recent markets, reviews and learning"
        type="button"
      >
        <span aria-hidden="true">↶</span> Recent
      </button>
      {open
        ? createPortal(
            <div className="recent-shortcuts-backdrop">
              <section
                aria-label="DizyTrades recent shortcuts"
                aria-modal="true"
                className="recent-shortcuts-dialog"
                ref={dialogRef}
                role="dialog"
                tabIndex={-1}
              >
                <header>
                  <div>
                    <span>RECENT WORKFLOW</span>
                    <h1>Continue where the evidence chain left off.</h1>
                    <p>
                      Markets follow your account or viewer session, Journal reviews
                      remain newest-first, and Academy continuation stays in this browser.
                    </p>
                  </div>
                  <button
                    aria-label="Close recent shortcuts"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    ×
                  </button>
                </header>

                <div className="recent-shortcuts-grid" aria-busy={busy}>
                  <section>
                    <header>
                      <span>MARKETS</span>
                      <b>Recent chart contexts</b>
                    </header>
                    {marketItems.length ? (
                      marketItems.map((market) => (
                        <button
                          disabled={busy}
                          key={`${market.marketKey}:${market.timeframe}`}
                          onClick={() => void openMarket(market)}
                          type="button"
                        >
                          <span>
                            <b>{displaySymbol(market.symbol)}</b>
                            <small>
                              {market.marketType} · {market.timeframe} · {market.exchange}
                            </small>
                          </span>
                          <time>{new Date(market.visitedAt).toLocaleDateString()}</time>
                        </button>
                      ))
                    ) : (
                      <p>No recent markets have been retained yet.</p>
                    )}
                  </section>

                  <section>
                    <header>
                      <span>REVIEWS</span>
                      <b>Newest Journal evidence</b>
                    </header>
                    {loaded?.reviews.length ? (
                      loaded.reviews.map((review) => (
                        <a href={`/journal?entry=${encodeURIComponent(review.id)}`} key={review.id}>
                          <span>
                            <b>{reviewTitle(review)}</b>
                            <small>
                              {review.type.replaceAll("-", " ")}
                              {review.trade ? ` · ${review.trade.symbol}` : ""}
                            </small>
                          </span>
                          <time>{new Date(review.createdAt).toLocaleDateString()}</time>
                        </a>
                      ))
                    ) : (
                      <p>No Journal reviews are available.</p>
                    )}
                  </section>

                  <section>
                    <header>
                      <span>LEARNING</span>
                      <b>DizyAcademy continuation</b>
                    </header>
                    {loaded?.learning.length ? (
                      loaded.learning.map((lesson) => (
                        <a
                          href={`/school?lesson=${encodeURIComponent(lesson.slug)}`}
                          key={lesson.slug}
                        >
                          <span>
                            <b>{lesson.title}</b>
                            <small>{lesson.label}</small>
                          </span>
                          <em>Open →</em>
                        </a>
                      ))
                    ) : (
                      <p>Open DizyAcademy to begin a learning path.</p>
                    )}
                  </section>
                </div>
                <footer role="status" aria-live="polite">
                  {status}
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
      <style jsx global>{`
        .recent-shortcuts-trigger {
          position: fixed;
          top: 118px;
          right: 12px;
          z-index: 8999;
          min-height: 34px;
          padding: 0 10px;
          color: #cae9dc;
          border: 1px solid #3b6b5e;
          border-radius: 8px;
          background: linear-gradient(180deg, #133027, #0b1a16);
          font: inherit;
          font-size: 10px;
          cursor: pointer;
        }
        .recent-shortcuts-trigger:hover,
        .recent-shortcuts-trigger:focus-visible {
          color: #fff;
          border-color: #68c3a9;
          outline: 2px solid #5bc4a63b;
          outline-offset: 2px;
        }
        .recent-shortcuts-backdrop {
          position: fixed;
          z-index: 14100;
          inset: 0;
          display: grid;
          place-items: start center;
          padding: 8vh 20px 30px;
          overflow: auto;
          background: #02050bcc;
          backdrop-filter: blur(8px);
        }
        .recent-shortcuts-dialog {
          width: min(1040px, 100%);
          color: #eef4fb;
          border: 1px solid #385165;
          border-radius: 14px;
          outline: none;
          background: linear-gradient(180deg, #101b24, #080d12);
          box-shadow: 0 34px 110px #000d;
        }
        .recent-shortcuts-dialog > header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          padding: 25px 28px 19px;
          border-bottom: 1px solid #21303d;
        }
        .recent-shortcuts-dialog > header span,
        .recent-shortcuts-grid section > header span {
          color: #66c6aa;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.15em;
        }
        .recent-shortcuts-dialog h1 {
          margin: 7px 0;
          font-size: clamp(24px, 4vw, 37px);
          letter-spacing: -0.035em;
        }
        .recent-shortcuts-dialog > header p {
          max-width: 740px;
          margin: 0;
          color: #91a0b2;
          font-size: 11px;
          line-height: 1.55;
        }
        .recent-shortcuts-dialog > header button {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          color: #b7c5d3;
          border: 1px solid #364b5e;
          border-radius: 7px;
          background: #101a22;
          font-size: 19px;
          cursor: pointer;
        }
        .recent-shortcuts-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding: 18px;
        }
        .recent-shortcuts-grid > section {
          min-width: 0;
          padding: 13px;
          border: 1px solid #263a49;
          border-radius: 10px;
          background: #0c141b;
        }
        .recent-shortcuts-grid section > header {
          display: grid;
          gap: 4px;
          padding: 2px 3px 11px;
        }
        .recent-shortcuts-grid section > header b {
          font-size: 13px;
        }
        .recent-shortcuts-grid section > button,
        .recent-shortcuts-grid section > a {
          width: 100%;
          min-height: 57px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 10px;
          margin-top: 6px;
          padding: 9px 10px;
          color: #dfe9f5;
          border: 1px solid #2c4050;
          border-radius: 7px;
          background: #101b24;
          font: inherit;
          text-align: left;
          text-decoration: none;
          cursor: pointer;
        }
        .recent-shortcuts-grid section > button:disabled {
          opacity: 0.55;
          cursor: progress;
        }
        .recent-shortcuts-grid section > button:hover:not(:disabled),
        .recent-shortcuts-grid section > button:focus-visible,
        .recent-shortcuts-grid section > a:hover,
        .recent-shortcuts-grid section > a:focus-visible,
        .recent-shortcuts-dialog > header button:focus-visible {
          border-color: #65bda4;
          outline: 2px solid #5ac3a43b;
          outline-offset: 2px;
        }
        .recent-shortcuts-grid section > button span,
        .recent-shortcuts-grid section > a span {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .recent-shortcuts-grid section > button b,
        .recent-shortcuts-grid section > a b {
          overflow: hidden;
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .recent-shortcuts-grid small,
        .recent-shortcuts-grid time,
        .recent-shortcuts-grid em {
          color: #7f91a3;
          font-size: 9px;
          font-style: normal;
        }
        .recent-shortcuts-grid section > p {
          margin: 6px 0 0;
          padding: 22px 10px;
          color: #718294;
          border: 1px dashed #314655;
          border-radius: 7px;
          font-size: 10px;
          text-align: center;
        }
        .recent-shortcuts-dialog > footer {
          padding: 11px 18px;
          color: #8192a3;
          border-top: 1px solid #21303d;
          background: #091016;
          font-size: 10px;
        }
        @media (max-width: 800px) {
          .recent-shortcuts-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 600px) {
          .recent-shortcuts-trigger {
            top: 106px;
            right: 8px;
          }
          .recent-shortcuts-backdrop {
            padding: 12px 8px;
          }
          .recent-shortcuts-dialog {
            max-height: calc(100vh - 24px);
            overflow: auto;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .recent-shortcuts-dialog,
          .recent-shortcuts-dialog * {
            animation: none !important;
            transition: none !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </>
  );
}
