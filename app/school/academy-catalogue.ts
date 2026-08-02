import {
  academyGlossary as existingGlossary,
  academyLessonGroups as existingGroups,
  academyLessons as existingLessons,
  type AcademyGroup,
  type AcademyLesson,
} from "./academy-extension";

export type CurrentAcademyGroup = AcademyGroup | "Current DizyTrades Workflow";
export type CurrentAcademyLesson = Omit<AcademyLesson, "group"> & {
  group: CurrentAcademyGroup;
};

const workflowLessons: CurrentAcademyLesson[] = [
  {
    slug: "dizy-workflow-overview",
    title: "The complete DizyTrades research loop",
    group: "Current DizyTrades Workflow",
    summary: "Move from market discovery to context, simulation, replay, review and measurable improvement.",
    diagram: "flow",
    sections: [
      {
        heading: "One connected evidence chain",
        paragraphs: [
          "DizyTrades is designed as a connected workflow rather than a collection of unrelated panels. DizyScanner finds candidates, DizyStructure establishes closed-candle context, DizyCharts and DizySignals organise the setup, DizyPaper simulates execution, and Journal, Replay, DizyBrain Behaviour and DizyPerformance support review.",
        ],
        bullets: [
          "Discovery is not confirmation.",
          "Structure is context, not a prediction.",
          "A signal is evidence that configured rules qualified after candle close.",
          "A profitable outcome does not prove the process was good.",
        ],
      },
      {
        heading: "Recommended order",
        paragraphs: [
          "Begin with the broadest decision and narrow it deliberately: choose a market, inspect structure, verify evidence, define invalidation and size, simulate, then review the exact historical context. Skipping directly to the result removes the information needed to improve the process.",
        ],
      },
    ],
    chartQuery: "workflow",
  },
  {
    slug: "dizyscanner-watchlists",
    title: "DizyScanner and saved watchlists",
    group: "Current DizyTrades Workflow",
    summary: "Use bounded multi-symbol scanning without treating a setup score as profit probability.",
    diagram: "flow",
    sections: [
      {
        heading: "What the scanner measures",
        paragraphs: [
          "DizyScanner reuses the same confirmed-candle DizySignals engine used by the terminal. It shows setup direction, long and short evidence, phase, signal age and available confluence across a bounded market list.",
        ],
        bullets: [
          "Sort to prioritise investigation, not to automate conviction.",
          "Freshness describes when evidence qualified; it does not forecast duration.",
          "Unavailable candle history must remain unavailable rather than becoming a neutral score.",
        ],
      },
      {
        heading: "Practical watchlist workflow",
        paragraphs: [
          "Keep a small watchlist of liquid markets you understand. Filter by timeframe and minimum evidence, open promising rows in DizyCharts, and reject candidates whose spread, liquidity, structure or invalidation is unsuitable.",
        ],
      },
    ],
    chartQuery: "scanner",
  },
  {
    slug: "dizystructure-workspace",
    title: "DizyStructure: sessions, anchored VWAP and alignment",
    group: "Current DizyTrades Workflow",
    summary: "Read session levels, anchored value and confirmed swing structure using explicit evidence boundaries.",
    diagram: "levels",
    sections: [
      {
        heading: "Descriptive market structure",
        paragraphs: [
          "DizyStructure combines confirmed swing state, UTC session levels, opening ranges, previous-day and previous-week references, anchored VWAP and multi-timeframe DizySignals alignment. These tools describe location and agreement; they do not identify hidden intent.",
        ],
        bullets: [
          "An opening range is complete only when every required candle exists.",
          "Previous-period levels require the exact preceding UTC period.",
          "A swing pivot is confirmed only after its right-side candles close.",
          "Alignment counts only timeframes with available analysis.",
        ],
      },
      {
        heading: "Anchoring responsibly",
        paragraphs: [
          "An anchored VWAP answers a question about average traded value from a chosen event or structural point. Change the anchor only when the analytical question changes, not until the line agrees with the desired trade.",
        ],
      },
    ],
    chartQuery: "structure",
  },
  {
    slug: "dizyreplay-historical-flow",
    title: "DizyReplay and Historical DizyFlow",
    group: "Current DizyTrades Workflow",
    summary: "Reconstruct decisions candle by candle without contaminating history with current live evidence.",
    diagram: "flow",
    sections: [
      {
        heading: "Replay without future leakage",
        paragraphs: [
          "Replay reveals only the candle prefix available at the selected cursor. DizySignals and DizyBrain rebuild from that prefix, so analysis lines and explanations appear as their required evidence becomes available.",
        ],
        bullets: [
          "Play, pause, step and speed changes advance one authoritative replay clock.",
          "The chart follows the newest revealed candle while preserving the horizontal zoom span.",
          "The forming future and later completed candles must never influence the current replay step.",
        ],
      },
      {
        heading: "Historical flow limitations",
        paragraphs: [
          "Historical DizyFlow is shown only where retained samples and events exist for the trade. It selects prior-or-exact evidence within a strict age boundary and never substitutes current DOM, depth or trade activity for missing history.",
        ],
      },
    ],
    chartQuery: "replay",
  },
  {
    slug: "guided-trade-review",
    title: "Guided Historical Trade Review",
    group: "Current DizyTrades Workflow",
    summary: "Review context, entry, management and exit while separating process quality from outcome.",
    diagram: "journal",
    sections: [
      {
        heading: "The five review stages",
        paragraphs: [
          "Guided Review organises the existing immutable Journal trade, Replay reference, Historical DizyFlow evidence and DizyBrain Review into Context, Entry, Management, Exit and Reflection. It writes a clearly marked block into the same Journal notes rather than creating another score.",
        ],
        bullets: [
          "Describe the evidence that existed at the time.",
          "State whether the setup met the planned rules.",
          "Compare management decisions with the original plan.",
          "Record one process strength and one specific improvement.",
        ],
      },
      {
        heading: "Avoid hindsight editing",
        paragraphs: [
          "Do not rewrite the original thesis to match the result. The purpose is to compare the decision with the evidence available then, including unavailable or conflicting evidence, not to produce a perfect retrospective story.",
        ],
      },
    ],
    chartQuery: "journal",
  },
  {
    slug: "dizyperformance-dashboard",
    title: "DizyPerformance: expectancy, drawdown and coverage",
    group: "Current DizyTrades Workflow",
    summary: "Interpret realised Journal outcomes honestly, including sample size and missing-data coverage.",
    diagram: "expectancy",
    sections: [
      {
        heading: "What the dashboard represents",
        paragraphs: [
          "DizyPerformance uses immutable completed Trade Reviews to calculate cumulative realised PnL, drawdown, expectancy, profit factor, payoff ratio, streaks, fees coverage, R distribution and deterministic breakdowns. The cumulative reviewed PnL line is not labelled account equity because the starting account balance may be unknown.",
        ],
        bullets: [
          "Win rate requires payoff context.",
          "Profit factor is unstable in tiny samples.",
          "Missing fees or R values reduce coverage rather than becoming zero.",
          "Breakdowns describe the reviewed sample and do not prove causation.",
        ],
      },
    ],
    chartQuery: "performance",
  },
  {
    slug: "dizybrain-behaviour",
    title: "DizyBrain Behaviour: recurring process observations",
    group: "Current DizyTrades Workflow",
    summary: "Use repeated reviewed trades to identify process patterns without turning correlation into prediction.",
    diagram: "psychology",
    sections: [
      {
        heading: "Behaviour is review aggregation",
        paragraphs: [
          "The Behaviour engine aggregates existing deterministic DizyBrain historical reviews. It reports coverage, recurring findings, process-versus-outcome patterns, moods, tags, execution distributions and time trends without rerunning a trade or predicting the next result.",
        ],
        bullets: [
          "A recurring observation needs a meaningful sample.",
          "Archived, stale or invalid reviews are excluded and counted in diagnostics.",
          "Observed association is not proof that a mood or tag caused an outcome.",
          "Behaviour findings do not alter DizySignals or risk settings.",
        ],
      },
    ],
    chartQuery: "behaviour",
  },
  {
    slug: "dizyops-diagnostics",
    title: "DizyOps: production health and evidence freshness",
    group: "Current DizyTrades Workflow",
    summary: "Distinguish a healthy application from a healthy external feed and diagnose degraded states safely.",
    diagram: "flow",
    sections: [
      {
        heading: "Operational status is layered",
        paragraphs: [
          "DizyOps reports bounded deployment, runtime, storage and audit information. A healthy web process does not guarantee every public provider is fresh, and a delayed market feed does not necessarily mean account storage is unavailable.",
        ],
        bullets: [
          "Check deployed commit and build identity.",
          "Separate application health from provider freshness.",
          "Treat storage warnings as recovery risks, not market signals.",
          "Live execution remains disabled regardless of operational health.",
        ],
      },
    ],
  },
  {
    slug: "dizybackup-recovery",
    title: "DizyBackup: export, dry-run and additive recovery",
    group: "Current DizyTrades Workflow",
    summary: "Protect user-owned evidence with integrity-checked exports and conflict-aware recovery.",
    diagram: "journal",
    sections: [
      {
        heading: "What a backup contains",
        paragraphs: [
          "A full owner-scoped JSON backup can include profile settings, simulator history, Manual Paper, Journal entries, Replay memories, Historical DizyFlow references and DizyBrain reviews. Authentication records, credentials, session tokens and live-execution secrets are excluded.",
        ],
        bullets: [
          "Journal CSV is intended for portable outcome analysis.",
          "Every restore begins with a server-validated dry-run.",
          "Integrity hashes prevent applying a different payload from the one reviewed.",
          "Recovery is additive and refuses unsafe Manual Paper replacement.",
        ],
      },
      {
        heading: "Recovery discipline",
        paragraphs: [
          "Keep dated backups outside the Render persistent disk. Review conflicts and warnings before typing the explicit restore confirmation. A successful download is not a tested recovery until the dry-run validator can read it.",
        ],
      },
    ],
  },
];

export const academyLessons: CurrentAcademyLesson[] = [
  ...existingLessons,
  ...workflowLessons,
];

export const academyLessonGroups: CurrentAcademyGroup[] = [
  ...existingGroups,
  "Current DizyTrades Workflow",
];

export const academyGlossary = [
  ...existingGlossary,
  ["Additive recovery", "A restore process that preserves existing records and adds only validated non-conflicting data."],
  ["Evidence coverage", "The proportion of a reviewed sample for which a metric has authoritative source data."],
  ["Historical DizyFlow", "Compact retained order-flow evidence captured around an eligible completed simulated trade."],
  ["Replay prefix", "Only the candles revealed up to the current historical replay cursor."],
  ["Setup score", "A descriptive count or weighting of available configured evidence, not a probability of profit."],
] as const;

export const academyProgressKey = "dizyacademy-progress-v3";

export function readAcademyProgress(storage: Pick<Storage, "getItem">) {
  try {
    const keys = [
      "dizyschool-progress-v1",
      "dizyschool-progress-v2",
      academyProgressKey,
    ];
    const values = keys.flatMap((key) => {
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
