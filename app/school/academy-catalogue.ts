import {
  academyGlossary as existingGlossary,
  academyLessonGroups as existingGroups,
  academyLessons as existingLessons,
  type AcademyGroup,
  type AcademyLesson,
} from "./academy-extension";
import { pendingOrderAcademyLessons } from "./pending-order-academy";

export type CurrentAcademyGroup = AcademyGroup | "Current DizyTrades Workflow";
export type CurrentAcademyLesson = Omit<AcademyLesson, "group"> & {
  group: CurrentAcademyGroup;
};

const group: CurrentAcademyGroup = "Current DizyTrades Workflow";

const workflowLessons: CurrentAcademyLesson[] = [
  {
    slug: "dizy-workflow-overview",
    title: "The complete DizyTrades research loop",
    group,
    summary: "Move from market discovery to context, simulation, replay, review and measurable improvement.",
    diagram: "flow",
    sections: [
      {
        heading: "One connected evidence chain",
        paragraphs: [
          "DizyScanner finds candidates, DizyStructure establishes closed-candle context, DizyCharts and DizySignals organise the setup, DizyPaper simulates execution, and Journal, Replay, Behaviour and Performance support review.",
        ],
        bullets: [
          "Discovery is not confirmation.",
          "Structure is context, not prediction.",
          "A signal describes configured evidence that qualified after candle close.",
          "A profitable result does not prove the decision process was good.",
        ],
      },
      {
        heading: "Recommended order",
        paragraphs: [
          "Choose a market, inspect structure, verify independent evidence, define invalidation and size, simulate the complete plan, then review the exact historical context. Skipping directly to the result removes the evidence needed to improve.",
        ],
      },
    ],
    chartQuery: "workflow",
  },
  {
    slug: "dizyscanner-watchlists",
    title: "DizyScanner and saved watchlists",
    group,
    summary: "Use bounded multi-symbol scanning without treating setup scores as profit probabilities.",
    diagram: "flow",
    sections: [
      {
        heading: "What the scanner measures",
        paragraphs: [
          "DizyScanner reuses the terminal's confirmed-candle DizySignals engine. It displays setup direction, long and short evidence, phase, fresh signal age and available confluence across a bounded market list.",
        ],
        bullets: [
          "Sort rows to prioritise investigation, not conviction.",
          "Signal age describes when evidence qualified, not how long it will persist.",
          "Unavailable history remains unavailable rather than becoming a neutral score.",
        ],
      },
      {
        heading: "Practical watchlist workflow",
        paragraphs: [
          "Keep a focused list of liquid markets you understand. Open promising rows in DizyCharts and reject candidates whose spread, liquidity, structure or invalidation is unsuitable.",
        ],
      },
    ],
    chartQuery: "scanner",
  },
  {
    slug: "dizystructure-workspace",
    title: "DizyStructure: sessions, anchored VWAP and alignment",
    group,
    summary: "Read session levels, anchored value and confirmed swings through explicit evidence boundaries.",
    diagram: "levels",
    sections: [
      {
        heading: "Descriptive structure",
        paragraphs: [
          "DizyStructure combines confirmed swings, UTC session levels, opening ranges, previous-day and previous-week references, anchored VWAP and multi-timeframe DizySignals alignment. These describe location and agreement; they do not reveal hidden intent.",
        ],
        bullets: [
          "Opening ranges require every expected candle.",
          "Previous-period levels require the exact preceding UTC period.",
          "Swing pivots require closed right-side confirmation candles.",
          "Alignment counts only timeframes with available analysis.",
        ],
      },
      {
        heading: "Anchoring responsibly",
        paragraphs: [
          "An anchored VWAP answers a question about average traded value from a chosen event or structure point. Change the anchor only when the analytical question changes, not until the line agrees with a desired trade.",
        ],
      },
    ],
    chartQuery: "structure",
  },
  {
    slug: "dizyreplay-historical-flow",
    title: "DizyReplay and Historical DizyFlow",
    group,
    summary: "Reconstruct decisions candle by candle without contaminating history with current live evidence.",
    diagram: "flow",
    sections: [
      {
        heading: "Replay without future leakage",
        paragraphs: [
          "Replay reveals only the candle prefix available at its cursor. DizySignals and DizyBrain rebuild from that prefix, so lines and explanations appear only when their required evidence exists.",
        ],
        bullets: [
          "One replay clock controls play, pause, stepping and speed.",
          "Viewport following preserves the horizontal zoom span.",
          "Later candles must never influence the current replay step.",
        ],
      },
      {
        heading: "Historical flow limitations",
        paragraphs: [
          "Historical DizyFlow appears only where compact retained samples and events exist. It never substitutes the current DOM, depth or trade stream for missing historical evidence.",
        ],
      },
    ],
    chartQuery: "replay",
  },
  {
    slug: "guided-trade-review",
    title: "Guided Historical Trade Review",
    group,
    summary: "Review context, entry, management and exit while separating process quality from outcome.",
    diagram: "flow",
    sections: [
      {
        heading: "Five review stages",
        paragraphs: [
          "Guided Review organises the immutable Journal trade, Replay reference, Historical DizyFlow and DizyBrain Review into Context, Entry, Management, Exit and Reflection. It writes one marked block into the same Journal notes rather than creating another score.",
        ],
        bullets: [
          "Describe evidence available at the time.",
          "State whether the setup followed the plan.",
          "Compare management with the original rules.",
          "Record one strength and one specific improvement.",
        ],
      },
      {
        heading: "Avoid hindsight editing",
        paragraphs: [
          "Do not rewrite the original thesis to fit the result. Compare the decision with the evidence that existed then, including missing and conflicting inputs.",
        ],
      },
    ],
    chartQuery: "journal",
  },
  {
    slug: "dizyperformance-dashboard",
    title: "DizyPerformance: expectancy, drawdown and coverage",
    group,
    summary: "Interpret realised Journal outcomes honestly, including sample size and missing-data coverage.",
    diagram: "risk",
    sections: [
      {
        heading: "What the dashboard represents",
        paragraphs: [
          "DizyPerformance uses completed Trade Reviews to calculate cumulative realised PnL, drawdown, expectancy, profit factor, payoff ratio, streaks, fees coverage, R distribution and deterministic breakdowns. Reviewed cumulative PnL is not labelled account equity when starting capital is unknown.",
        ],
        bullets: [
          "Win rate requires payoff context.",
          "Profit factor is unstable in tiny samples.",
          "Missing fees or R reduce coverage rather than becoming zero.",
          "Breakdowns describe the reviewed sample and do not prove causation.",
        ],
      },
    ],
    chartQuery: "performance",
  },
  {
    slug: "dizybrain-behaviour",
    title: "DizyBrain Behaviour: recurring process observations",
    group,
    summary: "Use repeated reviewed trades to identify patterns without turning association into prediction.",
    diagram: "risk",
    sections: [
      {
        heading: "Behaviour is review aggregation",
        paragraphs: [
          "The Behaviour engine aggregates deterministic historical reviews. It reports coverage, recurring findings, process-versus-outcome patterns, moods, tags and timing trends without rerunning trades or predicting the next result.",
        ],
        bullets: [
          "Recurring observations need meaningful samples.",
          "Stale, invalid or archived reviews are excluded and counted.",
          "Association is not proof that a mood or tag caused an outcome.",
          "Behaviour findings do not alter DizySignals or risk settings.",
        ],
      },
    ],
    chartQuery: "behaviour",
  },
  {
    slug: "dizyops-diagnostics",
    title: "DizyOps: production health and evidence freshness",
    group,
    summary: "Use the owner/admin workspace to distinguish application, storage and provider health.",
    diagram: "flow",
    sections: [
      {
        heading: "Operational status is layered",
        paragraphs: [
          "DizyOps is restricted to owner and admin accounts. It reports bounded deployment, runtime, storage and audit information. A healthy process does not guarantee every public provider is fresh, and a delayed market feed does not necessarily mean account storage is unavailable.",
        ],
        bullets: [
          "Check deployed commit and runtime identity.",
          "Separate application health from provider freshness.",
          "Treat storage warnings as recovery risks, not market signals.",
          "Normal users and viewers cannot access the page or API.",
        ],
      },
    ],
  },
  {
    slug: "dizybackup-recovery",
    title: "DizyBackup: export, dry-run and additive recovery",
    group,
    summary: "Protect user-owned evidence with integrity-checked exports and conflict-aware recovery.",
    diagram: "flow",
    sections: [
      {
        heading: "What a backup contains",
        paragraphs: [
          "A user-scoped JSON backup can include profile settings, simulator history, Manual Paper, Journal, Replay memories, Historical DizyFlow and DizyBrain reviews. Authentication records, credentials and session tokens are excluded.",
        ],
        bullets: [
          "Journal CSV supports portable outcome analysis.",
          "Every restore begins with a server-validated dry-run.",
          "Integrity hashes bind the reviewed payload to the applied payload.",
          "Recovery is additive and refuses unsafe Manual Paper replacement.",
        ],
      },
      {
        heading: "Recovery discipline",
        paragraphs: [
          "Keep dated copies away from the Render persistent disk. Review every conflict and warning before confirmation. A successful download is not a tested recovery until the dry-run validator accepts it.",
        ],
      },
    ],
  },
];

export const academyLessons: CurrentAcademyLesson[] = [
  ...existingLessons,
  ...pendingOrderAcademyLessons,
  ...workflowLessons,
];

export const academyLessonGroups: CurrentAcademyGroup[] = [
  ...existingGroups,
  group,
];

export const academyGlossary = [
  ...existingGlossary,
  ["Additive recovery", "A restore that preserves existing records and adds only validated non-conflicting data."],
  ["Evidence coverage", "The share of a reviewed sample with authoritative source data for a metric."],
  ["Historical DizyFlow", "Compact retained order-flow evidence captured around an eligible completed paper trade."],
  ["Replay prefix", "Only the candles revealed up to the current historical replay cursor."],
  ["Setup score", "A description of configured evidence, not a probability of profit."],
] as const;

export const academyProgressKey = "dizyacademy-progress-v3";

export function readAcademyProgress(storage: Pick<Storage, "getItem">) {
  try {
    const values = [
      "dizyschool-progress-v1",
      "dizyschool-progress-v2",
      academyProgressKey,
    ].flatMap((key) => {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    });
    return [...new Set(values.filter((slug): slug is string =>
      typeof slug === "string" && academyLessons.some((lesson) => lesson.slug === slug),
    ))];
  } catch {
    return [];
  }
}

export function writeAcademyProgress(
  storage: Pick<Storage, "setItem">,
  completed: string[],
) {
  storage.setItem(
    academyProgressKey,
    JSON.stringify([...new Set(completed.filter((slug) =>
      academyLessons.some((lesson) => lesson.slug === slug),
    ))]),
  );
}

export function filterAcademyLessons(query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return academyLessons;
  return academyLessons.filter((lesson) => [
    lesson.title,
    lesson.summary,
    lesson.group,
    ...lesson.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...(section.bullets ?? []),
    ]),
  ].join(" ").toLocaleLowerCase().includes(term));
}
