export type CommandCategory =
  | "Navigate"
  | "Terminal tools"
  | "Operations"
  | "Session"
  | "Help";

export type CommandAction =
  | Readonly<{ type: "navigate"; href: string }>
  | Readonly<{
      type: "launcher";
      launcher: "dizybrain" | "manual-paper" | "layouts" | "start-here";
    }>
  | Readonly<{ type: "reload" }>
  | Readonly<{ type: "reference" }>;

export type CommandDefinition = Readonly<{
  id: string;
  title: string;
  description: string;
  category: CommandCategory;
  keywords: readonly string[];
  action: CommandAction;
  ownerOnly?: boolean;
}>;

export const COMMAND_PALETTE_SHORTCUT = "Ctrl/Cmd + K";
export const KEYBOARD_REFERENCE_SHORTCUT = "?";

export const COMMAND_PALETTE_COMMANDS: readonly CommandDefinition[] = Object.freeze([
  Object.freeze({
    id: "navigate-terminal",
    title: "Open DizyCharts",
    description: "Return to the live charting and research terminal.",
    category: "Navigate" as const,
    keywords: Object.freeze(["terminal", "chart", "market", "price"]),
    action: Object.freeze({ type: "navigate" as const, href: "/terminal" }),
  }),
  Object.freeze({
    id: "navigate-scanner",
    title: "Open DizyScanner",
    description: "Scan the bounded market universe using confirmed candles.",
    category: "Navigate" as const,
    keywords: Object.freeze(["scanner", "symbols", "markets", "confluence"]),
    action: Object.freeze({ type: "navigate" as const, href: "/scanner" }),
  }),
  Object.freeze({
    id: "navigate-structure",
    title: "Open DizyStructure",
    description: "Review sessions, anchored VWAP and timeframe structure.",
    category: "Navigate" as const,
    keywords: Object.freeze(["structure", "vwap", "sessions", "swings"]),
    action: Object.freeze({ type: "navigate" as const, href: "/structure" }),
  }),
  Object.freeze({
    id: "navigate-performance",
    title: "Open DizyPerformance",
    description: "Review realised P/L, drawdown, expectancy and breakdowns.",
    category: "Navigate" as const,
    keywords: Object.freeze(["performance", "pnl", "drawdown", "expectancy"]),
    action: Object.freeze({ type: "navigate" as const, href: "/performance" }),
  }),
  Object.freeze({
    id: "navigate-journal",
    title: "Open DizyJournal",
    description: "Review retained trades, notes, tags and evidence.",
    category: "Navigate" as const,
    keywords: Object.freeze(["journal", "trades", "notes", "review"]),
    action: Object.freeze({ type: "navigate" as const, href: "/journal" }),
  }),
  Object.freeze({
    id: "navigate-academy",
    title: "Open DizyAcademy",
    description: "Open the current-product learning curriculum.",
    category: "Navigate" as const,
    keywords: Object.freeze(["academy", "school", "learn", "education"]),
    action: Object.freeze({ type: "navigate" as const, href: "/school" }),
  }),
  Object.freeze({
    id: "navigate-backup",
    title: "Open DizyBackup",
    description: "Export or dry-run additive account recovery.",
    category: "Operations" as const,
    keywords: Object.freeze(["backup", "export", "restore", "recovery"]),
    action: Object.freeze({ type: "navigate" as const, href: "/backup" }),
    ownerOnly: true,
  }),
  Object.freeze({
    id: "navigate-ops",
    title: "Open DizyOps",
    description: "Open owner-only production diagnostics.",
    category: "Operations" as const,
    keywords: Object.freeze(["ops", "diagnostics", "health", "production"]),
    action: Object.freeze({ type: "navigate" as const, href: "/diagnostics" }),
    ownerOnly: true,
  }),
  Object.freeze({
    id: "launch-dizybrain",
    title: "Open DizyBrain",
    description: "Explain the current deterministic market evidence.",
    category: "Terminal tools" as const,
    keywords: Object.freeze(["brain", "explain", "reasoning", "signal"]),
    action: Object.freeze({ type: "launcher" as const, launcher: "dizybrain" as const }),
  }),
  Object.freeze({
    id: "launch-manual-paper",
    title: "Open Manual Paper",
    description: "Open the simulation-only manual order ticket.",
    category: "Terminal tools" as const,
    keywords: Object.freeze(["paper", "simulation", "trade", "ticket"]),
    action: Object.freeze({ type: "launcher" as const, launcher: "manual-paper" as const }),
  }),
  Object.freeze({
    id: "launch-layouts",
    title: "Open saved layouts",
    description: "Save or apply a complete named terminal workspace.",
    category: "Terminal tools" as const,
    keywords: Object.freeze(["layouts", "workspace", "preset", "save"]),
    action: Object.freeze({ type: "launcher" as const, launcher: "layouts" as const }),
    ownerOnly: true,
  }),
  Object.freeze({
    id: "launch-start-here",
    title: "Open Start Here",
    description: "Reopen the beginner-first DizyTrades guide.",
    category: "Help" as const,
    keywords: Object.freeze(["start", "onboarding", "guide", "beginner"]),
    action: Object.freeze({ type: "launcher" as const, launcher: "start-here" as const }),
  }),
  Object.freeze({
    id: "reload-workspace",
    title: "Reload current workspace",
    description: "Reload this page and request fresh public data.",
    category: "Session" as const,
    keywords: Object.freeze(["reload", "refresh", "retry", "data"]),
    action: Object.freeze({ type: "reload" as const }),
  }),
  Object.freeze({
    id: "keyboard-reference",
    title: "Open keyboard reference",
    description: "Show verified palette, focus and DizyFlow DOM controls.",
    category: "Help" as const,
    keywords: Object.freeze(["keyboard", "shortcuts", "keys", "help"]),
    action: Object.freeze({ type: "reference" as const }),
  }),
]);

const searchable = (command: CommandDefinition) =>
  `${command.title} ${command.description} ${command.category} ${command.keywords.join(" ")}`.toLocaleLowerCase();

export function availablePaletteCommands(owner: boolean) {
  return COMMAND_PALETTE_COMMANDS.filter((command) => owner || !command.ownerOnly);
}

export function filterPaletteCommands(
  commands: readonly CommandDefinition[],
  query: string,
) {
  const tokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return [...commands];
  return commands.filter((command) => {
    const text = searchable(command);
    return tokens.every((token) => text.includes(token));
  });
}

export const KEYBOARD_REFERENCE = Object.freeze([
  Object.freeze({ keys: "Ctrl/Cmd + K", action: "Open the command palette" }),
  Object.freeze({ keys: "?", action: "Open this keyboard reference" }),
  Object.freeze({ keys: "↑ / ↓", action: "Move through command results" }),
  Object.freeze({ keys: "Enter", action: "Run the selected command" }),
  Object.freeze({ keys: "Escape", action: "Close the palette or reference" }),
  Object.freeze({ keys: "Tab / Shift + Tab", action: "Move through interactive controls" }),
  Object.freeze({ keys: "DOM: ↑ / ↓", action: "Move through the visible order-book ladder" }),
  Object.freeze({ keys: "DOM: PgUp / PgDn", action: "Move one visible DOM page" }),
  Object.freeze({ keys: "DOM: Home / End", action: "Move to the first or last retained DOM row" }),
  Object.freeze({ keys: "DOM: Escape", action: "Return the DOM to automatic midpoint centring" }),
]);
